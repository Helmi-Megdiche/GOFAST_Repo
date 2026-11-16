import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApp } from "../app.ts";
import { PricingController } from "./pricing.controller.ts";
import { PricingService } from "./pricing.service.ts";

// Schemathesis (contract.int.test.ts) found it: a path parameter longer than Fastify's default limit (100)
// is answered 414 FST_ERR_MAX_PARAM_LENGTH before the guard runs, a status the contract does not document.
let app: NestFastifyApplication;
beforeAll(async () => {
  app = await createApp({ trustProxy: false }, {
    controllers: [PricingController],
    providers: [{ provide: PricingService, useValue: {} }],
  });
});
afterAll(() => app.close());

describe("an over-long path parameter", () => {
  it.each([150, 600, 5000])("GET /v1/quotes/{id} with %i characters is a 400 with the shared error body, never a 414", async (n) => {
    const res = await app.inject({ method: "GET", url: `/v1/quotes/${"a".repeat(n)}` });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(res.json().error.trace_id).toBeTruthy();
  });
});
