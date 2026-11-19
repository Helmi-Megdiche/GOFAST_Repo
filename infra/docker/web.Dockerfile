# apps/web as a standalone Next.js server. Build from the repo root:
#   docker build -f infra/docker/web.Dockerfile -t gofast-web .
# NEXT_PUBLIC_* values are inlined at build time, and the same image goes to staging and production
# (build once, tag = SHA). So only a value that is identical in every environment may be NEXT_PUBLIC_
# (the site address of production, the API_DOMAINS code switch). Anything that differs per environment
# stays a server-side runtime variable, never NEXT_PUBLIC_.
ARG NODE_IMAGE=node:24-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54

FROM ${NODE_IMAGE} AS build
RUN npm install -g corepack@latest && corepack enable
WORKDIR /app
COPY . .
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_API_DOMAINS
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL NEXT_PUBLIC_API_DOMAINS=$NEXT_PUBLIC_API_DOMAINS
# NEXT_OUTPUT is set here only: the e2e build (next build && next start) keeps its normal output.
ENV NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1
RUN pnpm install --frozen-lockfile --filter "@fastgo/web..." && pnpm --filter @fastgo/web build

FROM ${NODE_IMAGE} AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static apps/web/.next/static
COPY --from=build /app/apps/web/public apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
