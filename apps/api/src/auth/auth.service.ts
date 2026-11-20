import { sql } from "drizzle-orm";
import { CODE_LENGTH, CODE_VALIDITY_MS, PASSWORD_MIN_LENGTH, normalizePhone } from "@fastgo/domain";
import type { components } from "@fastgo/contract";
import type { Db, Tx } from "../db/index.ts";
import { ApiError } from "../http/errors.ts";
import { PROVISIONAL } from "../provisional.ts";
import type { Actor } from "../http/session.ts";
import type { Role } from "../http/spec.ts";
import { type Keys, sixDigitCode } from "./crypto.ts";
import { ipKey } from "./ip.ts";
import { SMS_TOPIC } from "./outbox-worker.ts";
import type { Passwords } from "./password.ts";
import type { PhoneChecks, Purpose } from "./phone-check.ts";
import type { RateLimiter } from "./rate-limit.ts";
import { STAFF_ROLES, type SessionStore, toActor } from "./sessions.ts";
import { decryptSecret, verifyTotp, totpStep } from "./totp.ts";

export type Me = components["schemas"]["Me"];
export type SignedIn = { me: Me; sessionId: string; staff: boolean };

const MIN = 60_000;
/** PROVISIONAL (not in the cahier): the limits below, each one per IP unless said otherwise. */
export const LIMITS = {
  signInPerIdentifier: { limit: 5, windowMs: 15 * MIN },
  signInPerIp: { limit: 20, windowMs: 15 * MIN },
  signUpPerIp: { limit: 5, windowMs: 60 * MIN },
  resetPerIp: { limit: 10, windowMs: 60 * MIN },
  codeSendPerIp: { limit: 10, windowMs: 15 * MIN },
  codeVerifyPerIp: { limit: 30, windowMs: 15 * MIN },
} as const;

type LoginRow = {
  id: string;
  role: Role;
  password_hash: string | null;
  locale: string;
  status: string;
  company_id: string | null;
  valid_from: string;
};

export type Deps = {
  db: Db;
  keys: Keys;
  passwords: Passwords;
  sessions: SessionStore;
  checks: PhoneChecks;
  limiter: RateLimiter;
  /** The key of the second-factor secrets (T60): 32 bytes. */
  totpKey: Buffer;
  now?: () => Date;
};

/** The roles of the back-office. A driver has a staff account but signs in to the driver app, never here (cahier p.54). */
const BACKOFFICE_ROLES: ReadonlySet<Role> = new Set([...STAFF_ROLES].filter((r) => r !== "driver"));
/** Used when there is no real secret to check, so the work (and the time) is the same for every refusal. */
const DUMMY_SECRET = Buffer.alloc(20, 1);
const NO_ACCOUNT = "00000000-0000-0000-0000-000000000000";

export type Ctx = { ip: string; requestId: string; locale?: string; previousSession?: string };

const secs = (ms: number) => Math.max(1, Math.ceil(ms / 1000));
const iso = (ms: number) => new Date(ms).toISOString();

export class AuthService {
  private readonly now: () => Date;
  constructor(private readonly d: Deps) {
    this.now = d.now ?? (() => new Date());
  }

  private async limit(
    scope: string,
    subject: string,
    cfg: { limit: number; windowMs: number },
  ): Promise<{ key: string; retryAfterMs: number; allowed: boolean }> {
    const key = `rl:${scope}:${this.d.keys.mac(scope, subject)}`;
    const r = await this.d.limiter.hit(key, cfg.limit, cfg.windowMs);
    return { key, retryAfterMs: r.retryAfterMs, allowed: r.allowed };
  }

  private tooMany(retryAfterMs: number): ApiError {
    return new ApiError("TOO_MANY_ATTEMPTS", [], secs(retryAfterMs));
  }

  /** No code, password, session id or raw phone goes in `details`. */
  private async audit(
    ctx: Ctx,
    action: string,
    entityId: string | null,
    details: Record<string, string | number | boolean> = {},
  ): Promise<void> {
    await this.d.db.withNoActor((tx) =>
      tx.execute(
        sql`insert into gestion.audit_events (actor_id, actor_role, action, entity, entity_id, details, request_id)
            values (null, null, ${action}, 'account', ${entityId}, ${JSON.stringify(details)}::jsonb, ${ctx.requestId})`,
      ),
    );
  }

  // ---- phone checks (R101, R102) -------------------------------------------------------------

  async sendCode(
    body: { phone: string; purpose: Purpose },
    ctx: Ctx,
  ): Promise<{ expires_at: string; resend_at: string }> {
    const ip = await this.limit("code-ip", ipKey(ctx.ip), LIMITS.codeSendPerIp);
    if (!ip.allowed) throw this.tooMany(ip.retryAfterMs);
    const phone = this.phoneOf(body.phone);
    // Q1: a reset code goes to a phone that has an account to reset, and to no other. The lookup and
    // the outbox row are the same work in both cases (and the limits are counted before it), so the
    // answer, the limits and the time do not tell which phones have an account; for an unknown phone
    // the row carries `skip` and no phone and no code, and the worker closes it without sending.
    const skip = body.purpose === "reset" && !(await this.canReset(phone));
    const code = sixDigitCode(CODE_LENGTH);
    const sent = await this.d.checks.send(phone, body.purpose, code);
    if (!sent.ok) throw this.tooMany(sent.retryAfterMs);
    // The SMS goes through the outbox; the worker sends it and then empties the payload.
    const payload = skip
      ? { kind: "code", purpose: body.purpose, skip: true }
      : { kind: "code", purpose: body.purpose, phone, code, locale: ctx.locale ?? "fr" };
    await this.d.db.withNoActor((tx) =>
      tx.execute(sql`insert into core.outbox (topic, payload) values (${SMS_TOPIC}, ${JSON.stringify(payload)}::jsonb)`),
    );
    return { expires_at: iso(sent.expiresAt), resend_at: iso(sent.resendAt) };
  }

  private async canReset(phone: string): Promise<boolean> {
    const row = (
      await this.d.db.withNoActor((tx) => tx.execute(sql`select core.can_reset_password(${phone}) as ok`))
    ).rows[0] as { ok: boolean } | undefined;
    return row?.ok === true;
  }

  async verifyCode(
    body: { phone: string; purpose: Purpose; code: string },
    ctx: Ctx,
  ): Promise<{ phone_check_id: string; valid_until: string }> {
    const ip = await this.limit("verify-ip", ipKey(ctx.ip), LIMITS.codeVerifyPerIp);
    if (!ip.allowed) throw this.tooMany(ip.retryAfterMs);
    const r = await this.d.checks.verify(this.phoneOf(body.phone), body.purpose, body.code);
    if (r.ok) return { phone_check_id: r.checkId, valid_until: iso(r.validUntil) };
    if (r.reason === "locked") throw this.tooMany(r.retryAfterMs);
    // The contract puts the number on the field (FieldError.details), never at the top of the error.
    throw new ApiError("RULE_REFUSED", [
      { name: "code", reason: r.reason, details: { attempts_left: r.attemptsLeft } },
    ]);
  }

  private phoneOf(raw: string): string {
    const phone = normalizePhone(raw);
    if (!phone) throw new ApiError("VALIDATION_FAILED", [{ name: "phone", reason: "format" }]);
    return phone;
  }

  // ---- sign-up (R101) ------------------------------------------------------------------------

  async signUp(
    body: components["schemas"]["SignUpRequest"],
    ctx: Ctx,
  ): Promise<SignedIn> {
    const ip = await this.limit("signup-ip", ipKey(ctx.ip), LIMITS.signUpPerIp);
    if (!ip.allowed) throw this.tooMany(ip.retryAfterMs);
    const phone = this.phoneOf(body.phone);
    // A too-short password is refused before the proof is spent: the person can fix it and retry.
    this.checkPassword(body.password, "password");
    // The check is used up first: a refused sign-up cannot be retried with the same proof.
    if (!(await this.d.checks.consume(body.phone_check_id, phone, "signUp"))) {
      throw new ApiError("RULE_REFUSED", [{ name: "phone_check_id", reason: "invalid" }]);
    }
    const hash = await this.d.passwords.hash(body.password);
    const role = body.kind === "merchant" ? "merchant" : "individual";
    let accountId: string;
    try {
      const rows = (
        await this.d.db.withNoActor((tx) =>
          tx.execute(
            sql`select new_account_id from core.create_account(${role}, ${body.name}, ${phone},
                ${body.email ?? null}, ${hash}, ${body.locale},
                ${body.kind === "merchant" ? body.name : null})`,
          ),
        )
      ).rows as { new_account_id: string }[];
      accountId = rows[0]?.new_account_id as string;
    } catch (error) {
      throw this.duplicate(error);
    }
    await this.d.db.withNoActor((tx) =>
      tx.execute(sql`select core.mark_phone_verified(${accountId}::uuid, ${this.now()})`),
    );
    return this.open(accountId, role);
  }

  /** R101: a taken phone or e-mail is a refusal of the rule, with the field that is taken. */
  private duplicate(error: unknown): unknown {
    const e = error as { code?: string; cause?: { code?: string; constraint?: string; detail?: string } };
    const code = e.cause?.code ?? e.code;
    if (code !== "23505") return error;
    const where = `${e.cause?.constraint ?? ""} ${e.cause?.detail ?? ""}`;
    const email = /email/i.test(where);
    return new ApiError("RULE_REFUSED", [
      { name: email ? "email" : "phone", reason: email ? "emailTaken" : "phoneTaken" },
    ]);
  }

  private checkPassword(password: string, name: string): void {
    if (password.length < PASSWORD_MIN_LENGTH) {
      throw new ApiError("RULE_REFUSED", [{ name, reason: "passwordTooShort" }]);
    }
  }

  // ---- sign-in -------------------------------------------------------------------------------

  /**
   * The limits of every password sign-in, the customer's and the back-office's alike (one counter per identifier and per IP, so the
   * two routes cannot be used to double the guesses). Counted BEFORE anything is compared, and for an identifier that has no account
   * as well as for one that has: the limit and the answer do not tell which exist.
   */
  private async throttle(
    body: { identifier: string },
    ctx: Ctx,
  ): Promise<{ subject: string; isEmail: boolean; phone: string | null; byId: { key: string }; byIp: { key: string } }> {
    const identifier = body.identifier.trim();
    const isEmail = identifier.includes("@");
    const phone = isEmail ? null : normalizePhone(identifier);
    const subject = isEmail ? identifier.toLowerCase() : (phone ?? identifier);
    const byId = await this.limit("login-id", subject, LIMITS.signInPerIdentifier);
    const byIp = await this.limit("login-ip", ipKey(ctx.ip), LIMITS.signInPerIp);
    if (!byId.allowed || !byIp.allowed) {
      // One audit row per window and subject, not one per refused call (a flood would fill the table).
      const scope = byId.allowed ? "ip" : "identifier";
      const first = await this.limit(`audit-${scope}`, scope === "ip" ? ipKey(ctx.ip) : subject, {
        limit: 1,
        windowMs: LIMITS.signInPerIdentifier.windowMs,
      });
      if (first.allowed) await this.audit(ctx, "signin.limited", null, { scope });
      throw this.tooMany(Math.max(byId.allowed ? 0 : byId.retryAfterMs, byIp.allowed ? 0 : byIp.retryAfterMs));
    }
    return { subject, isEmail, phone, byId, byIp };
  }

  private async loginRow(t: { subject: string; isEmail: boolean; phone: string | null }): Promise<LoginRow | undefined> {
    if (!t.isEmail && !t.phone) return undefined;
    return (
      await this.d.db.withNoActor((tx) =>
        tx.execute(
          sql`select id, role, password_hash, locale, status, company_id, valid_from
                from core.login_account(${t.isEmail ? null : t.phone}, ${t.isEmail ? t.subject : null})`,
        ),
      )
    ).rows[0] as LoginRow | undefined;
  }

  async signIn(body: { identifier: string; password: string }, ctx: Ctx): Promise<SignedIn> {
    const t = await this.throttle(body, ctx);
    const { byId, byIp } = t;
    const row = await this.loginRow(t);
    // T60: a staff account never signs in here, whatever its password: it uses POST /v1/staff/sessions, with a second factor.
    const usable =
      row !== undefined &&
      row.password_hash !== null &&
      row.status === "active" &&
      !STAFF_ROLES.has(row.role) &&
      toActor(row.id, row.role, row.company_id) !== null;
    // The same work for every refusal, so the time does not tell either.
    const ok =
      usable && row?.password_hash
        ? await this.d.passwords.verify(row.password_hash, body.password)
        : await this.d.passwords.verifyDummy(body.password);
    if (!ok || !row?.password_hash) {
      throw new ApiError("AUTH_REQUIRED", [{ name: "identifier", reason: "invalidCredentials" }]);
    }

    await this.d.limiter.reset(byId.key);
    await this.d.limiter.undo(byIp.key);
    if (this.d.passwords.needsRehash(row.password_hash)) {
      const fresh = await this.d.passwords.hash(body.password);
      await this.d.db.withNoActor((tx) =>
        tx.execute(sql`select core.rehash_password(${row.id}::uuid, ${row.password_hash}, ${fresh})`),
      );
    }
    // The session of the cookie the browser sent is closed: signing in again does not leave it open.
    if (ctx.previousSession) await this.d.sessions.destroy(ctx.previousSession);
    return this.open(row.id, row.role, row.valid_from);
  }

  /**
   * T60, cahier p.54: the back-office sign-in, with a second factor (TOTP). The password is checked with the same work as the customer
   * route; then the role (a customer, a merchant or a driver is the same 401), then the code over the window of steps, then the
   * compare-and-set that makes a code usable once. Every refusal is the SAME 401 `invalidCredentials`; the audit keeps the reason
   * (never the identifier, the code or the secret). The staff session lasts 12 h and does not slide (sessions.ts).
   */
  async staffSignIn(body: { identifier: string; password: string; code: string }, ctx: Ctx): Promise<SignedIn> {
    const t = await this.throttle(body, ctx);
    const { byId, byIp } = t;
    const row = await this.loginRow(t);
    const staff =
      row !== undefined && row.password_hash !== null && row.status === "active" && BACKOFFICE_ROLES.has(row.role);
    const passwordOk =
      staff && row?.password_hash
        ? await this.d.passwords.verify(row.password_hash, body.password)
        : await this.d.passwords.verifyDummy(body.password);

    // The secret and the code are always worked on, for a real account or not, so the time does not tell which refusal it was.
    // One call, whatever the refusal: it also says whether the account is locked (B1).
    const found = await this.d.db.withNoActor(async (tx) => {
      const r = await tx.execute(
        sql`select secret_enc, locked from core.staff_totp_secret(${staff && row ? row.id : NO_ACCOUNT}::uuid)`,
      );
      return r.rows[0] as { secret_enc: Buffer; locked: boolean } | undefined;
    });
    const stored = found?.secret_enc ?? null;
    const locked = found?.locked === true;
    let secret: Buffer | null = null;
    let unreadable = false;
    if (stored && staff && row) {
      try {
        secret = decryptSecret(Buffer.from(stored), this.d.totpKey, row.id);
      } catch {
        unreadable = true; // the key changed or the bytes were altered: nobody signs in, and the audit says why
      }
    }
    const nowMs = this.now().getTime();
    const step = verifyTotp(secret ?? DUMMY_SECRET, body.code, nowMs);
    const codeOk = secret !== null && step !== null;

    // The step is spent only when the password was right too, so a wrong password cannot burn a good code. A locked account
    // spends nothing (the definer refuses it as well).
    let fresh = false;
    if (passwordOk && codeOk && !locked && row && step !== null) {
      fresh = (
        (
          await this.d.db.withNoActor((tx) => tx.execute(sql`select core.staff_totp_use(${row.id}::uuid, ${step}::bigint) as ok`))
        ).rows[0] as { ok: boolean }
      ).ok;
    }

    if (!(passwordOk && codeOk && fresh) || !row) {
      const reason = !staff
        ? "account"
        : !passwordOk
          ? "password"
          : stored === null
            ? "no_enrolment"
            : locked
              ? "locked"
              : unreadable
                ? "secret"
                : !codeOk
                  ? "code"
                  : "replay";
      // B1: a wrong code after the RIGHT password, of an enrolled and not yet locked account, counts against that account (not
      // against the identifier text, which has two spellings). At the limit the account is locked until an admin resets it.
      if (reason === "code" && row) {
        const nowLocked = (
          (
            await this.d.db.withNoActor((tx) =>
              tx.execute(sql`select core.staff_totp_failed(${row.id}::uuid, ${PROVISIONAL.staffCodeFailuresBeforeLock}::integer) as locked`),
            )
          ).rows[0] as { locked: boolean }
        ).locked;
        if (nowLocked) await this.audit(ctx, "staff.signin.locked", row.id, { after: PROVISIONAL.staffCodeFailuresBeforeLock });
      }
      await this.audit(ctx, "staff.signin.refused", staff && row ? row.id : null, { reason, step: totpStep(nowMs) });
      throw new ApiError("AUTH_REQUIRED", [{ name: "identifier", reason: "invalidCredentials" }]);
    }

    await this.d.limiter.reset(byId.key);
    await this.d.limiter.undo(byIp.key);
    if (row.password_hash && this.d.passwords.needsRehash(row.password_hash)) {
      const hash = row.password_hash;
      const fresh2 = await this.d.passwords.hash(body.password);
      await this.d.db.withNoActor((tx) => tx.execute(sql`select core.rehash_password(${row.id}::uuid, ${hash}, ${fresh2})`));
    }
    if (ctx.previousSession) await this.d.sessions.destroy(ctx.previousSession);
    // M1: the audit first. If it fails, no session exists yet (a session without its audit row would live 12 h).
    await this.audit(ctx, "staff.signin", row.id, { role: row.role });
    return this.open(row.id, row.role, row.valid_from);
  }

  /** A fresh session id every time (no fixation), and the profile that goes with it. */
  private async open(accountId: string, role: Role, validFrom?: string): Promise<SignedIn> {
    const staff = STAFF_ROLES.has(role);
    const { actor, validFrom: current } = await this.actorOf(accountId);
    // Sign-in passes the value read with the hash; a new account has no earlier read, so it takes the current one.
    const sessionId = await this.d.sessions.create(accountId, staff, validFrom ?? current);
    return { me: await this.me(actor), sessionId, staff };
  }

  private async actorOf(accountId: string): Promise<{ actor: Actor; validFrom: string }> {
    const row = (
      await this.d.db.withNoActor((tx) =>
        tx.execute(sql`select role, company_id, valid_from from core.session_account(${accountId}::uuid)`),
      )
    ).rows[0] as { role: Role; company_id: string | null; valid_from: string } | undefined;
    const actor = row ? toActor(accountId, row.role, row.company_id) : null;
    if (!actor || !row) throw new ApiError("INTERNAL_ERROR");
    return { actor, validFrom: row.valid_from };
  }

  async signOut(sessionId: string): Promise<void> {
    await this.d.sessions.destroy(sessionId);
  }

  // ---- reset (R102) --------------------------------------------------------------------------

  async resetPassword(
    body: { phone: string; phone_check_id: string; new_password: string },
    ctx: Ctx,
  ): Promise<void> {
    const ip = await this.limit("reset-ip", ipKey(ctx.ip), LIMITS.resetPerIp);
    if (!ip.allowed) throw this.tooMany(ip.retryAfterMs);
    const phone = this.phoneOf(body.phone);
    // A too-short password is refused before the proof is spent: the person can fix it and retry.
    this.checkPassword(body.new_password, "new_password");
    if (!(await this.d.checks.consume(body.phone_check_id, phone, "reset"))) {
      throw new ApiError("RULE_REFUSED", [{ name: "phone_check_id", reason: "invalid" }]);
    }
    // Hashed whether or not the phone has an account: the same answer and the same time.
    const hash = await this.d.passwords.hash(body.new_password);
    const id = (
      (
        await this.d.db.withNoActor((tx) =>
          tx.execute(sql`select core.set_password(${phone}, ${hash}, ${this.now()}) as id`),
        )
      ).rows[0] as { id: string | null } | undefined
    )?.id;
    if (id) {
      const closed = await this.d.sessions.destroyAll(id);
      await this.audit(ctx, "password.reset", id, { sessions_closed: closed });
    }
  }

  // ---- the profile (ESP-02, R902) ------------------------------------------------------------

  async me(actor: Actor, tx?: Tx): Promise<Me> {
    const read = (t: Tx) =>
      t.execute(
        sql`select a.kind, a.role, a.full_name, a.phone_e164, a.phone_verified_at, a.email,
                   (a.google_sub is not null) as google, a.locale,
                   a.notify_sms, a.notify_email, a.notify_offers, m.role as member_role
              from core.accounts a
              left join core.company_members m
                     on m.account_id = a.id and m.company_id = ${actor.role === "merchant" ? actor.accountId : null}::uuid
             where a.id = ${actor.userId}::uuid`,
      );
    const r = (await (tx ? read(tx) : this.d.db.withActor(actor, read))).rows[0] as
      | {
          kind: Me["kind"];
          role: string;
          full_name: string | null;
          phone_e164: string | null;
          phone_verified_at: Date | null;
          email: string | null;
          google: boolean;
          locale: Me["locale"];
          notify_sms: boolean;
          notify_email: boolean;
          notify_offers: boolean;
          member_role: string | null;
        }
      | undefined;
    if (!r) throw new ApiError("AUTH_REQUIRED");
    return {
      account_id: actor.accountId,
      user_id: actor.userId,
      kind: r.kind,
      role: r.kind === "customer" ? null : r.kind === "merchant" ? (r.member_role ?? "user") : r.role,
      // PROVISIONAL: no column holds the contract state yet (R104 arrives with the merchant PR).
      contract: r.kind === "merchant" ? "pending" : null,
      phone_verified: r.phone_verified_at !== null,
      name: r.full_name,
      phone: r.phone_e164,
      email: r.email,
      google: r.google,
      locale: r.locale,
      notifications: { sms: r.notify_sms, email: r.notify_email, offers: r.notify_offers },
    } as Me;
  }

  async updateMe(actor: Actor, change: components["schemas"]["MeChange"]): Promise<Me> {
    return this.d.db.withActor(actor, async (tx) => {
      const set = [sql`updated_at = now()`];
      if (change.name !== undefined) set.push(sql`full_name = ${change.name}`);
      if (change.locale !== undefined) set.push(sql`locale = ${change.locale}`);
      if (change.notifications) {
        set.push(sql`notify_sms = ${change.notifications.sms}`);
        set.push(sql`notify_email = ${change.notifications.email}`);
        set.push(sql`notify_offers = ${change.notifications.offers}`);
      }
      await tx.execute(sql`update core.accounts set ${sql.join(set, sql`, `)} where id = ${actor.userId}::uuid`);
      return this.me(actor, tx);
    });
  }
}

export { CODE_VALIDITY_MS };
