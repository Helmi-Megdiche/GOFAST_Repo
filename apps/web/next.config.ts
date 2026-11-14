import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Workspace packages ship TypeScript source: Next compiles them.
  transpilePackages: ["@fastgo/ui", "@fastgo/i18n", "@fastgo/domain"],
  turbopack: { root: path.resolve(process.cwd(), "../..") },
};

export default withNextIntl(nextConfig);
