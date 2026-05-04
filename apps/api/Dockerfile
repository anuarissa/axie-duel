# Dockerfile para @axie-duel/api — buildea desde la raíz del monorepo Turborepo.
# Multi-stage para que el runtime sea pequeño (solo dist + node_modules).
#
# Build se invoca con context = monorepo root (RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile
# y `railway up` desde C:\dev\axie-duel).

FROM node:20-alpine AS build
RUN apk add --no-cache git python3 make g++ openssl
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

# Copiar solo manifiestos primero — capa cacheable mientras no cambien.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/game-server/package.json apps/game-server/
COPY apps/web/package.json apps/web/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/game-rules/package.json packages/game-rules/
COPY packages/card-database/package.json packages/card-database/
COPY packages/eslint-config/package.json packages/eslint-config/

RUN pnpm install --no-frozen-lockfile

# Copiar el resto del repo. CRÍTICO: prisma generate ANTES de tsc (turbo build),
# si no, los tipos de @prisma/client no existen y el build falla con TS2305/TS2694.
COPY . .
RUN cd apps/api && pnpm exec prisma generate
RUN pnpm turbo run build --filter=@axie-duel/api

# ── Runtime stage ─────────────────────────────────────────────────────
FROM node:20-alpine
RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

# Copiamos TODO el monorepo built porque Prisma + workspace deps lo necesitan en runtime.
COPY --from=build /repo /repo

WORKDIR /repo/apps/api
ENV NODE_ENV=production
EXPOSE 3001
CMD ["pnpm", "start:prod"]
