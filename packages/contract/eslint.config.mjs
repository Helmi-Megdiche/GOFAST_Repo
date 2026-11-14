import { baseConfig } from "@fastgo/config/eslint/base";

export default [{ ignores: ["dist/**", "src/generated/**"] }, ...baseConfig()];
