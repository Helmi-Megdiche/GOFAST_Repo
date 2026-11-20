import { nextConfig } from "@fastgo/config/eslint/next";

// `.next-api` is the build folder of the api-mode e2e (NEXT_DIST_DIR), not source.
const config = [{ ignores: [".next-api/**"] }, ...nextConfig()];

export default config;
