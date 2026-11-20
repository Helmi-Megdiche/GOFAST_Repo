import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { Operation } from "../http/operation.ts";
import { pickLocale } from "../http/messages.ts";
import { scopeOf } from "../http/idempotency.ts";
import { PROVISIONAL } from "../provisional.ts";
import { type CancelRequestIn, type CancelResultOut, type OrderCreate, type OrderListOut, type OrderOut, OrdersService, type TrackingOut } from "./orders.service.ts";

type ListParams = { status?: string | string[]; from?: string; to?: string; tracking?: string; cursor?: string; limit?: number | string };

/** The orders of GH-22 (PR 4b-2a). The guard has already checked the role, the parameters and the body against the contract. */
@Controller("v1")
export class OrdersController {
  constructor(@Inject(OrdersService) private readonly orders: OrdersService) {}

  @Post("orders")
  @HttpCode(201)
  @Operation("createOrder")
  createOrder(@Body() body: OrderCreate, @Req() req: FastifyRequest): Promise<OrderOut> {
    return this.orders.create(req.actor!, body, { scope: scopeOf(req) });
  }

  @Get("orders")
  @HttpCode(200)
  @Operation("listOrders")
  listOrders(@Query() query: ListParams, @Req() req: FastifyRequest): Promise<OrderListOut> {
    const limit = Math.min(Math.max(Number(query.limit ?? PROVISIONAL.pageSize), 1), PROVISIONAL.maxPageSize);
    return this.orders.list(req.actor!, {
      status: query.status === undefined ? undefined : [query.status].flat(),
      from: query.from,
      to: query.to,
      tracking: query.tracking,
      cursor: query.cursor,
      limit,
    });
  }

  @Get("orders/:id")
  @HttpCode(200)
  @Operation("getOrder")
  getOrder(@Param("id") id: string, @Req() req: FastifyRequest): Promise<OrderOut> {
    return this.orders.get(req.actor!, id);
  }

  @Post("orders/:id/cancel")
  @HttpCode(200)
  @Operation("cancelOrder")
  cancelOrder(@Param("id") id: string, @Body() body: CancelRequestIn, @Req() req: FastifyRequest): Promise<CancelResultOut> {
    return this.orders.cancel(req.actor!, id, body);
  }

  @Post("orders/:id/confirm")
  @HttpCode(200)
  @Operation("confirmOrder")
  confirmOrder(@Param("id") id: string, @Req() req: FastifyRequest): Promise<OrderOut> {
    return this.orders.confirm(req.actor!, id);
  }

  @Get("tracking/:number")
  @HttpCode(200)
  @Operation("getTracking")
  getTracking(@Param("number") number: string, @Req() req: FastifyRequest): Promise<TrackingOut> {
    return this.orders.tracking(number, pickLocale(req.headers["accept-language"]), { ip: req.ip });
  }
}
