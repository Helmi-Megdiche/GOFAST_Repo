import openapiTS, { astToString } from "openapi-typescript";

/** The committed output. `pnpm generate` writes it; `spec.test.ts` fails when it is stale. */
export const GENERATED_FILE = new URL("./generated/schema.d.ts", import.meta.url);

const BUNDLE = new URL("../dist/openapi.bundled.yaml", import.meta.url);

const HEADER = `/**
 * Generated from packages/contract/openapi.yaml by \`pnpm --filter @fastgo/contract generate\`.
 * Do not edit: change the YAML, then regenerate.
 */

`;

export async function generateTypes(): Promise<string> {
  const ast = await openapiTS(BUNDLE, { alphabetize: true });
  return HEADER + astToString(ast);
}
