import { defineConfig } from "tsup";

// One bundle per process. Workspace packages are source only, so they are bundled in.
export default defineConfig({
  entry: { main: "src/main.ts", ws: "src/ws.ts", worker: "src/worker.ts" },
  format: ["esm"],
  target: "node24",
  platform: "node",
  clean: true,
  sourcemap: true,
  noExternal: [/^@fastgo\//],
  // Nest and its optional peers stay external; Nest loads some of them lazily.
  external: ["@nestjs/microservices", "@nestjs/websockets", "class-validator", "class-transformer"],
});
