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
};

/** Every route of the client and merchant spaces (umbrella parts A to F); PR 0 builds the two homes. */
export const SPACE_NAV: Record<"customer" | "merchant", NavEntry[]> = {
  customer: [
    { key: "home", href: "/compte", ready: true },
    { key: "orders", href: "/compte/commandes", ready: true },
    { key: "invoices", href: "/compte/factures", ready: false },
    { key: "claims", href: "/compte/reclamations", ready: false },
    { key: "addresses", href: "/compte/adresses", ready: false },
    { key: "profile", href: "/compte/profil", ready: false },
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

/** The entries a person sees: ready ones, and for a role-restricted entry only an allowed role. */
export function visibleNav(kind: "customer" | "merchant", role: "admin" | "user" | null) {
  return SPACE_NAV[kind].filter(
    (entry) => entry.ready && (!entry.roles || (role !== null && entry.roles.includes(role))),
  );
}
