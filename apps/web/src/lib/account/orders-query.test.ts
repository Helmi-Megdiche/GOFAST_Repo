import { describe, expect, it } from "vitest";
import { parseOrdersQuery, ordersQueryToParams } from "./orders-query";

const parse = (search: string) => parseOrdersQuery(new URLSearchParams(search));

describe("C02 query", () => {
  it("reads the filter, month, search and page", () => {
    expect(parse("statut=en-cours&mois=2026-10&q=Nadia&page=2")).toEqual({
      filter: "inProgress",
      month: "2026-10",
      q: "Nadia",
      page: 2,
    });
    expect(parse("statut=livrees").filter).toBe("delivered");
    expect(parse("statut=echecs").filter).toBe("failed");
  });

  it("falls back to the default for anything unreadable", () => {
    expect(parse("")).toEqual({ filter: "all", month: null, q: "", page: 1 });
    expect(parse("statut=canceled&mois=2026-13&page=0")).toEqual({
      filter: "all",
      month: null,
      q: "",
      page: 1,
    });
    expect(parse("mois=2026-1&page=1.5&q=%20%20").page).toBe(1);
    expect(parse("page=abc").page).toBe(1);
    expect(parse("page=-3").page).toBe(1);
    expect(parse("page=99999999").page).toBe(9999);
    expect(parse(`q=${"x".repeat(200)}`).q).toHaveLength(60);
  });

  it("writes a clean URL: defaults are left out, and it reads back the same", () => {
    expect(ordersQueryToParams({ filter: "all", month: null, q: "", page: 1 })).toEqual({});
    const query = { filter: "failed", month: "2026-11", q: "Omar", page: 3 } as const;
    const params = ordersQueryToParams(query);
    expect(params).toEqual({ statut: "echecs", mois: "2026-11", q: "Omar", page: "3" });
    expect(parse(new URLSearchParams(params).toString())).toEqual(query);
  });
});
