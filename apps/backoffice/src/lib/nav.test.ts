import { describe, expect, it } from "vitest";
import { BACKOFFICE_ROLES, RIGHTS, hasAccess, rightOf, type BackofficeRole, type RightRow } from "@fastgo/domain";
import { LANDING, NAV_GROUPS, NAV_ITEMS, canOpen, groupsFor, itemOfSlug, landingSlug, pathOf, visibleItems } from "./nav";

// GH-25 25b T29 DR01-DR35: the navigation of each role, from the cahier's matrix and nothing else. The screens themselves are #26 and later.

const SLUGS = [
  "tableau-de-bord", "direction", "a-confirmer", "dispatch", "commandes", "colis", "incidents", "tournees", "clients", "livreurs",
  "reclamations", "caisses", "factures", "reglements", "reversements", "comptabilite", "contrats", "zones", "flotte", "documents",
  "rapports", "utilisateurs", "journal", "parametres",
];
const ids = (role: BackofficeRole) => visibleItems(role).map((i) => i.id);

describe("the sidebar of the mockup: 6 groups, 24 items, in order", () => {
  it("has the 24 slugs in the mockup order, grouped 2, 6, 3, 5, 5, 3", () => {
    expect(NAV_ITEMS.map((i) => i.slug)).toEqual(SLUGS);
    expect(NAV_GROUPS.map((g) => [g.key, g.items.length])).toEqual([
      ["pilotage", 2],
      ["exploitation", 6],
      ["relation", 3],
      ["finance", 5],
      ["gestion", 5],
      ["administration", 3],
    ]);
  });
  it("A26 (RH et gains) has no item: the HR role is L2", () => {
    expect(NAV_ITEMS.some((i) => i.id === "A26")).toBe(false);
  });
  it("every item cites at least one DR row, and the rows exist", () => {
    for (const item of NAV_ITEMS) {
      expect(item.rows.length, item.id).toBeGreaterThan(0);
      for (const row of item.rows) expect(Object.keys(RIGHTS), `${item.id} ${row}`).toContain(row);
    }
  });
  it("every row DR01 to DR35 is used by a screen; DR36 (RH, L2) by none", () => {
    const used = new Set<RightRow>(NAV_ITEMS.flatMap((i) => [...i.rows]));
    const all = Object.keys(RIGHTS) as RightRow[];
    expect(all.filter((r) => !used.has(r))).toEqual(["DR36"]);
  });
  it("the action rows are on the screens the senior named", () => {
    const rowsOf = (id: string) => NAV_ITEMS.find((i) => i.id === id)?.rows ?? [];
    for (const r of ["DR04", "DR06"]) expect(rowsOf("A02")).toContain(r);
    for (const r of ["DR10", "DR11"]) for (const a of ["A08", "A09"]) expect(rowsOf(a)).toContain(r);
    expect(rowsOf("A10")).toContain("DR13");
    for (const r of ["DR15", "DR16", "DR17"]) expect(rowsOf("A25")).toContain(r);
    expect(rowsOf("A12")).toContain("DR20");
    for (const r of ["DR22", "DR23", "DR24"]) expect(rowsOf("A15")).toContain(r);
    expect(rowsOf("A22")).toContain("DR29");
    expect(rowsOf("A33")).toContain("DR34");
  });
});

describe("what each role sees: anything but a dash on one of the item's rows", () => {
  it.each([
    ["management", 16],
    ["operations", 20],
    ["agent", 11],
    ["logistics", 13],
    ["customer_service", 9],
    ["accountant", 11],
    ["cashier", 1],
    ["admin", 22],
  ] as const)("%s sees %i items", (role, count) => {
    expect(visibleItems(role)).toHaveLength(count);
  });

  it("is exactly the matrix: an item is visible iff a listed row is not a dash, for every role and every item", () => {
    for (const role of BACKOFFICE_ROLES)
      for (const item of NAV_ITEMS) expect(canOpen(role, item.slug), `${role} ${item.id}`).toBe(item.rows.some((r) => rightOf(role, r) !== "–"));
  });

  it("the hidden items of each role (the API's 403 for the same rows)", () => {
    const hidden = (role: BackofficeRole) => NAV_ITEMS.filter((i) => !ids(role).includes(i.id)).map((i) => i.id);
    expect(hidden("management")).toEqual(["A05", "A06", "A02", "A08", "A09", "A07", "A21", "A31"]);
    expect(hidden("operations")).toEqual(["A21", "A31", "A32", "A33"]);
    expect(hidden("customer_service")).toEqual(["A30", "A05", "A06", "A07", "A12", "A22", "A21", "A23", "A24", "A25", "A17", "A27", "A31", "A32", "A33"]);
    expect(hidden("accountant")).toEqual(["A01", "A05", "A06", "A02", "A08", "A09", "A07", "A12", "A17", "A27", "A31", "A32", "A33"]);
  });

  it("Admin is not a superuser: it never sees A21 Règlements or A22 Caisses (DR26 to DR29 are dashes)", () => {
    expect(ids("admin")).not.toContain("A21");
    expect(ids("admin")).not.toContain("A22");
    expect(hasAccess("admin", ["DR27", "DR28", "DR29", "DR26"])).toBe(false);
  });

  it("the cashier sees the cash desks and nothing else (DR27 and DR28)", () => {
    expect(ids("cashier")).toEqual(["A22"]);
  });

  it("only the accountant sees A21 Règlements (DR26)", () => {
    expect(BACKOFFICE_ROLES.filter((r) => ids(r).includes("A21"))).toEqual(["accountant"]);
  });

  it("groupsFor hides a group with no visible item, and keeps the order", () => {
    expect(groupsFor("cashier").map((g) => [g.key, g.items.map((i) => i.id)])).toEqual([["finance", ["A22"]]]);
    expect(groupsFor("admin").map((g) => g.key)).toEqual(["pilotage", "exploitation", "relation", "finance", "gestion", "administration"]);
  });
});

describe("the landing page is an explicit table, and it is visible to its role", () => {
  it("A01 for Dir, Ops, Agt, Log, SC, Adm (they have DR01); Cpt lands on A19 Factures; Cai on A22 Caisses", () => {
    expect(LANDING).toEqual({
      management: "tableau-de-bord",
      operations: "tableau-de-bord",
      agent: "tableau-de-bord",
      logistics: "tableau-de-bord",
      customer_service: "tableau-de-bord",
      accountant: "factures",
      cashier: "caisses",
      admin: "tableau-de-bord",
    });
    expect(itemOfSlug(LANDING.accountant)?.id).toBe("A19");
    expect(itemOfSlug(LANDING.cashier)?.id).toBe("A22");
  });
  it.each(BACKOFFICE_ROLES)("the landing page of %s is visible to it, and is A01 exactly when the role has DR01", (role) => {
    expect(canOpen(role, landingSlug(role))).toBe(true);
    expect(landingSlug(role) === "tableau-de-bord").toBe(rightOf(role, "DR01") !== "–");
  });
  it("pathOf gives the French slug path, whatever the language", () => {
    expect(pathOf("factures")).toBe("/factures");
    expect(pathOf(landingSlug("cashier"))).toBe("/caisses");
  });
});

describe("itemOfSlug", () => {
  it("finds an item by its slug and refuses an unknown one", () => {
    expect(itemOfSlug("dispatch")?.id).toBe("A06");
    expect(itemOfSlug("nope")).toBeUndefined();
    expect(itemOfSlug("")).toBeUndefined();
  });
});
