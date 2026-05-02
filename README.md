# Axie Duel

> TCG por turnos estilo **Yu-Gi-Oh!** ambientado en **Axie Infinity**, sobre **Ronin Chain**.
> Filosofía dual: **Web2-friendly** (login social, juegas en 30s) + **Web3-powered** (importas tus Axies NFT y ganas ventajas reales).

## Estado del proyecto

**Fase 0 — Setup del monorepo. Entregada.** Roadmap completo en sección [Roadmap](#roadmap).

## Stack

- **Monorepo:** Turborepo + pnpm workspaces, TypeScript estricto.
- **Game Server:** Colyseus 0.15 (authoritative multiplayer + WebSocket).
- **REST API:** Express + Prisma + PostgreSQL + Redis.
- **Frontend:** Next.js 14 App Router (placeholder en Fase 0).
- **Web3:** Ronin Waypoint Web SDK + viem 2.x. Smart contracts en Solidity 0.8.24 + Foundry.
- **Tests:** Vitest 2.x.
- **Logging:** Pino estructurado.

Ver [`docs/RULES.md`](docs/RULES.md) para las reglas completas del juego.

## Estructura

```
axie-duel/
├── apps/
│   ├── game-server/     # Colyseus :2567 — motor del duelo, salas PvP/PvE
│   ├── api/             # Express :3001 — auth, mazos, catálogo, leaderboard
│   └── web/             # Next.js :3000 — frontend (placeholder Fase 0)
├── packages/
│   ├── shared-types/    # Tipos compartidos client/server
│   ├── game-rules/      # Reglas puras (deterministas, testeables)
│   ├── card-database/   # Catálogo de cartas (JSON + Axie parts mapping)
│   ├── contracts/       # Smart contracts Solidity + Foundry (sin instalar todavía)
│   └── eslint-config/   # Config ESLint compartida
├── docker-compose.yml   # PostgreSQL 16 + Redis 7 para dev local
├── docs/RULES.md
└── turbo.json, pnpm-workspace.yaml, package.json, tsconfig.base.json, .env.example
```

## Setup local (paso a paso)

### Prerrequisitos

| Tool           | Versión    | Cómo obtenerlo                                                     |
| -------------- | ---------- | ------------------------------------------------------------------ |
| Node.js        | **20.x LTS** | nvm-windows o https://nodejs.org. (`.nvmrc` apunta a 20.18.0.) |
| pnpm           | 9.x        | `npm install -g pnpm@9`                                            |
| Docker Desktop | last       | https://www.docker.com/products/docker-desktop/ (opcional para DB) |
| Foundry        | last       | Solo Fase 6 (smart contracts). https://book.getfoundry.sh/         |

### Pasos

```bash
# 1. Clonar / entrar al repo
cd C:\dev\axie-duel

# 2. Instalar deps
pnpm install

# 3. Variables de entorno
cp .env.example .env
# Editar .env: rellenar JWT_SECRET (openssl rand -hex 64), WAYPOINT_CLIENT_ID si tienes app, etc.

# 4a. PATH A — Postgres + Redis con Docker (recomendado)
#     Si NO tienes Docker Desktop, corre el helper como admin:
#       powershell -ExecutionPolicy Bypass -File tools\install-docker.ps1
#     Después del reinicio (si Windows lo pide):
pnpm docker:up

# 4b. PATH B — Postgres + Redis cloud (sin Docker)
#     Crea cuenta en https://supabase.com (Postgres free tier) y https://upstash.com (Redis free tier).
#     Pega la connection string de Supabase en DATABASE_URL y la de Upstash en REDIS_URL en tu .env.
#     Salta el paso 4a.

# 5. Generar cliente Prisma + correr migraciones + seed catálogo
pnpm db:generate
pnpm db:migrate    # crea migración inicial + aplica al DB
pnpm db:seed       # carga las 15 cartas del catálogo

# 6. Levantar todo (game-server :2567, api :3001, web :3000)
pnpm dev
```

### Verificación

```bash
curl http://localhost:3001/health           # api → {ok:true,...}
curl http://localhost:2567/health           # game-server → {ok:true,...}
open http://localhost:3001/docs             # Swagger UI con TODOS los endpoints
open http://localhost:2567/colyseus         # Colyseus monitor (lista de salas)
open http://localhost:3000                  # Next.js placeholder
```

## API endpoints (resumen — ver `/docs` para spec completa)

**Auth (Web2-first):**
- `POST /auth/google` `/auth/microsoft` `/auth/facebook` — login social puro (sin wallet)
- `POST /auth/waypoint` — login con wallet auto via Sky Mavis Waypoint
- `POST /auth/wallet/nonce` + `POST /auth/link/wallet` — flujo SIWE EIP-4361
- `POST /auth/link/waypoint` — atar wallet a usuario Web2 ya logueado

**Users:**
- `GET /users/me` `PATCH /users/me` `GET /users/me/cards` (auth)
- `GET /users/:username` — perfil **público** sin info sensible

**Game:**
- `GET /cards` `GET /cards/:id` — catálogo
- `GET /decks` `POST /decks` `GET/PUT/DELETE /decks/:id` `POST /decks/:id/activate`
- `GET /axies/:id` `GET /axies/sync` (auth)
- `GET /matches/history` (filtros: mode, opponentId, finishedOnly) `GET /matches/:id` `GET /matches/:id/replay` (público)
- `GET /leaderboard` (modes: ranked, rankedNFT)

**AXS off-chain ledger:**
- `GET /axs/balance` `GET /axs/transactions` `POST /axs/burn` (auth)

**Tournaments (8 endpoints):**
- `GET/POST /tournaments` `GET /tournaments/:id`
- `POST /tournaments/:id/register` `POST /tournaments/:id/start` `POST /tournaments/:id/match/report`
- `GET /tournaments/:id/leaderboard` `POST /tournaments/:id/cancel`

**Quests:**
- `GET /quests` (lista activas + progreso) `POST /quests/:id/claim` (atómico)

**Notifications (in-app feed):**
- `GET /notifications?unread=true` (con `unreadCount` para badge)
- `POST /notifications/:id/read` `POST /notifications/read-all`

**Admin** (requiere `isAdmin=true`, promove vía `pnpm db:make-admin <username>`):
- `POST /admin/tournaments/...` (create/start/cancel)
- `POST /admin/users/:id/grant-axs` `/promote` `/demote`
- `POST /admin/notifications/broadcast` (filtros: minElo, onlyWithWallet)

**Internal** (game-server → api, token compartido):
- `POST /internal/matches` (persiste match + triggea ELO + quests + W/L counters + notifications automáticamente)

## Features implementados (highlights)

- **Web2-first auth** con Google/Microsoft/Facebook + opt-in Ronin wallet (Waypoint o SIWE EIP-4361 directa)
- **AXS ledger off-chain** transaccional con earn/burn atómico vía Prisma $transaction
- **Daily Quests** con kinds WIN_PVE/WIN_PVP/PLAY_GAMES/COMPLETE_TOURNAMENT, claim atómico (anti-doble-claim vía updateMany)
- **Tournaments** single-elim con bye automático + prize distribution + refunds en cancelación
- **ELO Arpad K=32** auto-update en ranked matches via `/internal/matches`
- **Match persistence** + replay log inline (cap 10k entries) + W/L/D counters denormalizados
- **PvE Bot greedy** (Easy/Normal) con auto-play en PvERoom + cap defensivo 50 acciones
- **Triggered effects** vía EventBus + TriggerRegistry: 4 cartas (Mirror Web, Poison Backlash, Lunacian Counterstrike, Sky Mavis Field)
- **Aura system** state-based vía AuraRegistry: 2 cartas pasivas (Tide Surge, Verdant Sentinel)
- **Constraint pasivos** en ActionValidator: piercingDirect (Venomscale Stalker)
- **Notifications in-app** con hooks automáticos en match/quest/wallet/tournament + admin broadcast filtrable
- **Public profiles** `GET /users/:username` con totalGames + winRate + ranks
- **Swagger UI** en `/docs` con 42+ paths documentados + JWT auth integration
- **Service-to-service** auth con timing-safe token (game-server ↔ api)
- **Redis graceful fallback** in-memory en dev cuando no hay conexión real
- **dotenv auto-load** desde root para que cualquier `pnpm` script funcione sin cargar env vars manualmente

**99+ tests verde** (api/bracket: 14, api/AxsService: 13, api/AccountService: 7, game-rules: 43 con elo, game-server: 20 con auras+pveBot+triggered+duel).

**12/15 cartas con efecto operativo (80%).** Faltan trapImmune, duelLock, lockPosition para Fase 2.

## Comandos top-level

| Comando            | Qué hace                                                  |
| ------------------ | --------------------------------------------------------- |
| `pnpm dev`         | Levanta game-server + api + web simultáneamente            |
| `pnpm build`       | Build de producción de todos los paquetes                  |
| `pnpm test`        | Corre Vitest en todos los packages que tienen tests        |
| `pnpm typecheck`   | TypeScript strict en todo el monorepo                      |
| `pnpm lint`        | ESLint en todo el monorepo                                 |
| `pnpm db:migrate`  | Aplica migraciones Prisma                                  |
| `pnpm db:seed`     | Carga el catálogo de cartas en la DB                       |
| `pnpm db:studio`   | Abre Prisma Studio                                         |
| `pnpm docker:up`   | docker compose up -d (postgres + redis)                    |
| `pnpm docker:down` | Para los containers                                        |

## Sistema AXS (burn + tournaments)

**AXS** = token de utilidad del juego. Mientras Sky Mavis no nos dé partnership, opera **off-chain** (ledger en Postgres). El día que tengamos partnership, se cambia `AXS_MODE=onchain` + `AXS_TOKEN_ADDRESS=<real>` en `.env` y el código no cambia (la interfaz `AxsService.earn/burn/getBalance` es estable).

### Quema de AXS — para qué sirve

| Acción | Kind interno | Cuándo se quema |
| --- | --- | --- |
| Mintear carta Premium NFT | `BURN_NFT_MINT` | Tras un drop verificado server-side |
| Comprar cosmético (skin, animación) | `BURN_COSMETIC` | Tienda in-game |
| Slot extra de Deck | `BURN_DECK_SLOT` | Cuando el usuario quiere >3 mazos guardados |
| Entrada a torneo | `BURN_TOURNAMENT_ENTRY` | Al registrarse a un torneo con `entryCostAxs > 0` |

### Ganar AXS

| Acción | Kind interno | Cuándo se gana |
| --- | --- | --- |
| Premio de torneo | `EARN_TOURNAMENT` | Al cerrar el torneo, según `prizeDistribution` |
| Daily quest | `EARN_DAILY` | Una vez al día (Fase 4) |
| Bonus inicial | `EARN_STARTER_BONUS` | Al registrarse (`AXS_STARTER_BONUS=100` por defecto) |
| Reembolso (torneo cancelado) | `EARN_REFUND` | Si cancelan un torneo donde habías pagado entrada |

### Contratos relevantes

- **`packages/contracts/src/AxsTokenMock.sol`** — ERC-20 mock con `MINTER_ROLE` y `burnWithReason()`. Desplegable en Saigon mientras no haya AXS real.
- Cuando obtengamos el AXS real:
  - Saigon testnet AXS: consultar con Sky Mavis.
  - Mainnet AXS real: `0x97a9107c1793bc407d6f527b77e7fff4d812bece`.

### Torneos

Endpoints (todos en `/tournaments`):

| Método | Path | Descripción |
| --- | --- | --- |
| GET | `/tournaments` | Lista torneos (filtrar `?status=REGISTRATION\|IN_PROGRESS\|COMPLETED`) |
| POST | `/tournaments` | Crea un torneo (auth) |
| GET | `/tournaments/:id` | Detalle + participantes + matches |
| POST | `/tournaments/:id/register` | Inscribirse (auth, cobra `entryCostAxs`) |
| POST | `/tournaments/:id/start` | Genera bracket (auth) |
| POST | `/tournaments/:id/match/report` | Reporta resultado (auth) — auto-avanza ronda |
| GET | `/tournaments/:id/leaderboard` | Standings con `finalRank` y W/L |
| POST | `/tournaments/:id/cancel` | Cancela y reembolsa (auth) |

**Formato Fase 0:** Single-elim con bye automáticos cuando los participantes no son potencia de 2. Premios se reparten según `prizeDistribution: [{rank: 1, share: 0.5}, ...]`. Las shares deben sumar 1.

## Filosofía dual Web2 / Web3 (REGLA DE ORO — no se rompe)

**Web2 es el camino principal. Wallet = opcional, solo para premios cripto reales.**

### Login (sin wallet, sin cripto)

| Endpoint | Provider | Setup developer console |
| --- | --- | --- |
| `POST /auth/google` | Google (Gmail) | https://console.cloud.google.com/ → Credentials → OAuth 2.0 Client ID |
| `POST /auth/microsoft` | Microsoft (Outlook/Hotmail) | https://entra.microsoft.com/ → App registrations |
| `POST /auth/facebook` | Facebook | https://developers.facebook.com/apps/ → Facebook Login |

Cualquiera de los 3 alcanza para JUGAR todo: PvE, PvP Casual, PvP Ranked, daily quests, torneos con AXS off-chain. Al primer login el usuario recibe automáticamente:
- 3 mazos starter (Beast / Aquatic / Plant) con Axies starter no-NFT.
- 100 AXS de bonus (`AXS_STARTER_BONUS` configurable en `.env`).

### Linkear Ronin Wallet (opcional, solo para premios cripto reales)

Una vez logueado en Web2, el usuario puede ir a su perfil y elegir:

| Endpoint | Qué hace |
| --- | --- |
| `POST /auth/link/waypoint` | Linkea wallet via Waypoint MPC (recomendado, login social transparente) |
| `POST /auth/link/wallet` | Linkea wallet directa (Ronin Wallet extension, MetaMask) — requiere firma EIP-4361 |

Al linkear, el backend consulta on-chain `balanceOf` del contrato Axie. Si tiene **≥3 Axies NFT**:
- `hasNFTAxies = true` en su perfil.
- Desbloquea **Ranked Premium** (ladder con recompensas en RON / AXS real).
- Sus Axies NFT entran como cartas únicas en su catálogo personal.
- Acceso a torneos premium con prize pool en cripto.

**Si nunca linkea wallet, juega 100% gratis sin tocar blockchain.** El balance se mantiene en AXS off-chain (sin valor cripto). Cuando quiera convertirlos a cripto: linkea wallet + acuña.

### Balance crítico (master prompt sección 5)

Un jugador Web2 hábil **debe poder vencer** a un jugador con NFTs en PvP casual. Las ventajas NFT son **de progresión y economía**, no de poder bruto. Diferencia máxima de stats efectivos: **+10%** vía rareza intrínseca de partes únicas.

## Decisiones técnicas (`// DECISION:` en código)

- **Node 20 LTS** en lugar de v24 — alineado con Sky Mavis ecosystem y para evitar peer warnings.
- **pnpm 9** en lugar de npm — workspaces más eficientes en monorepo TS moderno.
- **Vitest** en lugar de Jest — ESM nativo, más rápido, mejor con TS strict.
- **Colyseus state via Schema** en lugar de XState — el cambio de fase es un enum + transiciones imperativas. Menos peso.
- **viem** en lugar de ethers — es lo que usan los ejemplos oficiales de Sky Mavis.
- **graphql-request** en lugar de Apollo — Apollo es overkill para un puñado de queries server-side.

## Roadmap

| Fase | Alcance                                                                              | Estado          |
| ---- | ------------------------------------------------------------------------------------ | --------------- |
| 0    | Setup monorepo (esta entrega)                                                        | **Entregada**   |
| 1    | Core engine completo: todos los efectos, chain con ventana 15s, replay system        | Por iniciar     |
| 2    | Auth Waypoint completa, sync Axies, catálogo 100+ cartas, deckbuilder                | Por iniciar     |
| 3    | Matchmaking ELO, sala Colyseus con reconnect, replay system completo, tournaments    | Por iniciar     |
| 4    | PvE: behavior tree, campaña 30 niveles, daily quests                                 | Por iniciar     |
| 5    | Frontend Next.js completo con animaciones de cartas (Phaser/Pixi opcional)           | Por iniciar     |
| 6    | Deploy contratos en Saigon Testnet, sistema de drops Premium NFT                     | Por iniciar     |
| 7    | Auditoría, deploy mainnet, postulación a Mavis Hub                                   | Por iniciar     |

## Decisiones pendientes (master prompt sección 16)

Estas no bloquean Fase 0 pero deben resolverse antes de Fase 6:

- **Nombre definitivo del juego** (provisional: "Axie Duel").
- **Token:** solo RON o `$DUEL` propio (`AxieDuelToken.sol` ya existe pero NO desplegado).
- **Modelo de monetización:** venta directa / battle pass / gacha de packs.
- **Política de drops NFT:** rareza, supply por temporada.
- **Setup Ronin Developer Console:** crear app en https://developers.skymavis.com/ y obtener `WAYPOINT_CLIENT_ID`.
- **Arte de cartas Magia/Trampa:** IA generativa / ilustrador humano / mix.

## Licencia

Privado. Todos los derechos reservados. La marca **Axie Infinity** y los **Axies** son propiedad de Sky Mavis. Este proyecto consume APIs públicas de Axie Infinity para rendering, no implica afiliación oficial.
