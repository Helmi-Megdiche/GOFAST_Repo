import { beforeEach, describe, expect, it } from "vitest";
import { readJson, useMemoryStorage, writeJson } from "../storage";
import { consumeFailNext } from "./mock-db";

beforeEach(() => {
  useMemoryStorage();
});

describe("consumeFailNext", () => {
  it("is true once after the key is set, then false", () => {
    writeJson("fg.mock.failNext:x", true);
    expect(consumeFailNext("x")).toBe(true);
    expect(readJson("fg.mock.failNext:x")).toBeNull();
    expect(consumeFailNext("x")).toBe(false);
  });

  it("is false when nothing was set, and does not touch other operations", () => {
    writeJson("fg.mock.failNext:y", true);
    expect(consumeFailNext("x")).toBe(false);
    expect(readJson("fg.mock.failNext:y")).toBe(true);
  });
});
