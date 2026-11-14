import { baseConfig } from "./base.mjs";

/**
 * Preset for packages/domain: business rules that run in the browser, in Next.js and in the API.
 * No UI, no framework, no storage, no Node-only module, no catalog. Types (tsconfig without DOM)
 * and these rules together keep it that way: types do not see `typeof window` or `globalThis`
 * lookups, and lint does not see a missing `lib`.
 * Not set here: `no-restricted-syntax`, which would replace the selectors of the base config.
 */
const BROWSER_GLOBALS = [
  "window",
  "document",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "navigator",
  "location",
  "history",
  "self",
  "alert",
  "fetch",
  "XMLHttpRequest",
  "FileReader",
  "setTimeout",
  "setInterval",
  "process",
  "Buffer",
  "__dirname",
  "__filename",
  "require",
];

const FORBIDDEN_IMPORTS = {
  paths: [
    // The root loads the JSON catalogs. Use "@fastgo/i18n/locales" or "@fastgo/i18n/format".
    { name: "@fastgo/i18n", message: 'Import "@fastgo/i18n/locales" or "@fastgo/i18n/format".' },
    { name: "react", message: "Domain has no UI." },
    { name: "react-dom", message: "Domain has no UI." },
    { name: "zod", message: "Schemas stay in apps/web; the API validates through the contract." },
    { name: "next-intl", message: "Domain has no translations: return codes, not text." },
    { name: "@fastgo/ui", message: "Domain has no UI." },
    { name: "fs", message: "No Node-only module." },
    { name: "path", message: "No Node-only module." },
    { name: "os", message: "No Node-only module." },
    { name: "crypto", message: "No Node-only module. Inject the random source." },
    { name: "child_process", message: "No Node-only module." },
  ],
  patterns: [
    { group: ["node:*"], message: "No Node-only module." },
    { group: ["next", "next/*"], message: "Domain does not depend on Next.js." },
    { group: ["react/*", "react-dom/*"], message: "Domain has no UI." },
    { group: ["next-intl/*", "@fastgo/ui/*"], message: "Domain has no UI or translations." },
    { group: ["@fastgo/i18n/messages/*"], message: "Domain does not read the catalogs." },
    { group: ["@/*"], message: "Domain cannot import from an app." },
    { group: ["**/apps/**", "apps/*"], message: "Domain cannot import from an app." },
    {
      group: ["**/delay", "**/mock-db", "**/storage"],
      message: "Storage and mocks stay in apps/web.",
    },
  ],
};

export function domainConfig() {
  return [
    ...baseConfig(),
    {
      files: ["**/*.{ts,mts}"],
      rules: {
        "no-restricted-imports": ["error", FORBIDDEN_IMPORTS],
        "no-restricted-globals": [
          "error",
          ...BROWSER_GLOBALS.map((name) => ({
            name,
            message: "Not available in packages/domain: pass it in as an argument.",
          })),
        ],
        "no-restricted-properties": [
          "error",
          ...["localStorage", "sessionStorage", "window", "document", "navigator", "process"].map(
            (property) => ({
              object: "globalThis",
              property,
              message: "Not available in packages/domain: pass it in as an argument.",
            }),
          ),
        ],
      },
    },
    {
      // The shifted-clock setup reads one environment variable (RV-08).
      files: ["src/test-setup.ts"],
      rules: { "no-restricted-globals": "off" },
    },
  ];
}

export default domainConfig();
