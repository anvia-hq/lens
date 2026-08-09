# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS builder
RUN corepack enable && corepack prepare pnpm@11.0.4 --activate
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.package.json biome.json ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:24-alpine AS production-dependencies
RUN corepack enable && corepack prepare pnpm@11.0.4 --activate
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY LICENSE ./LICENSE
COPY apps/api/package.json ./apps/api/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/queue/package.json ./packages/queue/package.json
COPY packages/telemetry/package.json ./packages/telemetry/package.json
RUN pnpm install --prod --frozen-lockfile --filter @lens/api... --filter @lens/worker...

FROM node:24-alpine AS backend
ARG LENS_VERSION=dev
ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="Anvia Lens" \
  org.opencontainers.image.description="Anvia Lens API, worker, and database operations" \
  org.opencontainers.image.licenses="AGPL-3.0-only" \
  org.opencontainers.image.source="https://github.com/anvia-hq/lens" \
  org.opencontainers.image.version="${LENS_VERSION}" \
  org.opencontainers.image.revision="${VCS_REF}"
ENV NODE_ENV=production
WORKDIR /workspace
COPY --chown=node:node --from=production-dependencies /workspace ./
COPY --chown=node:node --from=builder /workspace/apps/api/dist ./apps/api/dist
COPY --chown=node:node --from=builder /workspace/apps/worker/dist ./apps/worker/dist
COPY --chown=node:node --from=builder /workspace/packages/config/dist ./packages/config/dist
COPY --chown=node:node --from=builder /workspace/packages/contracts/dist ./packages/contracts/dist
COPY --chown=node:node --from=builder /workspace/packages/db/dist ./packages/db/dist
COPY --chown=node:node --from=builder /workspace/packages/db/migrations ./packages/db/migrations
COPY --chown=node:node --from=builder /workspace/packages/queue/dist ./packages/queue/dist
COPY --chown=node:node --from=builder /workspace/packages/telemetry/dist ./packages/telemetry/dist
USER node
EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]

FROM nginxinc/nginx-unprivileged:1.29-alpine AS web
ARG LENS_VERSION=dev
ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="Anvia Lens Web" \
  org.opencontainers.image.description="Anvia Lens web application" \
  org.opencontainers.image.licenses="AGPL-3.0-only" \
  org.opencontainers.image.source="https://github.com/anvia-hq/lens" \
  org.opencontainers.image.version="${LENS_VERSION}" \
  org.opencontainers.image.revision="${VCS_REF}"
COPY --from=builder /workspace/apps/web/dist /usr/share/nginx/html
COPY LICENSE /usr/share/licenses/anvia-lens/LICENSE
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
