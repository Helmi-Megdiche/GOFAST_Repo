# One image for the three processes of apps/api (api, ws, worker) and for the migration job.
# The command picks the process (see infra/compose/compose.app.yaml). Build from the repo root:
#   docker build -f infra/docker/api.Dockerfile -t gofast-api .
ARG NODE_IMAGE=node:24-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54

FROM ${NODE_IMAGE} AS build
RUN npm install -g corepack@latest && corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter "@fastgo/api..." \
 && pnpm --filter @fastgo/contract bundle \
 && pnpm --filter @fastgo/api build

FROM ${NODE_IMAGE} AS run
RUN npm install -g corepack@latest && corepack enable
WORKDIR /app
ENV NODE_ENV=production
# Production dependencies only. The workspace packages are bundled into dist/ (tsup noExternal);
# the contract package stays because the api reads its bundled spec at start.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/contract/package.json packages/contract/
COPY packages/domain/package.json packages/domain/
COPY packages/i18n/package.json packages/i18n/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile --prod --filter "@fastgo/api..." && pnpm store prune
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/packages/contract/dist packages/contract/dist
# Migration job: node 24 runs the TypeScript of src/db as is (only `pg` is imported). Direct to
# PostgreSQL as fastgo_migrator, never through PgBouncer.
COPY apps/api/src/db apps/api/src/db
COPY apps/api/migrations apps/api/migrations
RUN rm -f apps/api/src/db/*.test.ts && chown -R node:node /app
USER node
WORKDIR /app/apps/api
EXPOSE 4000 4001 4002
CMD ["node", "dist/main.js"]
