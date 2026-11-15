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
  /** Login `fastgo_app` (api) or `fastgo_worker` (worker). No default: a secret. */
  DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),
  /** Key of the HMACs (codes, phones and identifiers in Redis). At least 32 characters. */
  AUTH_SECRET: z.string().min(32).optional(),
  /** Origins that may write with a session cookie (CSRF). Comma separated, e.g. https://gofast.tn. */
  ALLOWED_ORIGINS: z.string().default(""),
  /** Staff sign-in by password. Off by default; refused in production until back-office 2FA (T60). */
  STAFF_SIGNIN: flag,
  /** Only `fake` exists for now (it sends nothing); the provider is not chosen yet. */
  SMS_PROVIDER: z.enum(["fake"]).default("fake"),
});

export type Config = {
  port: number;
  wsPort: number;
  workerPort: number;
  host: string;
  nodeEnv: "development" | "test" | "production";
  trustProxy: boolean;
  databaseUrl?: string;
  redisUrl?: string;
  authSecret?: string;
  allowedOrigins: string[];
  staffSignIn: boolean;
  smsProvider: "fake";
};

/** Reads the environment once. Throws at start-up, never later. No secret has a default. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = Env.safeParse(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== "")));
  if (!parsed.success) {
    const why = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${why}`);
  }
  const e = parsed.data;
  const allowedOrigins = e.ALLOWED_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  for (const origin of allowedOrigins) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error(`Invalid environment: ALLOWED_ORIGINS: ${origin} is not an origin`);
    }
    if (url.origin !== origin) {
      throw new Error(`Invalid environment: ALLOWED_ORIGINS: ${origin} must be an origin (scheme, host, port)`);
    }
  }
  if (e.NODE_ENV === "production" && e.STAFF_SIGNIN) {
    throw new Error("Invalid environment: STAFF_SIGNIN is refused in production until the back-office 2FA exists (T60)");
  }
  if (e.NODE_ENV === "production" && e.SMS_PROVIDER === "fake") {
    throw new Error("Invalid environment: SMS_PROVIDER=fake sends nothing and is refused in production");
  }
  return {
    port: e.PORT,
    wsPort: e.WS_PORT,
    workerPort: e.WORKER_PORT,
    host: e.HOST,
    nodeEnv: e.NODE_ENV,
    trustProxy: e.TRUST_PROXY,
    databaseUrl: e.DATABASE_URL,
    redisUrl: e.REDIS_URL,
    authSecret: e.AUTH_SECRET,
    allowedOrigins,
    staffSignIn: e.STAFF_SIGNIN,
    smsProvider: e.SMS_PROVIDER,
  };
}

/** What the `api` and `worker` processes cannot start without. */
export function requireBackends(config: Config): {
  databaseUrl: string;
  redisUrl: string;
  authSecret: string;
} {
  const missing = (
    [
      ["DATABASE_URL", config.databaseUrl],
      ["REDIS_URL", config.redisUrl],
      ["AUTH_SECRET", config.authSecret],
    ] as const
  )
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) throw new Error(`Missing environment: ${missing.join(", ")}`);
  return {
    databaseUrl: config.databaseUrl as string,
    redisUrl: config.redisUrl as string,
    authSecret: config.authSecret as string,
  };
}
