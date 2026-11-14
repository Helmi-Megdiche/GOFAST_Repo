import { z } from "zod";

const port = (fallback: number) => z.coerce.number().int().min(1).max(65535).default(fallback);
/** Only the words `true` and `false`: `yes` or `1` is an error, not a silent false. */
const flag = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: port(4000),
  /** Health port of the `ws` process. */
  WS_PORT: port(4001),
  /** Health port of the `worker` process. */
  WORKER_PORT: port(4002),
  HOST: z.string().min(1).default("0.0.0.0"),
  /** Behind the reverse proxy (X-Forwarded-*). */
  TRUST_PROXY: flag,
});

export type Config = {
  port: number;
  wsPort: number;
  workerPort: number;
  host: string;
  nodeEnv: "development" | "test" | "production";
  trustProxy: boolean;
};

/** Reads the environment once. Throws at start-up, never later. No secret has a default. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = Env.safeParse(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== "")));
  if (!parsed.success) {
    const why = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${why}`);
  }
  const e = parsed.data;
  return {
    port: e.PORT,
    wsPort: e.WS_PORT,
    workerPort: e.WORKER_PORT,
    host: e.HOST,
    nodeEnv: e.NODE_ENV,
    trustProxy: e.TRUST_PROXY,
  };
}
