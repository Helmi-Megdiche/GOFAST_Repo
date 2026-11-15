import { getTableColumns, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  check,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Typed view of the tables. The SQL files in `migrations/` are the source of truth (RLS, roles,
 * triggers and PostGIS live there only); a test compares this file with the migrated database.
 */
export const core = pgSchema("core");

/** PostGIS `geography`, read and written as EWKT text by the queries that need it. */
const geography = (name: string, shape: string) =>
  customType<{ data: string }>({ dataType: () => `geography(${shape}, 4326)` })(name);

/** Money in millimes. A `bigint` read as a JS number: 2^53 millimes is far above any amount. */
export const millimes = (name: string) => bigint(name, { mode: "number" });

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const zones = core.table("zones", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  area: geography("area", "MultiPolygon"),
  active: boolean("active").notNull().default(true),
});

export const services = core.table("services", {
  code: text("code").primaryKey(),
  active: boolean("active").notNull().default(true),
});

export const prices = core.table(
  "prices",
  {
    serviceCode: text("service_code")
      .notNull()
      .references(() => services.code),
    withPackaging: boolean("with_packaging").notNull(),
    millimes: millimes("millimes"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.serviceCode, t.withPackaging] })],
);

export const accounts = core.table("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  role: text("role").notNull(),
  fullName: text("full_name"),
  phoneE164: text("phone_e164").unique(),
  phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
  email: text("email"),
  googleSub: text("google_sub").unique(),
  passwordHash: text("password_hash"),
  locale: text("locale").notNull().default("fr"),
  status: text("status").notNull().default("active"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const companies = core.table("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  legalName: text("legal_name").notNull(),
  taxNumber: text("tax_number"),
  billingAddressId: uuid("billing_address_id"),
  status: text("status").notNull().default("active"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const companyMembers = core.table(
  "company_members",
  {
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    role: text("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.accountId] })],
);

export const addresses = core.table(
  "addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerAccountId: uuid("owner_account_id").references(() => accounts.id),
    ownerCompanyId: uuid("owner_company_id").references(() => companies.id),
    label: text("label"),
    line: text("line").notNull(),
    landmark: text("landmark").notNull().default(""),
    location: geography("location", "Point"),
    zoneId: uuid("zone_id").references(() => zones.id),
    isPickupPoint: boolean("is_pickup_point").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  () => [check("addresses_one_owner", sql`num_nonnulls(owner_account_id, owner_company_id) = 1`)],
);

export const recipients = core.table("recipients", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerAccountId: uuid("owner_account_id").references(() => accounts.id),
  ownerCompanyId: uuid("owner_company_id").references(() => companies.id),
  name: text("name").notNull(),
  phoneE164: text("phone_e164").notNull(),
  addressId: uuid("address_id").references(() => addresses.id),
  locale: text("locale").notNull().default("fr"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
});

const tstz = (name: string) => timestamp(name, { withTimezone: true });

export const orders = core.table("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  trackingNumber: text("tracking_number").notNull().unique(),
  ownerAccountId: uuid("owner_account_id").references(() => accounts.id),
  ownerCompanyId: uuid("owner_company_id").references(() => companies.id),
  createdBy: uuid("created_by").references(() => accounts.id),
  idempotencyScope: text("idempotency_scope").unique(),
  service: text("service").notNull(),
  paymentMode: text("payment_mode").notNull(),
  freightPayer: text("freight_payer").notNull(),
  recipientLocale: text("recipient_locale").notNull().default("fr"),
  status: text("status").notNull().default("received"),
  totalMillimes: millimes("total_millimes").notNull(),
  pickupAddressId: uuid("pickup_address_id")
    .notNull()
    .references(() => addresses.id),
  recipientId: uuid("recipient_id")
    .notNull()
    .references(() => recipients.id),
  createdAt: createdAt(),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
});

export const parcels = core.table("parcels", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id),
  barcode: text("barcode").unique(),
  size: text("size").notNull(),
  weightDeclaredG: integer("weight_declared_g").notNull(),
  weightMeasuredG: integer("weight_measured_g"),
  declaredValueMillimes: millimes("declared_value_millimes").notNull().default(0),
  codMillimes: millimes("cod_millimes").notNull().default(0),
  proofLevel: text("proof_level").notNull(),
  attempts: integer("attempts").notNull().default(0),
  status: text("status").notNull().default("to_collect"),
  createdAt: createdAt(),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
});

export const missions = core.table("missions", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id),
  driverId: uuid("driver_id").references(() => accounts.id),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("proposed"),
  endReason: text("end_reason"),
  offeredAt: tstz("offered_at").notNull().defaultNow(),
  expiresAt: tstz("expires_at"),
  arrivedAt: tstz("arrived_at"),
  finishedAt: tstz("finished_at"),
  createdAt: createdAt(),
});

export const statusEvents = core.table("status_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().unique().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id),
  subjectType: text("subject_type").notNull(),
  subjectId: uuid("subject_id").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  actorId: uuid("actor_id").references(() => accounts.id),
  occurredAt: tstz("occurred_at").notNull().defaultNow(),
  receivedAt: tstz("received_at").notNull().defaultNow(),
  location: geography("location", "Point"),
});

export const proofs = core.table("proofs", {
  id: uuid("id").primaryKey().defaultRandom(),
  parcelId: uuid("parcel_id")
    .notNull()
    .references(() => parcels.id),
  kind: text("kind").notNull(),
  codeVerified: boolean("code_verified").notNull().default(false),
  capturedAt: tstz("captured_at").notNull().defaultNow(),
  location: geography("location", "Point"),
  fileId: text("file_id"),
  validatedBy: uuid("validated_by").references(() => accounts.id),
  createdAt: createdAt(),
});

export const deliveryCodes = core.table("delivery_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  parcelId: uuid("parcel_id")
    .notNull()
    .unique()
    .references(() => parcels.id),
  codeHash: text("code_hash").notNull(),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  expiresAt: tstz("expires_at").notNull(),
  createdAt: createdAt(),
});

export const recipientLinks = core.table("recipient_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id),
  tokenHash: text("token_hash").notNull().unique(),
  locale: text("locale").notNull().default("fr"),
  expiresAt: tstz("expires_at").notNull(),
  createdAt: createdAt(),
});

/**
 * The app login cannot read a `*_hash` column, so `select().from(accounts)` and `.returning()` (which
 * list every column) fail as `fastgo_app`. Query code uses these column sets instead:
 * `tx.select(accountColumns).from(accounts)`, `.returning(deliveryCodeColumns)`.
 */
function withoutHashes<T extends Record<string, { name: string }>, K extends keyof T>(
  columns: T,
  ...hashes: K[]
): Omit<T, K> {
  const drop = new Set<PropertyKey>(hashes);
  return Object.fromEntries(Object.entries(columns).filter(([key]) => !drop.has(key))) as Omit<T, K>;
}
export const accountColumns = withoutHashes(getTableColumns(accounts), "passwordHash");
export const deliveryCodeColumns = withoutHashes(getTableColumns(deliveryCodes), "codeHash");
export const recipientLinkColumns = withoutHashes(getTableColumns(recipientLinks), "tokenHash");

export const outbox = core.table("outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  topic: text("topic").notNull(),
  payload: jsonb("payload").notNull().default({}),
  createdAt: createdAt(),
  attempts: integer("attempts").notNull().default(0),
  processedAt: tstz("processed_at"),
});

export const tickets = core.table("tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").references(() => orders.id),
  openedBy: uuid("opened_by")
    .notNull()
    .references(() => accounts.id),
  category: text("category").notNull(),
  status: text("status").notNull().default("open"),
  closedAt: tstz("closed_at"),
  archivedAt: tstz("archived_at"),
  createdAt: createdAt(),
});

export const ticketMessages = core.table("ticket_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  ticketId: uuid("ticket_id")
    .notNull()
    .references(() => tickets.id),
  authorId: uuid("author_id")
    .notNull()
    .references(() => accounts.id),
  body: text("body").notNull(),
  isInternal: boolean("is_internal").notNull().default(false),
  createdAt: createdAt(),
});
