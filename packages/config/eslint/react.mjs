import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import { baseConfig } from "./base.mjs";

/** @param {{ allowHex?: boolean }} [options] */
export function reactConfig(options = {}) {
  return [
    ...baseConfig(options),
    jsxA11y.flatConfigs.recommended,
    reactHooks.configs.flat.recommended,
  ];
}

export default reactConfig();
