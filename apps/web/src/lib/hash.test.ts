import { describe, expect, it } from "vitest";
import { digest } from "./hash";

describe("digest", () => {
  it("is stable, hex, and holds no readable part of its input", () => {
    const text = '{"sender":{"name":"Zorro Testname","phone":"+21620000000"}}';
    expect(digest(text)).toBe(digest(text));
    expect(digest(text)).toMatch(/^[0-9a-f]{28}$/);
    expect(digest(text)).not.toContain("Zorro");
  });

  it("differs for inputs that differ by one character", () => {
    expect(digest('{"a":"1"}')).not.toBe(digest('{"a":"2"}'));
    expect(digest("")).not.toBe(digest(" "));
  });
});
