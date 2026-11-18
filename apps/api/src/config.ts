import { z } from "zod";
import { parseTotpKey } from "./auth/totp.ts";

const port = (fallback: number) => z.coerce.number().int().min(1).max(65535).default(fallback);

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: port(4000),
  /** Health port of the `ws` process. */
  WS_PORT: port(4001),
  /** Health port of the `worker` process. */
  WORKER_PORT: port(4002),
  HOST: z.string().min(1).default("0.0.0.0"),
  /**
   * How many reverse proxies stand between the internet and this process (0 = none). The client
   * address is the one that many hops from the socket in X-Forwarded-For; entries further left are
   * client-written and never read. `true` would trust them all, so it is refused.
   */
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  /** Login `fastgo_app` (api) or `fastgo_worker` (worker). No default: a secret. */
  DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),
  /** Key of the HMACs (codes, phones and identifiers in Redis). At least 32 characters. */
  AUTH_SECRET: z.string().min(32).optional(),
  /** Origins that may write with a session cookie (CSRF). Comma separated, e.g. https://gofast.tn. */
  ALLOWED_ORIGINS: z.string().default(""),
  /** The key of the second-factor secrets (T60): 32 bytes in base64. Required in production; a fake one lives in `.env.example`. */
  TOTP_KEY: z.string().optional(),
  /** Only `fake` exists for now (it sends nothing); the provider is not chosen yet. */
  SMS_PROVIDER: z.enum(["fake"]).default("fake"),
});

export type Config = {
  port: number;
  wsPort: number;
  workerPort: number;
  host: string;
  nodeEnv: "development" | "test" | "production";
  /** Proxy hops to trust; 0 trusts none and `req.ip` is the socket address. */
  trustProxy: number;
  databaseUrl?: string;
  redisUrl?: string;
  authSecret?: string;
  allowedOrigins: string[];
  totpKey?: Buffer;
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
  if (e.NODE_ENV === "production" && !e.TOTP_KEY) {
    throw new Error("Invalid environment: TOTP_KEY is required in production (the key of the back-office second factor, T60)");
  }
  let totpKey: Buffer | undefined;
  if (e.TOTP_KEY !== undefined) {
    try {
      totpKey = parseTotpKey(e.TOTP_KEY);
    } catch {
      throw new Error("Invalid environment: TOTP_KEY must be 32 bytes in base64");
    }
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
    totpKey,
    smsProvider: e.SMS_PROVIDER,
  };
}

/** What the `api` and `worker` processes cannot start without. */
export function requireBackends(config: Config): {
  databaseUrl: string;
  redisUrl: string;
  authSecret: string;
  totpKey: Buffer;
} {
  const missing = (
    [
      ["DATABASE_URL", config.databaseUrl],
      ["REDIS_URL", config.redisUrl],
      ["AUTH_SECRET", config.authSecret],
      ["TOTP_KEY", config.totpKey],
    ] as const
  )
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) throw new Error(`Missing environment: ${missing.join(", ")}`);
  return {
    databaseUrl: config.databaseUrl as string,
    redisUrl: config.redisUrl as string,
    authSecret: config.authSecret as string,
    totpKey: config.totpKey as Buffer,
  };
}
