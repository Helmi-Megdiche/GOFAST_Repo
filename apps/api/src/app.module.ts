import { type DynamicModule, Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { HealthController } from "./health.controller.ts";
import { ApiGuard } from "./http/api-guard.ts";
import { ErrorFilter } from "./http/error.filter.ts";
import {
  IdempotencyInterceptor,
  IdempotencyStore,
  MemoryIdempotencyStore,
} from "./http/idempotency.ts";
import { RouteAudit } from "./http/routes.ts";
import { AnyOwner, NoSessions, OwnerCheck, SessionResolver } from "./http/session.ts";
import { loadOperations } from "./http/spec.ts";
import { OPERATIONS } from "./http/tokens.ts";

export type AppOptions = {
  /** Controllers beyond health: the feature modules of PR 4, or stubs in tests. */
  controllers?: NonNullable<DynamicModule["controllers"]>;
  sessions?: SessionResolver;
  owners?: OwnerCheck;
  idempotency?: IdempotencyStore;
  specPath?: string;
};

@Module({})
export class AppModule {
  static register(options: AppOptions = {}): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, ...(options.controllers ?? [])],
      providers: [
        { provide: OPERATIONS, useValue: loadOperations(options.specPath) },
        { provide: SessionResolver, useValue: options.sessions ?? new NoSessions() },
        { provide: OwnerCheck, useValue: options.owners ?? new AnyOwner() },
        {
          provide: IdempotencyStore,
          useValue: options.idempotency ?? new MemoryIdempotencyStore(),
        },
        RouteAudit,
        { provide: APP_GUARD, useClass: ApiGuard },
        { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
        { provide: APP_FILTER, useClass: ErrorFilter },
      ],
    };
  }
}
