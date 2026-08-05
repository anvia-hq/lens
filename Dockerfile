FROM node:24-alpine AS builder
RUN corepack enable && corepack prepare pnpm@11.0.4 --activate
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json biome.json ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM builder AS api
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]

FROM builder AS worker
ENV NODE_ENV=production
CMD ["node", "apps/worker/dist/index.js"]

FROM builder AS migrate
CMD ["pnpm", "--filter", "@lens/db", "db:migrate"]

FROM builder AS seed
CMD ["pnpm", "--filter", "@lens/db", "db:seed"]

FROM nginx:1.29-alpine AS web
COPY --from=builder /workspace/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
