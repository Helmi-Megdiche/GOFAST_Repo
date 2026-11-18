import pg from "pg";

/**
 * The operator's connection (GH-25): the login of `DATABASE_MIGRATOR_URL`, direct, for the `staff:totp` command. It lives in the db
 * module because the driver has one door; it can only run a statement, and nothing else of the pool is exposed.
 */
export type Operator = {
  query(text: string, values?: unknown[]): Promise<unknown>;
  close(): Promise<void>;
};

export async function connectOperator(url: string): Promise<Operator> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return {
    query: (text, values) => client.query(text, values),
    close: () => client.end(),
  };
}
