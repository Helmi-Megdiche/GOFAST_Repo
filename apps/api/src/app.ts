import { randomUUID } from "node:crypto";
import fastifyCookie from "@fastify/cookie";
import fastifyHelmet from "@fastify/helmet";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule, type AppOptions } from "./app.module.ts";

/** The HTTP app of the `api` process. Tests build it with their own module options. */
export async function createApp(
  config: { trustProxy: number | false },
  options: AppOptions = {},
): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(options),
    new FastifyAdapter({
      // A hop count, never `true`: with `true` the left-most X-Forwarded-For entry (the client's own
      // header) becomes req.ip and every IP limit can be dodged by changing it.
      // proxy-addr counts the socket address as hop 0: trust the first `n` addresses.
      trustProxy: config.trustProxy ? (_address: string, hop: number) => hop < Number(config.trustProxy) : false,
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
