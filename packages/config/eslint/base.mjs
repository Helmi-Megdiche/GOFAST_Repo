import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

/**
 * CLAUDE.md rules enforced by lint:
 *  - RTL: logical CSS only (no ml-*, mr-*, pl-*, pr-*, left-*, right-*, text-left, text-right ...)
 *  - Design tokens: no hex colors in app code (packages/ui is the only place allowed to hold them)
 */
const PHYSICAL_CLASS =
  "(^|\\s)(-?)(ml|mr|pl|pr|left|right|rounded-l|rounded-r|border-l|border-r|scroll-ml|scroll-mr|scroll-pl|scroll-pr)-\\S|(^|\\s)(text-left|text-right|float-left|float-right|clear-left|clear-right)(\\s|$)";
const HEX_COLOR = "^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$|#[0-9a-fA-F]{6}\\b";

const message = (what) => ({
  physical: `Physical direction class (${what}). Use logical classes: ms-*, me-*, ps-*, pe-*, start-*, end-*, text-start, text-end, rounded-s-*, rounded-e-*, border-s-*, border-e-*.`,
  hex: `Hex color "${what}". Use a design token from @fastgo/ui (no hex values in app code).`,
});

const restrictedSyntax = (allowHex) => [
  ...[
    ["Literal", "value"],
    ["TemplateElement", "value.raw"],
  ].map(([type, prop]) => ({
    selector: `${type}[${prop}=/${PHYSICAL_CLASS}/]`,
    message: message("ml-*, mr-*, left-*, right-*, text-left ...").physical,
  })),
  ...(allowHex
    ? []
    : [
        {
          selector: `Literal[value=/${HEX_COLOR}/]`,
          message: message("#rrggbb").hex,
        },
        {
          selector: `TemplateElement[value.raw=/${HEX_COLOR}/]`,
          message: message("#rrggbb").hex,
        },
      ]),
];

/** @param {{ allowHex?: boolean }} [options] */
export function baseConfig(options = {}) {
  return tseslint.config(
    {
      ignores: [
        "**/node_modules/**",
        "**/.next/**",
        "**/.turbo/**",
        "**/dist/**",
        "**/coverage/**",
        "**/test-results/**",
        "**/playwright-report/**",
        "**/next-env.d.ts",
      ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
      languageOptions: {
        globals: { ...globals.browser, ...globals.node },
      },
      rules: {
        "@typescript-eslint/consistent-type-imports": [
          "error",
          { fixStyle: "inline-type-imports" },
        ],
        "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
        "no-restricted-syntax": ["error", ...restrictedSyntax(Boolean(options.allowHex))],
      },
    },
    {
      // Config files and scripts may use any syntax
      files: ["**/*.config.{js,mjs,ts}", "**/scripts/**"],
      rules: { "no-restricted-syntax": "off" },
    },
  );
}

export default baseConfig();
