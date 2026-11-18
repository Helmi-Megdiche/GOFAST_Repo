import { randomUUID } from "node:crypto";
import { GenericContainer, Network, Wait, type StartedNetwork, type StartedTestContainer } from "testcontainers";
import pg from "pg";
import { migrate } from "../db/migrate.ts";

/** Passwords of the throw-away test database only. */
const PASSWORDS = {
  fastgo_migrator: "migrator-test",
  fastgo_app: "app-test",
  fastgo_readonly: "readonly-test",
  fastgo_worker: "worker-test",
} as const;

export type TestDb = {
  host: string;
  port: number;
  /** Connection strings, one per login. `super` bypasses RLS: use it to seed, never to assert. */
  url: (login: "postgres" | keyof typeof PASSWORDS) => string;
  superClient: pg.Client;
  network: StartedNetwork;
  container: StartedTestContainer;
  stop: () => Promise<void>;
};

/**
 * Starts PostGIS, then does what `infra/servers` does on a real host (roles, extension), then runs
 * the migrations as `fastgo_migrator`. The migrations themselves create no role and no password.
 */
export async function startTestDb(opts: { migrationsDir?: string } = {}): Promise<TestDb> {
  const network = await new Network().start();
  const container = await new GenericContainer("postgis/postgis:17-3.5")
    .withNetwork(network)
    .withNetworkAliases("pg")
    .withEnvironment({ POSTGRES_PASSWORD: "test", POSTGRES_DB: "fastgo" })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();
  const host = container.getHost();
  const port = container.getMappedPort(5432);
  const url = (login: "postgres" | keyof typeof PASSWORDS) =>
    `postgres://${login}:${login === "postgres" ? "test" : PASSWORDS[login]}@${host}:${port}/fastgo`;

  const superClient = new pg.Client({ connectionString: url("postgres") });
  await superClient.connect();
  for (const [role, password] of Object.entries(PASSWORDS)) {
    await superClient.query(`create role ${role} login password '${password}'`);
  }
  await superClient.query("create role fastgo_public_reader nologin");
  // Needed to hand the definer functions to that role (migration 0005); infra/servers does the same.
  // SET only: the migrator does not inherit the rights of the role.
  await superClient.query("grant fastgo_public_reader to fastgo_migrator with inherit false, set true");
  // Migration 0011 hands the order-history definers to this role (GH-22); same line in infra/servers/db-setup.sql.
  await superClient.query("create role fastgo_order_writer nologin");
  await superClient.query("grant fastgo_order_writer to fastgo_migrator with inherit false, set true");
  // The postgis image already creates the extension in POSTGRES_DB; a real host does it in the infra script.
  await superClient.query("create extension if not exists postgis");
  await superClient.query("grant create on database fastgo to fastgo_migrator");
  await superClient.query("grant create on schema public to fastgo_migrator");
  await superClient.query("grant usage on schema public to fastgo_app, fastgo_readonly, fastgo_worker");

  await migrate(url("fastgo_migrator"), opts.migrationsDir);

  return {
    host,
    port,
    url,
    superClient,
    network,
    container,
    stop: async () => {
      await superClient.end().catch(() => undefined);
      await container.stop();
      await network.stop();
    },
  };
}

/**
 * Asserts that `work` fails and that the PostgreSQL error matches `pattern`. Drizzle wraps the driver
 * error ("Failed query: ...") and keeps the real message in `cause`, so every message of the chain is
 * searched. It fails when `work` succeeds (RV-12: the check can fail).
 */
export async function expectDbError(work: Promise<unknown>, pattern: RegExp): Promise<void> {
  let failure: unknown;
  try {
    await work;
  } catch (error) {
    failure = error;
  }
  if (failure === undefined) throw new Error(`Expected a database error matching ${pattern}, but the statement succeeded`);
  const messages: string[] = [];
  for (let e: unknown = failure; e instanceof Error; e = e.cause) messages.push(e.message);
  if (!messages.some((m) => pattern.test(m))) {
    throw new Error(`Expected a database error matching ${pattern}, got: ${messages.join(" <- ")}`);
  }
}

/** PgBouncer in transaction mode with ONE server connection, in front of the test database. */
export async function startPgBouncer(db: TestDb): Promise<{ url: string; stop: () => Promise<void> }> {
  const bouncer = await new GenericContainer("edoburu/pgbouncer:v1.24.1-p1")
    .withNetwork(db.network)
    .withEnvironment({
      DB_HOST: "pg",
      DB_PORT: "5432",
      DB_NAME: "fastgo",
      DB_USER: "fastgo_app",
      DB_PASSWORD: PASSWORDS.fastgo_app,
      POOL_MODE: "transaction",
      DEFAULT_POOL_SIZE: "1",
      MAX_CLIENT_CONN: "50",
      AUTH_TYPE: "scram-sha-256",
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();
  return {
    url: `postgres://fastgo_app:${PASSWORDS.fastgo_app}@${bouncer.getHost()}:${bouncer.getMappedPort(5432)}/fastgo`,
    stop: async () => {
      await bouncer.stop();
    },
  };
}

/** Two merchants, each with a company and an address, seeded as superuser. */
export async function seedMerchants(db: TestDb) {
  const ids = {
    userA: randomUUID(),
    userB: randomUUID(),
    companyA: randomUUID(),
    companyB: randomUUID(),
    addressA: randomUUID(),
    addressB: randomUUID(),
  };
  const q = (text: string, values: unknown[]) => db.superClient.query(text, values);
  await q(
    `insert into core.accounts (id, kind, role, full_name, phone_e164) values
       ($1, 'merchant', 'merchant', 'Marchand Test A', '+21620000001'),
       ($2, 'merchant', 'merchant', 'Marchand Test B', '+21620000002')`,
    [ids.userA, ids.userB],
  );
  await q(`insert into core.companies (id, legal_name) values ($1, 'Boutique Test A'), ($2, 'Boutique Test B')`, [
    ids.companyA,
    ids.companyB,
  ]);
  await q(
    `insert into core.addresses (id, owner_company_id, line) values ($1, $2, 'Rue Test A'), ($3, $4, 'Rue Test B')`,
    [ids.addressA, ids.companyA, ids.addressB, ids.companyB],
  );
  return ids;
}

/** A throw-away Redis for the sessions, codes and counters of the auth module. */
export async function startRedis(): Promise<{ url: string; stop: () => Promise<void> }> {
  const container = await new GenericContainer("redis:7")
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
    .start();
  return {
    url: `redis://${container.getHost()}:${container.getMappedPort(6379)}`,
    stop: async () => {
      await container.stop();
    },
  };
}
