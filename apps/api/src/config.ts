export type Config = {
  port: number;
  host: string;
  nodeEnv: "development" | "test" | "production";
  /** Behind the reverse proxy (X-Forwarded-*). */
  trustProxy: boolean;
};

const int = (name: string, value: string | undefined, fallback: number): number => {
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 65535) throw new Error(`${name} must be a port number`);
  return n;
};

/** Reads the environment once. Throws at start-up, never later. No secret has a default. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const nodeEnv = env.NODE_ENV ?? "development";
  if (nodeEnv !== "development" && nodeEnv !== "test" && nodeEnv !== "production") {
    throw new Error("NODE_ENV must be development, test or production");
  }
  return {
    port: int("PORT", env.PORT, 4000),
    host: env.HOST ?? "0.0.0.0",
    nodeEnv,
    trustProxy: env.TRUST_PROXY === "true",
  };
}
