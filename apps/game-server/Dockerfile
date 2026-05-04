# Dockerfile para @axie-duel/game-server — buildea desde la raíz del monorepo.

FROM node:20-alpine AS build
RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/game-server/package.json apps/game-server/
COPY apps/web/package.json apps/web/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/game-rules/package.json packages/game-rules/
COPY packages/card-database/package.json packages/card-database/
COPY packages/eslint-config/package.json packages/eslint-config/

RUN pnpm install --no-frozen-lockfile

COPY . .
RUN pnpm turbo run build --filter=@axie-duel/game-server

# ── Runtime stage ─────────────────────────────────────────────────────
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

COPY --from=build /repo /repo

WORKDIR /repo/apps/game-server
ENV NODE_ENV=production
EXPOSE 2567
CMD ["node", "dist/index.js"]
