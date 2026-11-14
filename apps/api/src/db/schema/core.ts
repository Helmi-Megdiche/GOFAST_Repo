import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  check,
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
