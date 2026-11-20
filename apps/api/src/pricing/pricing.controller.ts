import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { Operation } from "../http/operation.ts";
import {
  type CatalogOut,
  type Ctx,
  PricingService,
  type QuoteOut,
  type QuoteRequest,
  type ZoneCheckOut,
  type ZoneCheckRequest,
} from "./pricing.service.ts";

const ctxOf = (req: FastifyRequest): Ctx => ({ ip: req.ip, requestId: String(req.id) });

/** The four public routes of issue #10. The guard has already checked the body against the contract. */
@Controller("v1")
export class PricingController {
  constructor(@Inject(PricingService) private readonly pricing: PricingService) {}

  @Get("services")
  @HttpCode(200)
  @Operation("listServices")
  listServices(): Promise<CatalogOut> {
    return this.pricing.listServices();
  }

  @Post("zone-checks")
  @HttpCode(200)
  @Operation("createZoneCheck")
  createZoneCheck(@Body() body: ZoneCheckRequest, @Req() req: FastifyRequest): Promise<ZoneCheckOut> {
    return this.pricing.createZoneCheck(body, ctxOf(req));
  }

  @Post("quotes")
  @HttpCode(201)
  @Operation("createQuote")
  createQuote(@Body() body: QuoteRequest, @Req() req: FastifyRequest): Promise<QuoteOut> {
    return this.pricing.createQuote(body, ctxOf(req));
  }

  @Get("quotes/:id")
  @HttpCode(200)
  @Operation("getQuote")
  getQuote(@Param("id") id: string): Promise<QuoteOut> {
    return this.pricing.getQuote(id);
  }
}
