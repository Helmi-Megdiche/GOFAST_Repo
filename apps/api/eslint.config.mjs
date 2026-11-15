import { baseConfig } from "@fastgo/config/eslint/base";

// The database has one door (src/db): nobody else imports the driver or the ORM's pg adapter.
const door = {
  paths: [
    { name: "pg", message: "Use the db module (withActor, withWorker). The pool stays private." },
  ],
  patterns: [
    { group: ["drizzle-orm/node-postgres*"], message: "Only src/db talks to the database." },
  ],
};

export default [
  { ignores: ["dist/**"] },
  ...baseConfig(),
  { files: ["src/**/*.ts"], rules: { "no-restricted-imports": ["error", door] } },
  {
    files: ["src/db/**/*.ts", "src/**/*.test.ts", "src/int/**/*.ts"],
    rules: { "no-restricted-imports": "off" },
  },
];
