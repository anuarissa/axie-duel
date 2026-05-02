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

# 4. Levantar PostgreSQL + Redis (requiere Docker Desktop corriendo)
pnpm docker:up

# 5. Generar cliente Prisma + correr migraciones + seed catálogo
pnpm db:generate
pnpm db:migrate
pnpm db:seed

# 6. Levantar todo (game-server :2567, api :3001, web :3000)
pnpm dev
```

### Verificación

```bash
curl http://localhost:3001/health           # api → {ok:true,...}
curl http://localhost:2567/health           # game-server → {ok:true,...}
open http://localhost:2567/colyseus         # Colyseus monitor (lista de salas)
open http://localhost:3000                  # Next.js placeholder
```

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

## Filosofía dual Web2 / Web3

- **Cualquier persona** puede crear cuenta vía Waypoint (Gmail/Apple/Facebook) y jugar en 30s.
- Si tiene **Axies NFT** en su Ronin Wallet, los importa y obtiene ventajas paralelas (NO de poder bruto):
  - Axies NFT como cartas únicas con sus partes específicas.
  - +1 espacio en Extra Deck por cada NFT (máx +5).
  - Acceso a Ranked Premium (recompensas en RON).
  - Drops Premium acuñados como ERC-721 en Ronin (vendibles en marketplace).
- Master prompt sección 5: balance crítico — un jugador Free hábil debe poder vencer a un NFT en casual.

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
