import { Controller, Get, HttpException, Post } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { Operation } from "./http/operation.ts";

const boot = (controller: new () => unknown) =>
  createApp({ trustProxy: false }, { controllers: [controller as never] });

describe("boot audit: the contract is the only list of routes", () => {
  it("refuses a route without @Operation", async () => {
    @Controller("v1")
    class NoId {
      @Post("orders")
      create() {
        return {};
      }
    }
    await expect(boot(NoId)).rejects.toThrow(/NoId\.create .* has no @Operation/);
  });

  it("refuses an id that is not in the contract", async () => {
    @Controller("v1")
    class Unknown {
      @Get("x")
      @Operation("nope")
      x() {
        return {};
      }
    }
    await expect(boot(Unknown)).rejects.toThrow(/"nope"\) is not in the contract/);
  });

  it("refuses a method or path that is not the contract's (getHealth on another route)", async () => {
    @Controller("v1")
    class Wrong {
      @Post("orders")
      @Operation("getHealth")
      x() {
        return {};
      }
    }
    await expect(boot(Wrong)).rejects.toThrow(/contract says GET \/v1\/health/);
  });

  it("refuses an id bound twice", async () => {
    @Controller("v1")
    class Twice {
      @Get("me")
      @Operation("getMe")
      a() {
        return {};
      }
      @Get("me/again")
      @Operation("getMe")
      b() {
        return {};
      }
    }
    await expect(boot(Twice)).rejects.toThrow(/already bound/);
  });

  it("boots with the real health route and a matching stub", async () => {
    @Controller("v1")
    class Ok {
      @Get("me")
      @Operation("getMe")
      me() {
        return {};
      }
    }
    const app = await boot(Ok);
    await app.close();
  });
});

describe("error filter maps framework errors to contract codes", () => {
  const codes: [number, string, number][] = [
    [401, "AUTH_REQUIRED", 401],
    [403, "ACCESS_DENIED", 403],
    [409, "STATE_CONFLICT", 409],
    [429, "TOO_MANY_ATTEMPTS", 429],
    [404, "NOT_FOUND", 404],
    [422, "VALIDATION_FAILED", 400],
  ];
  it.each(codes)("HttpException %i gives %s", async (thrown, code, status) => {
    @Controller("v1")
    class Throws {
      @Get("me")
      @Operation("getMe")
      me() {
        throw new HttpException("x", thrown);
      }
    }
    // getMe is for signed-in roles: use a resolver that signs everyone in.
    const { SessionResolver } = await import("./http/session.ts");
    class Everyone extends SessionResolver {
      override async resolve() {
        return { accountId: "a", userId: "u", role: "individual" as const };
      }
    }
    const app = await createApp(
      { trustProxy: false },
      { controllers: [Throws], sessions: new Everyone() },
    );
    try {
      const r = await app.inject({
        method: "GET",
        url: "/v1/me",
        headers: { cookie: "session=x" },
      });
      expect(r.statusCode).toBe(status);
      expect(r.json().error.code).toBe(code);
    } finally {
      await app.close();
    }
  });
});

describe("own-only seam", () => {
  it("answers 404 NOT_FOUND, after the role check, when the owner check refuses", async () => {
    const { OwnerCheck, SessionResolver } = await import("./http/session.ts");
    @Controller("v1")
    class Me {
      @Post("orders")
      @Operation("createOrder")
      create() {
        return { ok: true };
      }
    }
    class Who extends SessionResolver {
      override async resolve(c: Record<string, string | undefined>) {
        return c.session ? { accountId: "a", userId: "u", role: c.session as "individual" } : null;
      }
    }
    class Never extends OwnerCheck {
      override async allows() {
        return false;
      }
    }
    const app = await createApp(
      { trustProxy: false },
      { controllers: [Me], sessions: new Who(), owners: new Never() },
    );
    try {
      const post = (cookie?: string) =>
        app.inject({
          method: "POST",
          url: "/v1/orders",
          payload: {},
          headers: cookie ? { cookie } : {},
        });
      expect((await post()).statusCode).toBe(401);
      expect((await post("session=driver")).statusCode).toBe(403);
      expect((await post("session=individual")).statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
