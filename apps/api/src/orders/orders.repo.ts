import { Logger } from "@nestjs/common";
import { isStorableTimestamp } from "@fastgo/domain";
import { sql, type SQL } from "drizzle-orm";
import type { Db, Tx } from "../db/index.ts";
import { ApiError } from "../http/errors.ts";
import type { Actor } from "../http/session.ts";
import { PricingRepo } from "../pricing/pricing.repo.ts";
import type { ReadQuote, Settings } from "../pricing/pricing.service.ts";
import {
  type AccountRow,
  type CancelDecision,
  type CancelResultOut,
  type ListQuery,
  type LockedOrder,
  type OrderListOut,
  type OrderOut,
  type OrderPlan,
  type OrdersPort,
  ScopeTaken,
  type TrackingOut,
} from "./orders.service.ts";

type Raw = Record<string, unknown>;
const int = (v: unknown): number => Number(v);
const iso = (v: unknown): string => new Date(v as string | Date).toISOString();

/** The constraint a unique_violation names (the driver wraps the pg error in `cause`). */
const constraintOf = (error: unknown): string | undefined => {
  const e = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  const code = e.cause?.code ?? e.code;
  return code === "23505" ? (e.cause?.constraint ?? e.constraint ?? "") : undefined;
};

/**
 * A CHECK violation (23514) on the order row. The service refuses a bad slot first (R503), so no request reaches this: if one does, a
 * rule is missing in the service. It is a logged 500 (the constraint name only, no data), never a 4xx and never silent.
 */
const checkViolationOf = (error: unknown): string | undefined => {
  const e = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  return (e.cause?.code ?? e.code) === "23514" ? (e.cause?.constraint ?? e.constraint ?? "") : undefined;
};

/** What a definer raises, as the API's own error: not found, not allowed, a lost race or a deadlock the database broke (a retry would do). */
export const definerErrorOf = (error: unknown): ApiError | undefined => {
  const e = error as { code?: string; cause?: { code?: string } };
  const code = e.cause?.code ?? e.code;
  if (code === "P0002") return new ApiError("NOT_FOUND");
  if (code === "42501") return new ApiError("ACCESS_DENIED");
  if (code === "40001" || code === "40P01") return new ApiError("STATE_CONFLICT");
  // cancel_order refuses a final state (a second cancel never overwrites the first): the same answer as the service's own check
  if (code === "55000") return new ApiError("STATE_CONFLICT", [{ name: "status", reason: "notCancellable" }]);
  return undefined;
};

const ORDER_COLUMNS = sql`
  o.id, o.tracking_number, o.status, o.service, o.payment_mode, o.freight_payer, o.total_millimes, o.lines,
  o.created_at, o.canceled_at, o.cancel_fee, to_char(o.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_cursor,
  o.sender_name, o.sender_phone, o.address_unconfirmed,
  coalesce(o.departure_zone_id, pa.zone_id) as departure_zone_id, coalesce(o.arrival_zone_id, ra.zone_id) as arrival_zone_id,
  dz.name as departure_zone_name, az.name as arrival_zone_name,
  pa.line as pickup_line, r.name as recipient_name, r.phone_e164 as recipient_phone, ra.line as recipient_line`;
const ORDER_JOINS = sql`
  from core.orders o
  left join core.addresses pa on pa.id = o.pickup_address_id
  left join core.recipients r on r.id = o.recipient_id
  left join core.addresses ra on ra.id = r.address_id
  left join core.zones dz on dz.id = coalesce(o.departure_zone_id, pa.zone_id)
  left join core.zones az on az.id = coalesce(o.arrival_zone_id, ra.zone_id)`;

/** The reads and writes of the order module. Every call runs under the actor, so the RLS decides who sees what. */
export class OrdersRepo implements OrdersPort {
  private readonly pricing: PricingRepo;
  constructor(private readonly db: Db) {
    this.pricing = new PricingRepo(db);
  }

  private run<T>(actor: Actor | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return actor ? this.db.withActor(actor, fn) : this.db.withNoActor(fn);
  }

  async findByScope(actor: Actor, scope: string): Promise<{ order: OrderOut; bodyHash: string | null } | null> {
    return this.run(actor, async (tx) => {
      const order = (await this.read(tx, sql`o.idempotency_scope = ${scope}`))[0];
      if (!order) return null;
      const hash = (await tx.execute(sql`select idempotency_body_hash as h from core.orders where id = ${order.id}::uuid`)).rows[0] as Raw | undefined;
      return { order: stripCursor(order), bodyHash: (hash?.h as string | null | undefined) ?? null };
    });
  }

  async readQuote(actor: Actor, id: string): Promise<ReadQuote | null> {
    return this.run(actor, (tx) => this.pricing.readQuote(tx, id));
  }

  async settings(actor: Actor): Promise<Settings> {
    return this.run(actor, (tx) => this.pricing.settingsRow(tx));
  }

  async readAccount(actor: Actor): Promise<AccountRow | null> {
    return this.run(actor, async (tx) => {
      const r = await tx.execute(
        sql`select status, phone_e164, phone_verified_at from core.accounts where id = ${actor.userId}::uuid`,
      );
      const a = (r.rows as Raw[])[0];
      return a
        ? { status: a.status as string, phone: (a.phone_e164 as string | null) ?? null, phoneVerified: a.phone_verified_at != null }
        : null;
    });
  }

  // ---- create -----------------------------------------------------------------------------------------------

  async insert(plan: OrderPlan): Promise<OrderOut> {
    const { actor, body, quote, at } = plan;
    const owner = actor.role === "merchant" ? { account: null, company: actor.accountId } : { account: actor.userId, company: null };
    return this.run(actor, async (tx) => {
      const address = async (a: { text: string; landmark?: string; pin?: { x: number; y: number } | null }, zoneId: string, archived: boolean) => {
        const point = a.pin
          ? sql`public.ST_SetSRID(public.ST_MakePoint(${a.pin.x}, ${a.pin.y}), 4326)::public.geography`
          : sql`null`;
        const r = await tx.execute(
          sql`insert into core.addresses (owner_account_id, owner_company_id, line, landmark, location, zone_id, archived_at)
              values (${owner.account}::uuid, ${owner.company}::uuid, ${a.text}, ${a.landmark ?? ""}, ${point}, ${zoneId}::uuid,
                      ${archived ? sql`now()` : sql`null`})
              returning id`,
        );
        return (r.rows as Raw[])[0]!.id as string;
      };
      // An unsaved recipient (and its address) is kept for the order but archived at once, so it never shows in the
      // address book (supervisor Q4); the erasure of R105 covers it.
      const keep = body.recipient.save === true;
      const pickupId = await address(body.sender.address, quote.departureZoneId, false);
      const deliveryId = await address(body.recipient.address, quote.arrivalZoneId, !keep);
      const recipient = await tx.execute(
        sql`insert into core.recipients (owner_account_id, owner_company_id, name, phone_e164, address_id, locale, archived_at)
            values (${owner.account}::uuid, ${owner.company}::uuid, ${body.recipient.name}, ${body.recipient.phone}, ${deliveryId}::uuid,
                    ${body.recipient.sms_locale ?? "fr"}, ${keep ? sql`null` : sql`now()`})
            returning id`,
      );
      const recipientId = (recipient.rows as Raw[])[0]!.id as string;

      const delivery = body.service.slot ?? null;
      const { id: orderId, tracking } = await this.insertOrder(tx, plan, owner, pickupId, recipientId, delivery);
      const values = body.parcel.parcels.map(
        (p, i) =>
          sql`(${orderId}::uuid, ${i + 1}, ${`${tracking}-${i + 1}`}, ${body.parcel.type}, ${p.weight_g}, ${plan.proofLevel})`,
      );
      await tx.execute(
        sql`insert into core.parcels (order_id, position, barcode, size, weight_declared_g, proof_level) values ${sql.join(values, sql`, `)}`,
      );
      await tx.execute(sql`select core.record_order_created(${orderId}::uuid)`);
      if (plan.markPhoneVerified) {
        await tx.execute(sql`select core.mark_phone_verified(${actor.userId}::uuid, ${at.toISOString()}::timestamptz)`);
      }
      // The SMS is written as a template key, the order and the language: no phone, no number, no text (R105, R903).
      const payload = { template: "tracking", order_id: orderId, locale: body.recipient.sms_locale ?? "fr" };
      await tx.execute(sql`insert into core.outbox (topic, payload) values ('sms.tracking', ${JSON.stringify(payload)}::jsonb)`);
      // R209: the API decides under the lock (the domain rule), the definer only compares and sets (the system, no actor).
      if (plan.autoConfirm(await this.lock(tx, orderId, "creator"))) {
        await tx.execute(sql`select core.auto_confirm_order(${orderId}::uuid, ${at.toISOString()}::timestamptz)`);
      }
      return (await this.read(tx, sql`o.id = ${orderId}::uuid`))[0]!;
    });
  }

  /** The order row. A collision on the tracking number rolls back to the savepoint and draws another (R203). */
  private async insertOrder(
    tx: Tx,
    plan: OrderPlan,
    owner: { account: string | null; company: string | null },
    pickupId: string,
    recipientId: string,
    delivery: { start_at: string; end_at: string } | null,
  ): Promise<{ id: string; tracking: string }> {
    const { actor, body, quote, at } = plan;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        // An explicit SAVEPOINT: `tx.transaction()` of this `Tx` would be a second BEGIN and COMMIT, and the identity
        // of the actor (transaction-local settings) would be lost.
        await tx.execute(sql`savepoint order_row`);
        try {
          const r = await tx.execute(
            sql`insert into core.orders (tracking_number, owner_account_id, owner_company_id, created_by, idempotency_scope,
                  service, payment_mode, freight_payer, recipient_locale, total_millimes, pickup_address_id, recipient_id,
                  quote_id, lines, null_lines, price_list_valid_from, departure_zone_id, arrival_zone_id, address_unconfirmed,
                  sender_name, sender_phone, pickup_slot_start, pickup_slot_end, delivery_slot_start, delivery_slot_end,
                  delivery_instructions, content, fragile, packaging, declared_value_millimes, freight_payer_accepted,
                  terms_accepted_at, idempotency_body_hash)
                values (${plan.newTrackingNumber()}, ${owner.account}::uuid, ${owner.company}::uuid, ${actor.userId}::uuid, ${plan.scope},
                  ${quote.service}, ${body.payment_mode}, ${plan.freightPayer}, ${body.recipient.sms_locale ?? "fr"},
                  ${quote.totalMillimes}, ${pickupId}::uuid, ${recipientId}::uuid,
                  ${quote.id}::uuid, ${JSON.stringify(quote.lines)}::jsonb, ${sql.raw("array[")}${sql.join(plan.nullLines.map((k) => sql`${k}`), sql`, `)}${sql.raw("]::text[]")},
                  ${quote.priceListValidFrom.toISOString()}::timestamptz, ${quote.departureZoneId}::uuid, ${quote.arrivalZoneId}::uuid,
                  ${plan.addressUnconfirmed}, ${body.sender.name}, ${body.sender.phone},
                  ${body.sender.slot.start_at}::timestamptz, ${body.sender.slot.end_at}::timestamptz,
                  ${delivery ? sql`${delivery.start_at}::timestamptz` : sql`null`}, ${delivery ? sql`${delivery.end_at}::timestamptz` : sql`null`},
                  ${body.recipient.instructions ?? ""}, ${body.parcel.content}, ${quote.fragile}, ${quote.packaging},
                  ${quote.declaredValueMillimes}, ${body.freight_payer_accepted ?? false}, ${at.toISOString()}::timestamptz,
                  ${plan.scope ? plan.bodyHash : null})
                returning id, tracking_number`,
          );
          const row = (r.rows as Raw[])[0]!;
          await tx.execute(sql`release savepoint order_row`);
          return { id: row.id as string, tracking: row.tracking_number as string };
        } catch (error) {
          await tx.execute(sql`rollback to savepoint order_row`);
          throw error;
        }
      } catch (error) {
        const check = checkViolationOf(error);
        if (check !== undefined) {
          new Logger("orders").error(`CHECK ${check || "(unnamed)"} refused an order row that the service let through: a rule is missing before the insert`);
          throw new ApiError("INTERNAL_ERROR");
        }
        const constraint = constraintOf(error);
        if (constraint === undefined) throw error;
        if (/idempotency_scope/.test(constraint)) throw new ScopeTaken();
        if (!/tracking_number/.test(constraint)) throw error;
        // a tracking number already used: the savepoint is rolled back, draw another
      }
    }
    throw new Error("no free tracking number after 5 draws");
  }

  // ---- read -------------------------------------------------------------------------------------------------

  /** Orders and their parcels, the parcels of the whole page in one query (no N+1). */
  private async read(tx: Tx, where: SQL, tail: SQL = sql`order by o.created_at desc, o.id desc`): Promise<(OrderOut & { cursor: string })[]> {
    const rows = (await tx.execute(sql`select ${ORDER_COLUMNS} ${ORDER_JOINS} where ${where} ${tail}`)).rows as Raw[];
    if (rows.length === 0) return [];
    const ids = sql.join(rows.map((r) => sql`${r.id as string}::uuid`), sql`, `);
    const parcels = (
      await tx.execute(
        sql`select id, order_id, position, barcode, size, weight_declared_g, status, attempts from core.parcels
             where order_id in (${ids}) order by order_id, position nulls last, created_at, id`,
      )
    ).rows as Raw[];
    const by = new Map<string, Raw[]>();
    for (const p of parcels) by.set(p.order_id as string, [...(by.get(p.order_id as string) ?? []), p]);
    return rows.map((r) => ({ ...toOrder(r, by.get(r.id as string) ?? []), cursor: `${r.created_cursor as string}|${r.id as string}` }));
  }

  async get(actor: Actor, id: string): Promise<OrderOut | null> {
    return this.run(actor, async (tx) => {
      const order = (await this.read(tx, sql`o.id = ${id}::uuid`))[0];
      return order ? stripCursor(order) : null;
    });
  }

  async list(actor: Actor, q: ListQuery): Promise<OrderListOut | "badCursor"> {
    const conds: SQL[] = [sql`true`];
    if (q.status?.length) conds.push(sql`o.status in (${sql.join(q.status.map((s) => sql`${s}`), sql`, `)})`);
    if (q.from) conds.push(sql`o.created_at >= (${q.from}::date)::timestamp at time zone 'UTC'`);
    if (q.to) conds.push(sql`o.created_at < ((${q.to}::date + 1)::timestamp at time zone 'UTC')`);
    if (q.tracking) conds.push(sql`o.tracking_number = ${q.tracking}`);
    if (q.cursor) {
      const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z)\|([0-9a-f-]{36})$/.exec(Buffer.from(q.cursor, "base64url").toString("utf8"));
      if (!m || !isStorableTimestamp(m[1]!)) return "badCursor"; // a pattern is not a date: 2026-13-45 or year 0000 would be a 500 from the cast
      conds.push(sql`(o.created_at, o.id) < (${m[1]}::timestamptz, ${m[2]}::uuid)`);
    }
    return this.run(actor, async (tx) => {
      const rows = await this.read(tx, sql.join(conds, sql` and `), sql`order by o.created_at desc, o.id desc limit ${q.limit + 1}`);
      const items = rows.slice(0, q.limit);
      const last = items[items.length - 1];
      return {
        items: items.map(stripCursor),
        next_cursor: rows.length > q.limit && last ? Buffer.from(last.cursor, "utf8").toString("base64url") : null,
      };
    });
  }

  // ---- cancel and confirm (4b-2b) ---------------------------------------------------------------------------------------

  /** `core.lock_order`: the checks of who asks, the lock (order, then missions), and the facts. Plus the two settings. */
  private async lock(tx: Tx, id: string, mode: "cancel" | "confirm" | "creator"): Promise<LockedOrder> {
    const r = await tx.execute(sql`select core.lock_order(${id}::uuid, ${mode}) as f`);
    const f = (r.rows as Raw[])[0]!.f as Raw;
    const s = ((await tx.execute(sql`select cancel_fee_millimes, auto_confirm_max_millimes from core.pricing_settings`)).rows as Raw[])[0]!;
    return {
      status: f.status as LockedOrder["status"],
      totalMillimes: int(f.total_millimes),
      addressUnconfirmed: Boolean(f.address_unconfirmed),
      lines: f.lines as LockedOrder["lines"],
      pickupArrivedAt: (f.pickup_arrived_at as string | null) ?? null,
      cancelFee: (f.cancel_fee as LockedOrder["cancelFee"]) ?? null,
      cancelFeeMillimes: f.cancel_fee_millimes == null ? null : int(f.cancel_fee_millimes),
      canceledAt: (f.canceled_at as string | null) ?? null,
      settings: { cancelFeeMillimes: int(s.cancel_fee_millimes), autoConfirmMaxMillimes: int(s.auto_confirm_max_millimes) },
    };
  }

  async cancel(actor: Actor, id: string, decide: (f: LockedOrder) => CancelDecision, now: () => Date): Promise<CancelResultOut> {
    return this.definer(() =>
      this.run(actor, async (tx) => {
        const decision = decide(await this.lock(tx, id, "cancel"));
        if (decision.kind === "replay") return { status: "canceled" as const, fee: decision.fee };
        await tx.execute(
          sql`select core.cancel_order(${id}::uuid, ${decision.expectedStatus}, ${decision.fee}, ${decision.feeMillimes}::bigint, ${now().toISOString()}::timestamptz)`, // the clock is read after the lock (R406)
        );
        return { status: "canceled" as const, fee: decision.fee };
      }),
    );
  }

  async confirm(actor: Actor, id: string, decide: (f: LockedOrder) => "replay" | "confirm", now: () => Date): Promise<OrderOut> {
    return this.definer(() =>
      this.run(actor, async (tx) => {
        if (decide(await this.lock(tx, id, "confirm")) === "confirm") {
          await tx.execute(sql`select core.confirm_order(${id}::uuid, ${now().toISOString()}::timestamptz)`);
        }
        return stripCursor((await this.read(tx, sql`o.id = ${id}::uuid`))[0]!);
      }),
    );
  }

  /** The refusals of the definers, as the API's own: not found, not allowed, a lost race (the state moved). */
  private async definer<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      throw definerErrorOf(error) ?? error;
    }
  }

  async tracking(number: string, locale: "fr" | "ar" | "en"): Promise<TrackingOut | null> {
    return this.run(null, async (tx) => {
      const r = await tx.execute(sql`select core.tracking(${number}, ${locale}) as t`);
      return ((r.rows as Raw[])[0]?.t as TrackingOut | null) ?? null;
    });
  }
}

const stripCursor = ({ cursor: _cursor, ...order }: OrderOut & { cursor: string }): OrderOut => order;

/** The contract's Order from a row and its parcels. The money is integer millimes. */
function toOrder(r: Raw, parcels: Raw[]): OrderOut {
  const zone = (id: unknown, name: unknown) => ({ zone_id: id as string, zone_name: (name as string | null) ?? "" });
  return {
    id: r.id as string,
    tracking_number: r.tracking_number as string,
    status: r.status as OrderOut["status"],
    service: r.service as OrderOut["service"],
    payment_mode: r.payment_mode as OrderOut["payment_mode"],
    freight_payer: r.freight_payer as OrderOut["freight_payer"],
    total_millimes: int(r.total_millimes),
    lines: (r.lines as OrderOut["lines"] | null) ?? [],
    created_at: iso(r.created_at),
    eta_at: null,
    address_unconfirmed: Boolean(r.address_unconfirmed),
    departure: zone(r.departure_zone_id, r.departure_zone_name),
    arrival: zone(r.arrival_zone_id, r.arrival_zone_name),
    sender: {
      name: (r.sender_name as string | null) ?? null,
      phone: (r.sender_phone as string | null) ?? null,
      address: (r.pickup_line as string | null) ?? null,
      city: (r.departure_zone_name as string | null) ?? null,
    },
    recipient: {
      name: (r.recipient_name as string | null) ?? null,
      phone: (r.recipient_phone as string | null) ?? null,
      address: (r.recipient_line as string | null) ?? null,
      city: (r.arrival_zone_name as string | null) ?? null,
    },
    parcels: parcels.map((p, i) => ({
      id: p.id as string,
      index: p.position == null ? i + 1 : int(p.position),
      barcode: (p.barcode as string | null) ?? "",
      type: p.size as OrderOut["parcels"][number]["type"],
      weight_declared_g: int(p.weight_declared_g),
      status: p.status as OrderOut["parcels"][number]["status"],
      attempts: int(p.attempts),
    })),
    loss_reported: parcels.some((p) => p.status === "lost"),
    cancel: r.canceled_at ? { at: iso(r.canceled_at), fee: r.cancel_fee as NonNullable<OrderOut["cancel"]>["fee"] } : null,
  };
}
