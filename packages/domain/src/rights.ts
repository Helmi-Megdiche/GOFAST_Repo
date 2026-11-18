// The rights of the internal teams: cahier des charges, "Rôles et droits", pages 49 to 54. The matrix DR01 to DR36 (pages 51 and 52) is
// copied cell by cell; rights.test.ts requires it to equal `rights.cahier.txt`, the 36 lines extracted from the PDF.
// D = décide ou valide, G = gère, A = agit dans son travail, V = voit, "–" = aucun accès (the server answers 403). The server checks the
// rights on every action; this file is for the screens (what a role is offered) and for T29, which calls the API for each cell.

export type Right = "D" | "G" | "A" | "V" | "–";

/** The columns, in the order of the cahier. RH (gestionnaire RH) arrives with L2: it is in the matrix for T29, not a back-office role. */
export const RIGHT_COLUMNS = ["Dir", "Ops", "Agt", "Log", "SC", "Cpt", "Cai", "Adm", "RH"] as const;
export type RightColumn = (typeof RIGHT_COLUMNS)[number];

/** The roles of the back-office, as the API names them (`core.accounts.role`). A driver signs in to the driver app, never here (p.54). */
export const BACKOFFICE_ROLES = [
  "management",
  "operations",
  "agent",
  "logistics",
  "customer_service",
  "accountant",
  "cashier",
  "admin",
] as const;
export type BackofficeRole = (typeof BACKOFFICE_ROLES)[number];

/** Direction, Responsable des opérations, Agent de commandes, Responsable logistique, Service client, Comptable, Caissier, Administrateur. */
export const ROLE_OF_COLUMN: Readonly<Record<Exclude<RightColumn, "RH">, BackofficeRole>> = {
  Dir: "management",
  Ops: "operations",
  Agt: "agent",
  Log: "logistics",
  SC: "customer_service",
  Cpt: "accountant",
  Cai: "cashier",
  Adm: "admin",
};

type Cells = readonly [Right, Right, Right, Right, Right, Right, Right, Right, Right];

export const RIGHTS = {
  DR01: ["V", "V", "V", "V", "V", "–", "–", "V", "–"],
  DR02: ["V", "V", "–", "–", "–", "V", "–", "V", "–"],
  DR03: ["–", "V", "V", "V", "V", "–", "–", "V", "–"],
  DR04: ["–", "G", "G", "–", "–", "–", "–", "G", "–"],
  DR05: ["–", "G", "G", "–", "–", "–", "–", "G", "–"],
  DR06: ["–", "G", "G", "A", "–", "–", "–", "G", "–"],
  DR07: ["–", "V", "V", "V", "–", "–", "–", "V", "–"],
  DR08: ["–", "G", "–", "G", "–", "–", "–", "G", "–"],
  DR09: ["–", "V", "V", "V", "V", "–", "–", "V", "–"],
  DR10: ["–", "G", "G", "G", "–", "–", "–", "G", "–"],
  DR11: ["–", "D", "A", "A", "–", "–", "–", "–", "–"],
  DR12: ["V", "V", "V", "–", "V", "V", "–", "V", "–"],
  DR13: ["–", "G", "A", "–", "–", "–", "–", "G", "–"],
  DR14: ["V", "V", "–", "–", "–", "V", "–", "V", "–"],
  DR15: ["–", "G", "–", "–", "–", "–", "–", "G", "–"],
  DR16: ["–", "D", "–", "–", "–", "–", "–", "–", "–"],
  DR17: ["D", "–", "–", "–", "–", "–", "–", "–", "–"],
  DR18: ["V", "A", "–", "A", "–", "–", "–", "G", "–"],
  DR19: ["V", "V", "–", "G", "–", "–", "–", "G", "–"],
  DR20: ["–", "–", "–", "G", "–", "–", "–", "G", "–"],
  DR21: ["V", "G", "A", "V", "G", "V", "–", "G", "–"],
  DR22: ["–", "–", "–", "–", "A", "–", "–", "–", "–"],
  DR23: ["–", "D", "–", "–", "–", "–", "–", "–", "–"],
  DR24: ["–", "–", "–", "–", "–", "A", "–", "–", "–"],
  DR25: ["V", "V", "–", "–", "V", "G", "–", "V", "–"],
  DR26: ["–", "–", "–", "–", "–", "G", "–", "–", "–"],
  DR27: ["V", "V", "–", "V", "–", "V", "V", "–", "–"],
  DR28: ["–", "–", "–", "–", "–", "–", "A", "–", "–"],
  DR29: ["D", "–", "–", "–", "–", "D", "–", "–", "–"],
  DR30: ["V", "V", "–", "–", "–", "G", "–", "V", "–"],
  DR31: ["V", "V", "A", "A", "A", "A", "–", "G", "G"],
  DR32: ["G", "G", "V", "V", "V", "G", "–", "G", "–"],
  DR33: ["–", "–", "–", "–", "–", "–", "–", "G", "–"],
  DR34: ["D", "–", "–", "–", "–", "–", "–", "A", "–"],
  DR35: ["V", "–", "–", "–", "–", "–", "–", "V", "–"],
  DR36: ["V", "–", "–", "–", "–", "–", "–", "–", "G"],
} as const satisfies Record<string, Cells>;
export type RightRow = keyof typeof RIGHTS;

export function isBackofficeRole(role: string | null | undefined): role is BackofficeRole {
  return typeof role === "string" && (BACKOFFICE_ROLES as readonly string[]).includes(role);
}

const COLUMN_OF_ROLE = Object.fromEntries(
  (Object.entries(ROLE_OF_COLUMN) as [Exclude<RightColumn, "RH">, BackofficeRole][]).map(([column, role]) => [role, RIGHT_COLUMNS.indexOf(column)]),
) as Record<BackofficeRole, number>;

/** The cell of a role on a row: "–" means no access. */
export function rightOf(role: BackofficeRole, row: RightRow): Right {
  return RIGHTS[row][COLUMN_OF_ROLE[role]] as Right;
}

/** True when the role has anything but a dash on at least one of the rows. */
export function hasAccess(role: BackofficeRole, rows: readonly RightRow[]): boolean {
  return rows.some((row) => rightOf(role, row) !== "–");
}
