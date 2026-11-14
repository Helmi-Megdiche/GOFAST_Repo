import { Controller, Get, HttpCode } from "@nestjs/common";
import { Operation } from "./http/operation.ts";

@Controller("v1/health")
export class HealthController {
  @Get()
  @HttpCode(200)
  @Operation("getHealth")
  get(): { status: "ok" } {
    return { status: "ok" };
  }
}
