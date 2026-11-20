export type NavKey =
  | "home"
  | "orders"
  | "invoices"
  | "claims"
  | "addresses"
  | "profile"
  | "import"
  | "cod"
  | "statements"
  | "company";

export type NavEntry = {
  key: NavKey;
  href: string;
  /** Only ready entries render: no dead link. Each later PR flips the flag of its own route. */
  ready: boolean;
  /** Merchant team roles allowed to see the entry (H5). Absent means every role. */
  roles?: ("admin" | "user")[];
  /** The `account` capability this entry needs; hidden when the api has no route for it (20-d). */
  feature?: "invoices" | "claims" | "addressBook";
};

/** Every route of the client and merchant spaces (umbrella parts A to F); PR 0 builds the two homes. */
export const SPACE_NAV: Record<"customer" | "merchant", NavEntry[]> = {
  customer: [
    { key: "home", href: "/compte", ready: true },
    { key: "orders", href: "/compte/commandes", ready: true },
    { key: "invoices", href: "/compte/factures", ready: true, feature: "invoices" },
    { key: "claims", href: "/compte/reclamations", ready: true, feature: "claims" },
    { key: "addresses", href: "/compte/adresses", ready: true, feature: "addressBook" },
    { key: "profile", href: "/compte/profil", ready: true },
  ],
  merchant: [
    { key: "home", href: "/pro", ready: true },
    { key: "orders", href: "/pro/commandes", ready: false },
    { key: "import", href: "/pro/import", ready: false },
    { key: "cod", href: "/pro/cod", ready: false, roles: ["admin"] },
    { key: "invoices", href: "/pro/factures", ready: false, roles: ["admin"] },
    { key: "statements", href: "/pro/releves", ready: false, roles: ["admin"] },
    { key: "company", href: "/pro/entreprise", ready: false, roles: ["admin"] },
  ],
};

/**
 * The entries a person sees: ready ones, for a role-restricted entry only an allowed role, and
 * (customer space) only those whose `account` capability is on. `available` is omitted when
 * everything is on.
 */
export function visibleNav(
  kind: "customer" | "merchant",
  role: "admin" | "user" | null,
  available: (feature: NonNullable<NavEntry["feature"]>) => boolean = () => true,
) {
  return SPACE_NAV[kind].filter(
    (entry) =>
      entry.ready &&
      (!entry.roles || (role !== null && entry.roles.includes(role))) &&
      (!entry.feature || available(entry.feature)),
  );
}
