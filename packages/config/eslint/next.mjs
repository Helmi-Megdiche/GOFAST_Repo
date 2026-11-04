import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { baseConfig } from "./base.mjs";

/** @param {{ allowHex?: boolean }} [options] */
export function nextConfig(options = {}) {
  return [...nextVitals, ...nextTs, ...baseConfig(options)];
}

export default nextConfig();
