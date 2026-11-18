import { hasAccess, type BackofficeRole, type RightRow } from "@fastgo/domain";
import type { Messages } from "@fastgo/i18n";

// GH-25 25b: the navigation of the back-office. Which screens a role is offered comes from the cahier's matrix (DR01 to DR36, p.51 and 52)
// and nothing else: an item is shown when the role has anything but a dash on at least one of its rows; otherwise the page is "no access",
// as the API answers 403 for the same rows. The server stays the authority (it checks the rights on every action). The sidebar is the
// mockup's (docs/ui A01-Bord, admin chrome): 6 groups, 24 items. A26 (RH et gains) has no item: the HR role is L2.

export type NavGroupKey = "pilotage" | "exploitation" | "relation" | "finance" | "gestion" | "administration";
export type NavIcon = "home" | "star" | "check" | "nav" | "list" | "box" | "warn" | "gps" | "bldg" | "bike" | "msg" | "cash" | "rcpt" | "doc" | "ref" | "file" | "pin" | "truck" | "print" | "users" | "shield" | "edit";

export type NavItem = {
  /** The mockup's screen id. */
  id: string;
  /** French slug in every language, as in the web. */
  slug: string;
  /** The key under `backoffice.nav.items`, checked against the catalog. */
  label: keyof Messages["backoffice"]["nav"]["items"];
  icon: NavIcon;
  /** The rows of the matrix that govern this screen. */
  rows: readonly RightRow[];
};
export type NavGroup = { key: NavGroupKey; items: readonly NavItem[] };

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    key: "pilotage",
    items: [
      { id: "A01", slug: "tableau-de-bord", label: "tableauDeBord", icon: "home", rows: ["DR01"] },
      { id: "A30", slug: "direction", label: "direction", icon: "star", rows: ["DR02"] },
    ],
  },
  {
    key: "exploitation",
    items: [
      { id: "A05", slug: "a-confirmer", label: "aConfirmer", icon: "check", rows: ["DR05"] },
      { id: "A06", slug: "dispatch", label: "dispatch", icon: "nav", rows: ["DR07"] },
      { id: "A02", slug: "commandes", label: "commandes", icon: "list", rows: ["DR03", "DR04", "DR06"] },
      { id: "A08", slug: "colis", label: "colis", icon: "box", rows: ["DR09", "DR10", "DR11"] },
      { id: "A09", slug: "incidents", label: "incidents", icon: "warn", rows: ["DR09", "DR10", "DR11"] },
      { id: "A07", slug: "tournees", label: "tournees", icon: "gps", rows: ["DR07", "DR08"] },
    ],
  },
  {
    key: "relation",
    items: [
      { id: "A10", slug: "clients", label: "clients", icon: "bldg", rows: ["DR12", "DR13"] },
      { id: "A12", slug: "livreurs", label: "livreurs", icon: "bike", rows: ["DR19", "DR20"] },
      { id: "A15", slug: "reclamations", label: "reclamations", icon: "msg", rows: ["DR21", "DR22", "DR23", "DR24"] },
    ],
  },
  {
    key: "finance",
    items: [
      { id: "A22", slug: "caisses", label: "caisses", icon: "cash", rows: ["DR27", "DR28", "DR29"] },
      { id: "A19", slug: "factures", label: "factures", icon: "rcpt", rows: ["DR25"] },
      { id: "A21", slug: "reglements", label: "reglements", icon: "doc", rows: ["DR26"] },
      { id: "A23", slug: "reversements", label: "reversements", icon: "ref", rows: ["DR30"] },
      { id: "A24", slug: "comptabilite", label: "comptabilite", icon: "doc", rows: ["DR02"] },
    ],
  },
  {
    key: "gestion",
    items: [
      { id: "A25", slug: "contrats", label: "contrats", icon: "file", rows: ["DR14", "DR15", "DR16", "DR17"] },
      { id: "A17", slug: "zones", label: "zones", icon: "pin", rows: ["DR18"] },
      { id: "A27", slug: "flotte", label: "flotte", icon: "truck", rows: ["DR19"] },
      { id: "A28", slug: "documents", label: "documents", icon: "file", rows: ["DR31"] },
      { id: "A29", slug: "rapports", label: "rapports", icon: "print", rows: ["DR32"] },
    ],
  },
  {
    key: "administration",
    items: [
      { id: "A31", slug: "utilisateurs", label: "utilisateurs", icon: "users", rows: ["DR33"] },
      { id: "A32", slug: "journal", label: "journal", icon: "shield", rows: ["DR35"] },
      { id: "A33", slug: "parametres", label: "parametres", icon: "edit", rows: ["DR34"] },
    ],
  },
];

export const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export const itemOfSlug = (slug: string): NavItem | undefined => NAV_ITEMS.find((i) => i.slug === slug);

export const canOpen = (role: BackofficeRole, slug: string): boolean => {
  const item = itemOfSlug(slug);
  return item !== undefined && hasAccess(role, item.rows);
};

export const visibleItems = (role: BackofficeRole): NavItem[] => NAV_ITEMS.filter((i) => hasAccess(role, i.rows));

/** The sidebar of a role: the groups that keep at least one item, in the mockup's order. */
export const groupsFor = (role: BackofficeRole): { key: NavGroupKey; items: NavItem[] }[] =>
  NAV_GROUPS.map((g) => ({ key: g.key, items: g.items.filter((i) => hasAccess(role, i.rows)) })).filter((g) => g.items.length > 0);

/**
 * Where a role lands after sign-in and on "/". A01 for the roles that have DR01 (activity overview). The accountant and the cashier do
 * not (DR01 is a dash for both), so each gets its own page: the accountant the invoices (DR25 G), the cashier the cash desks (DR28 A).
 * Written out, not derived: a rule like "the first item where the role acts" would send the accountant to A22 (DR29 D).
 */
export const LANDING: Readonly<Record<BackofficeRole, string>> = {
  management: "tableau-de-bord",
  operations: "tableau-de-bord",
  agent: "tableau-de-bord",
  logistics: "tableau-de-bord",
  customer_service: "tableau-de-bord",
  accountant: "factures",
  cashier: "caisses",
  admin: "tableau-de-bord",
};

export const landingSlug = (role: BackofficeRole): string => LANDING[role];

/** The path of a screen, without the language: the slugs are French in every language. */
export const pathOf = (slug: string): string => `/${slug}`;
