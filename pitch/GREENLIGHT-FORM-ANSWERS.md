# 📋 Cheat-sheet — Mavis Hub: Greenlight submission form

> **URL del form**: https://forms.gle/TFJUzmUK8TJQo4n76
>
> Abrilo en Chrome ya logueado con `anuarissa117@gmail.com`. Tené este archivo en otra pestaña para copy/paste rápido a medida que aparezcan los campos.

---

## Respuestas listas para copiar (según campos típicos de submissions a Greenlight)

> Como el form requiere login para verse, no pude prever el orden exacto de los campos. Acá tenés TODAS las respuestas que probablemente te pidan, listas. Copy/paste según vayan apareciendo.

---

### 🧑 Datos del fundador / equipo

**Tu nombre completo**:
```
Anuar Issa
```

**Email**:
```
anuarissa117@gmail.com
```

**Discord username**:
```
anuarissa
```

**Twitter / X handle**:
```
@issayarur
```

**GitHub**:
```
anuarissa
```

**¿Equipo o solo?**:
```
Solo founder + lead engineer (full-stack). Post-grant planning to add: game designer, pixel artist, community manager.
```

**Tiempo trabajando en el proyecto**:
```
3 months intense execution (concept developed for longer; recent development accelerated with AI tooling)
```

---

### 🎮 Datos del proyecto

**Nombre del proyecto**:
```
Axie Duel
```

(Nota: Working title — abierto a renaming on partnership terms, tipo "Lunacian Duel" o "Origins Duel")

**Categoría / género**:
```
Tactical card battler (TCG) / Strategy
```

**Pitch en una frase (elevator pitch)**:
```
A Web 2.5 tactical card game where every Axie NFT becomes a unique playable card via a deterministic parts → stats algorithm — F2P-competitive, NFT cards as side-grades not upgrades.
```

**Descripción larga (~200 palabras)**:
```
Axie Duel is a tactical card game built for the Axie Infinity ecosystem. The thesis is Web 2.5: Web2 players sign in with Google in 5 seconds, get a free competitive starter deck (Plant/Bird/Beast), and can climb the ladder all the way to the top — without spending a dollar, without owning a single NFT. Web3 players connect their Ronin wallet and their Axie NFTs become unique playable cards in this game, with mechanics derived from each NFT's six parts (eyes, ears, mouth, horn, back, tail) via a deterministic algorithm. Same Axie always produces the same card. Server-signed for anti-cheat.

NFT cards are side-grades, not upgrades. Stat ranges overlap with F2P starter cards. NFT cards are visually distinguished by an animated gold frame — collectibility cue, not power cue.

The economy is deflationary by design: tournament entries (AXS or SLP) split 90 % to players / 5 % permanent burn / 5 % to a transparent multisig game treasury that funds content + audits + F2P prize seeding.

Built solo over 3 months. Live in production at axie-duel.vercel.app. Open monorepo, 160+ tests green, CI/CD, TypeScript strict.
```

---

### 🌐 URLs

**Live game URL**:
```
https://axie-duel.vercel.app
```

**Demo / hook URL** (lo más importante para que vean rápido):
```
https://axie-duel.vercel.app/my-axies
```
(Click "Run demo" → 5 Axies NFT renderizadas como cartas con frame dorado, ~2s sin necesidad de wallet)

**GitHub repo**:
```
https://github.com/anuarissa/axie-duel
```

**API / Swagger UI**:
```
https://axie-api-production.up.railway.app/docs
```

**Video walkthrough (5 min, YouTube unlisted)**:
```
https://youtu.be/4z2y129paOY
```

**30-sec trailer** (si piden):
```
[Lo subimos a YouTube si lo necesitan, o adjuntamos en Discord/Twitter]
```

---

### 🛠 Stack técnico

**Frontend**:
```
Next.js 14 (App Router) on Vercel · TypeScript strict
```

**Game-server**:
```
Colyseus 0.16 authoritative game-server with deterministic replay log + Zod-validated intents (anti-cheat by architecture)
```

**Backend**:
```
Express + Prisma + Postgres 16 + Redis 7 (Supabase + Upstash + Railway hosting)
```

**Blockchain integration**:
```
viem 2.x · Saigon testnet ready (chainId 2021) · 3 Solidity contracts using OpenZeppelin (ERC-20 capped + ERC-721 game cards + AXS mock) · Ronin Waypoint OAuth (jose JWK verify) · EIP-4361 SIWE scaffolding
```

**Auth**:
```
Google · Microsoft · Facebook · Ronin Waypoint MPC · EIP-4361 SIWE
```

---

### 📊 Métricas + estado

**Game stage**:
```
Playable beta — full game loop, PvE ladder (Rookie/Veteran/Master tiers), deck builder, daily quests, mobile-first responsive UI
```

**Test coverage**:
```
160+ tests green (api 55 + game-rules 73 + game-server 32) · CI/CD on push to main
```

**Lines of code**:
```
~22,800 TypeScript + 155 Solidity in 147 files
```

**Cards in beta**:
```
31 cards (20 Axies + 6 Spells + 5 Traps) · all with implemented effects + handlers
```

**API endpoints**:
```
42+ documented in Swagger UI
```

---

### 💰 Modelo económico / tokenomics

**¿Cómo encaja con Sky Mavis pillars?**:
```
1. Increase AXS demand sinks — tournament entries split 90% players / 5% permanent burn / 5% game treasury. Direct, on-chain, auditable deflationary pressure.
2. Increase Axie NFT utility — 3M+ Axies → 3M+ playable cards via deterministic algorithm.
3. Web2-first onboarding — Google sign-in for non-crypto users; expands TAM beyond existing Axie audience.
4. Ronin-first — viem 2.x · Saigon-ready · 3 contracts code-ready.
5. SLP utility — accepted as tournament entry → burned → addresses legacy token oversupply.
```

**Revenue model**:
```
1. Pack sales in AXS (25% burned, 75% to treasury)
2. Premium Battle Pass (cosmetic only, 100% burned)
3. Tournament entries (AXS/SLP, 5% burn + 5% treasury per tournament)
4. Deck slot expansions (AXS, 100% burned)
5. Mavis Marketplace royalty on Axie-NFT-card secondary trades (flows to Sky Mavis)
```

**Revenue split per Sky Mavis Builders Program guidelines**:
```
$0-10k/month: 0% to Community Treasury
$10k-50k/month: 20% to Community Treasury
$50k+/month: 25% to Community Treasury
```

---

### 🎯 ¿Qué pedís a Sky Mavis?

**Ask 1 — Greenlight listing**:
```
List Axie Duel on Mavis Hub: Greenlight for community visibility and early playtest cohort (1k-10k players).
```

**Ask 2 — Builders Program acceptance**:
```
Minimum $10k AXS grant to fund 3 months of focused development. Engineering guidance for Saigon deployment + audit prep.
```

**Ask 3 — API tier upgrade**:
```
Higher rate limits for Axie GraphQL Gateway (current public tier limits us at scale). Access to internal developer tools / Cookbook resources.
```

---

### 🛣 Roadmap

**Q1 (Month 1-3 post-acceptance)**:
```
- Deploy 3 smart contracts to Saigon testnet · audited
- Live Axie GraphQL integration polish · scale-test against real wallets
- Tutorial guided match (already designed)
- Greenlight community feedback iteration
```

**Q2 (Month 4-6)**:
```
- Migrate to Ronin mainnet
- On-chain AXS economy (real burns + rewards on tournaments)
- First 100 Axie-NFT-cards mintable as ERC-721
- Public sponsored tournaments
```

**Q3 (Month 7-9)**:
```
- 100+ new cards (Mech / Dawn / Dusk class expansions)
- Ranked seasons with leaderboards
- First sanctioned Sky Mavis tournament (collab branding)
```

**Q4 (Month 10-12)**:
```
- Team grows: 1 → 3-4 (backend, frontend, game design, art)
- Mavis Hub permanent listing
- Mobile apps (PWA → wrapper for App Store / Google Play)
```

---

### 🤝 IP / compliance / ethics

**¿Sos oficialmente afiliado con Axie Infinity?**:
```
No — fan-made project leveraging Axie Infinity's public APIs (GraphQL Gateway, Game API). Disclaimer visible on /login, /rules, README, and pitch deck. Working title — open to renaming on partnership terms. No copied art (original SVG generation only).
```

**¿Tu ERC-721 contract tokeniza Axies?**:
```
NO. The AxieDuelCardNFT contract mints game cards (Spells/Traps and future Axie-derived premium drops), NOT representations of Axie Infinity NFTs. Axie NFTs from a user's wallet are read-only inputs to our parts → card algorithm.
```

**¿Cómo manejás la F2P balance?**:
```
Published "F2P Balance Manifesto" in the repo (docs/F2P_BALANCE_MANIFESTO.md). Non-negotiable principles: stat ranges overlap, NFT cards are side-grades not upgrades, top 10% ladder reachable F2P with skill, quarterly meta reviews + nerfs if any NFT card hits >40% of top-10 decks.
```

---

### 📎 Adjuntos (si el form los permite)

- **Pitch deck PDF**: `C:\dev\axie-duel\pitch\exports\pitch-PITCH_DECK.pdf` (395 KB)
- **Trailer 30s**: `C:\dev\axie-duel\pitch\assets\trailer-30s-v4.mp4` (5.2 MB)
- **Walkthrough video**: Link de YouTube `https://youtu.be/4z2y129paOY` (más rápido que subir archivo)

---

### 💬 ¿Comentarios adicionales / Anything else?

```
The full pitch deck is attached (or available at github.com/anuarissa/axie-duel/blob/main/pitch/exports/pitch-PITCH_DECK.pdf). Live demo of the killer feature is at axie-duel.vercel.app/my-axies — click "Run demo", no wallet required, ~2s to render. 5-min YouTube walkthrough at youtu.be/4z2y129paOY (unlisted) covers Web 2.5 thesis, PvE loop, packs economy, NFT cards with gold frame, and the future roadmap (Tournaments Phase 2, Ronin auth, mainnet contracts). Happy to set up a call any timezone.
```

---

## Tips finales

1. **Tomate ~15-20 min para llenar el form con cuidado** — esta es tu única bala en este canal
2. **No copies todo en bloque** — el form puede tener límite de caracteres por campo, leé el límite si aparece
3. **Si te piden uno solo de los URLs** (vs varios), priorizá: `/my-axies` > YouTube > Live URL > Repo
4. **Si te piden adjuntar un archivo y solo permite uno**, mandá el `pitch-PITCH_DECK.pdf`
5. **Antes de Submit**, releé todo el form una vez
6. **Después de Submit**, guardá la confirmación (screenshot) — algunos forms mandan email automático con tu submission, otros no

---

## Después del form

✅ Submit del form → ya estás en la cola de revisión de Sky Mavis Greenlight
🟢 **Día 1 después del form** — Discord post en `#builders-program` (mismo plan de antes, los pasos están en `ACTIONS-FOR-ANUAR.md`)
🟢 **Día 2** — Twitter thread (mismo plan)

El form es el reemplazo del email — todo el resto del plan sigue igual.
