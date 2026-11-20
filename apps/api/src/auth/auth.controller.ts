import { Body, Controller, Delete, Get, HttpCode, Inject, Patch, Post, Req, Res } from "@nestjs/common";
import type { components } from "@fastgo/contract";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Operation } from "../http/operation.ts";
import { AuthService, type Ctx, type SignedIn } from "./auth.service.ts";
import { type CsrfOptions, CSRF_OPTIONS } from "./csrf.ts";
import { sessionCookieOptions } from "./sessions.ts";

type Schemas = components["schemas"];

const localeOf = (req: FastifyRequest): string => {
  const first = String(req.headers["accept-language"] ?? "")
    .split(",")[0]
    ?.trim()
    .slice(0, 2)
    .toLowerCase();
  return first === "ar" || first === "en" ? first : "fr";
};

const ctxOf = (req: FastifyRequest): Ctx => ({ ip: req.ip, requestId: String(req.id), locale: localeOf(req) });

@Controller("v1")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(CSRF_OPTIONS) private readonly cookie: CsrfOptions,
  ) {}

  private setSession(reply: FastifyReply, s: SignedIn): void {
    void reply.setCookie(this.cookie.cookieName, s.sessionId, sessionCookieOptions(s.staff));
  }

  @Post("sessions")
  @HttpCode(201)
  @Operation("createSession")
  async createSession(
    @Body() body: Schemas["SignInRequest"],
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Schemas["Me"]> {
    const previousSession = (req.cookies ?? {})[this.cookie.cookieName];
    const s = await this.auth.signIn(body, { ...ctxOf(req), previousSession });
    this.setSession(reply, s);
    return s.me;
  }

  @Delete("sessions")
  @HttpCode(204)
  @Operation("deleteSession")
  async deleteSession(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply): Promise<void> {
    const id = (req.cookies ?? {})[this.cookie.cookieName];
    if (id) await this.auth.signOut(id);
    void reply.clearCookie(this.cookie.cookieName, { ...sessionCookieOptions(false), maxAge: undefined });
  }

  @Post("phone-checks")
  @HttpCode(202)
  @Operation("createPhoneCheck")
  createPhoneCheck(@Body() body: Schemas["PhoneCheckRequest"], @Req() req: FastifyRequest) {
    return this.auth.sendCode(body, ctxOf(req));
  }

  @Post("phone-checks/verify")
  @HttpCode(200)
  @Operation("verifyPhoneCheck")
  verifyPhoneCheck(@Body() body: Schemas["PhoneCheckVerifyRequest"], @Req() req: FastifyRequest) {
    return this.auth.verifyCode(body, ctxOf(req));
  }

  @Post("accounts")
  @HttpCode(201)
  @Operation("createAccount")
  async createAccount(
    @Body() body: Schemas["SignUpRequest"],
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Schemas["Me"]> {
    const s = await this.auth.signUp(body, ctxOf(req));
    this.setSession(reply, s);
    return s.me;
  }

  @Post("password-resets")
  @HttpCode(204)
  @Operation("createPasswordReset")
  async createPasswordReset(@Body() body: Schemas["PasswordResetRequest"], @Req() req: FastifyRequest): Promise<void> {
    await this.auth.resetPassword(body, ctxOf(req));
  }

  @Get("me")
  @HttpCode(200)
  @Operation("getMe")
  getMe(@Req() req: FastifyRequest): Promise<Schemas["Me"]> {
    return this.auth.me(req.actor as NonNullable<FastifyRequest["actor"]>);
  }

  @Patch("me")
  @HttpCode(200)
  @Operation("updateMe")
  updateMe(@Body() body: Schemas["MeChange"], @Req() req: FastifyRequest): Promise<Schemas["Me"]> {
    return this.auth.updateMe(req.actor as NonNullable<FastifyRequest["actor"]>, body);
  }
}
