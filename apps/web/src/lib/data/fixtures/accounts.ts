/**
 * Fake accounts for the mock (fake names, Tunisian-format fake phones, example.tn e-mails).
 * Passwords and codes live only in these fixtures, never in the UI. Listed in apps/web/CLAUDE.md.
 */
export type FixtureAccount = {
  id: string;
  kind: "customer" | "merchant";
  name: string;
  phone: string;
  email: string | null;
  /** Merchants only (R104): "Compte client" needs a validated contract. */
  contract: "validated" | "pending" | null;
  phoneVerified: boolean;
  /**
   * Mock field, not in the cahier's data model: what a customer owes GOFAST for returned parcels
   * (millimes), for the screens that show a balance to settle. Absent means nothing is due.
   */
  returnBalanceMillimes?: number;
};

/** A person of a merchant's team (ADR-2). Signs in with their own phone and the fixture password. */
export type FixtureTeamMember = {
  userId: string;
  accountId: string;
  name: string;
  phone: string;
  role: "admin" | "user";
};

export const FIXTURE_TEAM_MEMBERS: FixtureTeamMember[] = [
  {
    userId: "usr-yasmine-admin",
    accountId: "acc-merchant-validated",
    name: "Yasmine K.",
    phone: "+21671000011",
    role: "admin",
  },
  {
    userId: "usr-walid-user",
    accountId: "acc-merchant-validated",
    name: "Walid H.",
    phone: "+21671000012",
    role: "user",
  },
];

export const FIXTURE_PASSWORD = "fastgo-demo-2026";

export const FIXTURE_ACCOUNTS: FixtureAccount[] = [
  {
    id: "acc-customer",
    kind: "customer",
    name: "Sami T.",
    phone: "+21698000001",
    email: "sami.t@example.tn",
    contract: null,
    phoneVerified: true,
  },
  {
    id: "acc-merchant-validated",
    kind: "merchant",
    name: "Boutique Yasmine",
    phone: "+21671000001",
    email: "boutique.yasmine@example.tn",
    contract: "validated",
    phoneVerified: true,
  },
  {
    id: "acc-merchant-pending",
    kind: "merchant",
    name: "Atelier Nour",
    phone: "+21671000002",
    email: "atelier.nour@example.tn",
    contract: "pending",
    phoneVerified: true,
  },
  {
    id: "acc-customer-empty",
    kind: "customer",
    name: "Lina M.",
    phone: "+21698000003",
    email: "lina.m@example.tn",
    contract: null,
    phoneVerified: true,
  },
  {
    id: "acc-customer-other",
    kind: "customer",
    name: "Karim S.",
    phone: "+21698000004",
    email: "karim.s@example.tn",
    contract: null,
    phoneVerified: true,
  },
  {
    id: "acc-customer-return-due",
    kind: "customer",
    name: "Hana R.",
    phone: "+21698000005",
    email: "hana.r@example.tn",
    contract: null,
    phoneVerified: true,
    returnBalanceMillimes: 7000,
  },
];

/** Google accounts offered by the mock account chooser. "known" shares Sami's e-mail (R103). */
export const FIXTURE_GOOGLE_PROFILES = [
  { id: "google-new", name: "Amel B.", email: "amel.b@example.tn" },
  { id: "google-known", name: "Sami T.", email: "sami.t@example.tn" },
] as const;
export type GoogleProfileId = (typeof FIXTURE_GOOGLE_PROFILES)[number]["id"];

/**
 * The SMS / e-mail code the mock sends. The n-th code sent to a target is FIXTURE_CODES[n % 3], so
 * a new code makes the previous one wrong. Only the mock and the tests read this.
 */
export const FIXTURE_CODES = ["482615", "731904", "590286"] as const;
