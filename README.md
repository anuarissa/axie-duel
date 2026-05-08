# 🃏 Axie Duel

> **A tactical card game blending classic TCG depth with Axie's iconic universe and Web3 digital ownership.**
>
> Web 2.5 design: anyone plays free with starter decks · Axie holders connect Ronin to unlock NFT-as-card mode with deterministic parts→stats algorithm.

[![Live](https://img.shields.io/badge/live-axie--duel.vercel.app-22c55e?style=flat-square)](https://axie-duel.vercel.app)
[![CI](https://img.shields.io/github/actions/workflow/status/anuarissa/axie-duel/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/anuarissa/axie-duel/actions)
[![Tests](https://img.shields.io/badge/tests-99%2B%20passing-22c55e?style=flat-square)](https://github.com/anuarissa/axie-duel/actions)
[![License](https://img.shields.io/badge/license-Private--Beta-f59e0b?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Discord](https://img.shields.io/badge/Discord-Axie-5865F2?style=flat-square&logo=discord&logoColor=white)](https://discord.com/invite/axie)

---

## 🎯 Working title disclaimer

**"Axie Duel"** is a working title used for development. Open to renaming on Sky Mavis partnership terms (e.g. "Lunacian Duel", "Origins Battler", or any official designation).

This is a **fan-made project leveraging Axie Infinity's public APIs**. **Not officially affiliated with Sky Mavis.** All Axie Infinity branding, NFTs, and IP belong to Sky Mavis Pte. Ltd.

---

## 🌐 Live Demo

- **Web app**: https://axie-duel.vercel.app
- **REST API**: https://axie-api-production.up.railway.app · [Swagger UI `/docs`](https://axie-api-production.up.railway.app/docs)
- **WebSocket Game Server**: `wss://axie-game-prod.up.railway.app`

| Page | URL |
|---|---|
| Login | `/login` |
| Dashboard | `/dashboard` |
| PvE Match | `/play/pve` |
| Deck Builder | `/decks/builder` |
| Card Catalog | `/cards` |
| Tournaments | (post-grant rollout) |
| **Rules / How to play** | `/rules` |
| **My Axies → Cards (NFT demo)** | `/my-axies` |

---

## 📊 Quick stats (May 2026)

| Metric | Value |
|---|---|
| **LOC** | ~22,800 TypeScript + 155 Solidity |
| **Tests** | **99+ passing** across 10 test suites |
| **API endpoints** | 42+ documented (Swagger UI) |
| **DB models** | 15 (Postgres 16 via Prisma) |
| **Cards in catalog** | 31 (20 Axies + 6 Spells + 5 Traps + extensible system) |
| **Smart contracts** | 3 (ERC-20 capped + ERC-721 cards + AXS mock) — Saigon-ready |
| **Auth providers** | Google · Microsoft · Facebook · Ronin Waypoint · EIP-4361 SIWE |
| **Deployment** | Vercel (web) + Railway (API + game-server) + Supabase (DB) + Upstash (Redis) |
| **Project age** | 3 months intensive solo development |

---

## 🏛 Architecture

```
                                   ┌──────────────────────┐
   ┌──────────────────┐  WS upgrade│  Colyseus Game-server│
   │  Next.js 14 web  │◄──────────►│  (Railway, Node 20)  │
   │  (Vercel)        │            │  - DuelRoom (PvP)    │
   │  - React 18      │            │  - PvERoom (vs Bot)  │
   │  - Colyseus.js   │            │  - Authoritative     │
   └────────┬─────────┘            │  - Replay log        │
            │ HTTPS                 └─────────┬────────────┘
            ▼                                 │
   ┌──────────────────┐                      │ HTTP (internal)
   │  Express REST    │◄─────────────────────┘
   │  API (Railway)   │
   │  - Prisma 5      │
   │  - JWT auth      │
   │  - Zod validate  │
   └────┬─────────┬───┘
        │         │
        ▼         ▼
   ┌────────┐  ┌────────┐         ┌────────────────────┐
   │Postgres│  │ Redis  │         │ Ronin Saigon (RPC) │
   │  16    │  │   7    │         │ + Axie GraphQL     │
   │Supabase│  │Upstash │         │ Gateway (parts)    │
   └────────┘  └────────┘         └────────────────────┘
```

**Authoritative server**: Colyseus state schema, all game actions validated server-side via `ActionValidator + Zod`. Client never trusted.

**Deterministic replay log**: every match emits structured events to a 10k-cap log → analytics + audit + cheat detection.

---

## 🎮 Core game loop

1. **Sign in** with Google/MS/Facebook (no wallet required)
2. **Pick a starter** (Plant / Bird / Beast — full competitive deck)
3. **Battle a bot** (Novato / Avanzado / Experto difficulties)
4. **Build your deck** (40-60 cards, max 3 copies)
5. **Optional Web3**: connect Ronin Wallet → unlock your Axie NFTs as unique cards via deterministic parts algorithm
6. **Compete** in tournaments (AXS/SLP entry, 10% burn, 90% prize pool)

See [`docs/RULES.md`](docs/RULES.md) for full mechanics.

---

## 📚 Documentation

| Doc | Description |
|---|---|
| [`docs/RULES.md`](docs/RULES.md) | Full game rules in plain language |
| [`docs/PARTS_ALGORITHM.md`](docs/PARTS_ALGORITHM.md) | **Deterministic Axie parts → card stats algorithm** (the Web3 hook) |
| [`docs/ECONOMY.md`](docs/ECONOMY.md) | AXS/SLP burn mechanics, tournament economy, revenue split |
| [`docs/F2P_BALANCE_MANIFESTO.md`](docs/F2P_BALANCE_MANIFESTO.md) | F2P competitive promise + balance design |
| [`docs/WEB_25_MANIFESTO.md`](docs/WEB_25_MANIFESTO.md) | Why Web 2.5 is the future of Web3 gaming |
| [`docs/deployment.md`](docs/deployment.md) | Self-host setup (Vercel + Railway + Supabase) |
| [`pitch/PITCH_DECK.md`](pitch/PITCH_DECK.md) | **Full pitch deck for Sky Mavis Builders Program** |

---

## 🚀 Quickstart for developers

**Prerequisites**: Node 20+, pnpm 9+, Docker (for Postgres + Redis local).

```bash
# Clone
git clone https://github.com/anuarissa/axie-duel.git
cd axie-duel

# Install workspaces
pnpm install

# Start Postgres + Redis (Docker)
docker compose up -d

# Apply DB migrations + seed
pnpm --filter @axie-duel/api db:migrate
pnpm --filter @axie-duel/api db:seed

# Run all services in parallel
pnpm dev
# → web   :3000
# → api   :3001
# → game  :2567
```

**Tests**:
```bash
pnpm test           # 99+ tests, ~5s
pnpm typecheck      # 10/10 packages
```

**Deploy**:
- Web → Vercel (auto on push to `main`)
- API + game-server → Railway (auto on push)
- DB migrations → `prisma migrate deploy` runs in API `start:prod`

---

## 🎯 Sky Mavis Builders Program

**Status**: Active candidate, May 2026.

| Resource | Link |
|---|---|
| Pitch Deck | [`pitch/PITCH_DECK.md`](pitch/PITCH_DECK.md) |
| Email outreach | [`pitch/EMAIL_TEMPLATE.md`](pitch/EMAIL_TEMPLATE.md) |
| Video walkthrough | (YouTube link — pending recording) |
| Live demo | https://axie-duel.vercel.app |

**Contact**:
- Email: anuarissa117@gmail.com
- GitHub: [@anuarissa](https://github.com/anuarissa)
- Discord: anuarissa
- Twitter/X: (pending)

---

## 🛡 IP & License

- **License**: Private-Beta (no commercial redistribution without permission)
- **Axie Infinity**, **Ronin**, **AXS**, and **Lunacian** are trademarks of **Sky Mavis Pte. Ltd.** This project consumes Sky Mavis's public APIs for rendering and validation; it does not redistribute or tokenize any Axie NFT.
- ERC-721 contract `AxieDuelCardNFT` mints **game-internal cards** (Spells/Traps), NOT representations of Axie Infinity NFTs.
- All Axie Infinity art assets remain property of Sky Mavis. This project uses generated SVG placeholder art for cards.

For partnership inquiries: anuarissa117@gmail.com

---

## 🗺 Roadmap

### Q2 2026 — Builders Program candidacy (current)
- ✅ MVP playable beta in production
- ✅ Web 2.5 onboarding (Google → starter → optional Ronin)
- ✅ NFT parts → card algorithm V1
- ⏳ Sky Mavis pitch + Greenlight submission

### Q3 2026 — Partnership integration
- Deploy 3 contracts to Saigon testnet (with Sky Mavis guidance)
- Live Axie GraphQL integration (replace V1 mocks)
- Tutorial guided match (Block 3 Phase 2)
- Greenlight community feedback iteration

### Q4 2026 — Mainnet + economy
- Migrate contracts to Ronin mainnet
- On-chain AXS economy (real burns + rewards)
- First sanctioned tournaments with prize pools

### Q1 2027 — Content + esports
- 100+ new cards (Mech / Dawn / Dusk classes)
- Ranked seasons + leaderboards
- Mobile apps (PWA → App Store / Google Play)

---

## 💬 Support

Issues & feature requests: [GitHub Issues](https://github.com/anuarissa/axie-duel/issues)

For commercial inquiries, partnership discussion, or pitch follow-up: anuarissa117@gmail.com
