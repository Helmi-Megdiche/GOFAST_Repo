import { randomUUID } from "node:crypto";
import fastifyCookie from "@fastify/cookie";
import fastifyHelmet from "@fastify/helmet";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule, type AppOptions } from "./app.module.ts";
import type { Config } from "./config.ts";

/** The HTTP app of the `api` process. Tests build it with their own module options. */
export async function createApp(
  config: Pick<Config, "trustProxy">,
  options: AppOptions = {},
): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(options),
    new FastifyAdapter({
      trustProxy: config.trustProxy,
      genReqId: () => randomUUID(),
      bodyLimit: 1_048_576,
    }),
    { logger: process.env.NODE_ENV === "test" ? false : undefined },
  );
  await app.register(fastifyHelmet);
  await app.register(fastifyCookie);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
