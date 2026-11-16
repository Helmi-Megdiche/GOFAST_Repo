import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Workspace packages ship TypeScript source: Next compiles them.
  transpilePackages: ["@fastgo/ui", "@fastgo/i18n", "@fastgo/domain"],
  // Same origin (#20): the browser calls /v1/... on this host, Next forwards it to the API. No CORS,
  // no public API URL. Unset API_ORIGIN (mock mode, CI): no rewrite.
  async rewrites() {
    const origin = process.env.API_ORIGIN?.replace(/\/+$/, "");
    return origin ? [{ source: "/v1/:path*", destination: origin + "/v1/:path*" }] : [];
  },
  turbopack: { root: path.resolve(process.cwd(), "../..") },
};

export default withNextIntl(nextConfig);
