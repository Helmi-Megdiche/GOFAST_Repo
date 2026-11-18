import { describe, expect, it } from "vitest";
import cahier from "./rights.cahier.txt?raw";
import {
  BACKOFFICE_ROLES,
  RIGHTS,
  RIGHT_COLUMNS,
  ROLE_OF_COLUMN,
  hasAccess,
  isBackofficeRole,
  rightOf,
  type Right,
} from "./rights";

// GH-25 T60 T29: the rights of the internal teams (cahier "Rôles et droits", p.49 to 54, matrix DR01 to DR36 p.51 and 52).

/** The fixture is the 36 lines the cahier prints, extracted from the PDF: `DR01 V V V V V – – V –`. */
const parsed = Object.fromEntries(
  cahier
    .split("\n")
    .filter((line) => /^DR\d\d /.test(line))
    .map((line) => {
      const [row, ...cells] = line.trim().split(/\s+/);
      return [row as string, cells];
    }),
);

describe("the matrix is the cahier's, cell by cell", () => {
  it("the fixture has the 36 rows, 9 cells each, and only the five symbols of the cahier", () => {
    expect(Object.keys(parsed)).toEqual(Array.from({ length: 36 }, (_, i) => `DR${String(i + 1).padStart(2, "0")}`));
    for (const [row, cells] of Object.entries(parsed)) {
      expect(cells, row).toHaveLength(9);
      for (const c of cells) expect(["D", "G", "A", "V", "–"], `${row} ${c}`).toContain(c);
    }
  });

  it("rights.ts equals the fixture, row by row (324 cells)", () => {
    expect(Object.fromEntries(Object.entries(RIGHTS).map(([row, cells]) => [row, [...cells]]))).toEqual(parsed);
  });

  it("the columns are the cahier's, in its order", () => {
    expect([...RIGHT_COLUMNS]).toEqual(["Dir", "Ops", "Agt", "Log", "SC", "Cpt", "Cai", "Adm", "RH"]);
  });

  it("spot checks against the printed page: Admin is not a superuser; the cashier has DR27 and DR28 only", () => {
    expect(rightOf("admin", "DR17")).toBe("–"); // only Direction validates a price grid
    expect(rightOf("admin", "DR27")).toBe("–");
    expect(rightOf("admin", "DR26")).toBe("–");
    expect(rightOf("management", "DR17")).toBe("D");
    expect(rightOf("cashier", "DR27")).toBe("V");
    expect(rightOf("cashier", "DR28")).toBe("A");
    const cashier = Object.keys(RIGHTS).filter((row) => rightOf("cashier", row as keyof typeof RIGHTS) !== "–");
    expect(cashier).toEqual(["DR27", "DR28"]);
    expect(rightOf("accountant", "DR01")).toBe("–"); // the accountant and the cashier have no activity overview
    expect(rightOf("cashier", "DR01")).toBe("–");
  });

  it("the HR column exists for T29 (L2) but is not a back-office role", () => {
    expect(Object.values(RIGHTS).some((cells) => cells[8] !== "–")).toBe(true);
    expect([...BACKOFFICE_ROLES]).toHaveLength(8);
    expect(isBackofficeRole("hr")).toBe(false);
  });
});

describe("the columns map to the roles of the API", () => {
  it("Dir management, Ops operations, Agt agent, Log logistics, SC customer_service, Cpt accountant, Cai cashier, Adm admin", () => {
    expect(ROLE_OF_COLUMN).toEqual({
      Dir: "management",
      Ops: "operations",
      Agt: "agent",
      Log: "logistics",
      SC: "customer_service",
      Cpt: "accountant",
      Cai: "cashier",
      Adm: "admin",
    });
    expect([...BACKOFFICE_ROLES].sort()).toEqual(
      ["management", "operations", "agent", "logistics", "customer_service", "accountant", "cashier", "admin"].sort(),
    );
  });
});

describe("isBackofficeRole: the eight slugs only", () => {
  it.each(["management", "operations", "agent", "logistics", "customer_service", "accountant", "cashier", "admin"])("%s is a back-office role", (role) => {
    expect(isBackofficeRole(role)).toBe(true);
  });
  it.each(["driver", "hr", "individual", "merchant", "", "Admin", "root", "superuser"])("%s is not", (role) => {
    expect(isBackofficeRole(role)).toBe(false);
  });
  it("null, undefined and non-strings are not", () => {
    expect(isBackofficeRole(null)).toBe(false);
    expect(isBackofficeRole(undefined)).toBe(false);
    expect(isBackofficeRole(7 as unknown as string)).toBe(false);
  });
});

describe("hasAccess: anything but a dash on at least one of the rows", () => {
  it("is true when one listed row is not a dash, false when all are", () => {
    expect(hasAccess("cashier", ["DR27", "DR28"])).toBe(true);
    expect(hasAccess("cashier", ["DR01"])).toBe(false);
    expect(hasAccess("agent", ["DR01", "DR26"])).toBe(true);
    expect(hasAccess("agent", ["DR26"])).toBe(false);
    expect(hasAccess("agent", [])).toBe(false);
  });
  it("a value is one of the five symbols", () => {
    const all = new Set<Right>(Object.values(RIGHTS).flatMap((c) => [...c]));
    expect([...all].sort()).toEqual(["A", "D", "G", "V", "–"].sort());
  });
});
