import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Proves the test database of PR 3 can start: PostGIS, as in production (cahier: PostgreSQL + PostGIS).
let container: StartedTestContainer;
let client: pg.Client;

beforeAll(async () => {
  container = await new GenericContainer("postgis/postgis:17-3.5")
    .withEnvironment({ POSTGRES_PASSWORD: "test", POSTGRES_DB: "fastgo" })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();
  client = new pg.Client({
    host: container.getHost(),
    port: container.getMappedPort(5432),
    user: "postgres",
    password: "test",
    database: "fastgo",
  });
  await client.connect();
});

afterAll(async () => {
  await client?.end();
  await container?.stop();
});

describe("PostGIS container", () => {
  it("has the PostGIS extension available", async () => {
    await client.query("create extension if not exists postgis");
    const r = await client.query("select postgis_version() as v");
    expect(r.rows[0].v).toMatch(/^3\./);
  });
});
