# Axie Duel — Sky Mavis Builders Program Pitch Deck

> **Submission**: Mavis Hub: Greenlight + Builders Program candidacy
> **Author**: Anuar Issa · anuarissa117@gmail.com
> **Date**: May 2026
> **Live**: https://axie-duel.vercel.app

This deck is the script + content blueprint for the PDF submitted to Sky Mavis. Convert with **[Slidev](https://sli.dev/)** (`slidev export PITCH_DECK.md`) or copy slide-by-slide into Figma / Keynote / Slides.

10 slides. ~5 minutes spoken.

---

## Slide 1 — Cover

**Visual**
- Logo Axie Duel (top center)
- Hero screenshot: PvE board mid-combat on mobile portrait — phase wheel lit, two Axies on field, hand visible
- Soft Ronin-purple gradient background

**Body**
> # Axie Duel
> *A tactical card game blending classic TCG depth with Axie's iconic universe and Web3 digital ownership.*
>
> **Anuar Issa** · `anuarissa117@gmail.com` · May 2026
> Submission to Sky Mavis Builders Program & Mavis Hub: Greenlight

**Speaker notes**
- "Hi, I'm Anuar — I built Axie Duel solo over the past three intense months. It's live in production, plays from any browser, and turns any Axie NFT into a unique playable card."
- Pause for audience to scan the screenshot.

---

## Slide 2 — The opportunity

**Visual**
- Three stacked rows of NFT thumbnails (sleeping zZz icons over them) → arrow → empty desk → arrow → engaged TCG players
- Right-side stat: "$15B+ TCG genre · $200M+/yr Master Duel"

**Body**
> # The opportunity
>
> **~3M+ Axies in circulation. The vast majority sit dormant outside the original Axie Infinity & Origins.**
>
> Card games are the **#2 most lucrative gaming genre globally** ($15B+ market). *Yu-Gi-Oh Master Duel* alone generates $200M+/year.
>
> **There is no production-grade tactical TCG in the Axie ecosystem** that:
> - Uses Axie NFTs as playable cards with on-chain validation
> - Onboards Web2 players (Google / Microsoft / Facebook) before requiring a wallet
> - Runs on an authoritative server (anti-cheat by architecture, day one)
> - Is genuinely mobile-first

**Speaker notes**
- "Axie has 3+ million NFTs and a community that's already battle-tested. What it doesn't have is a deep TCG home for them. That's the gap."
- Don't dwell — this is the setup.

---

## Slide 3 — The product (the killer hook)

**Visual**
- 3-column diagram:
  1. **Web2 funnel** (Google sign-in icon → starter deck illustrations Plant/Bird/Beast)
  2. **Game core** (board screenshot — phase wheel + axies on field)
  3. **Web3 deepening** (wallet icon → Axie NFT → algorithm arrow → unique card render)

**Body**
> # The product
>
> A **tactical card battler** where Axies become collectible cards with stats, classes, and abilities.
>
> ## Core game loop
> - **Build** a 40–60 card deck (max 3 copies) — Axies, Spells, Traps
> - **Battle** through 6 phases (Draw → Standby → Tactical → Combat → Tactical → End)
> - **Win** by dropping opponent LP from 8000 → 0
> - **Earn** Dust (off-chain) + AXS (on-chain post-partnership) → packs, tournament entries, deck slots
>
> ## What makes it Axie-native — the killer hook
> **Every Axie NFT becomes a unique playable card via a deterministic algorithm.**
>
> 1. Connect wallet (Waypoint MPC) → server reads `balanceOf` on Ronin
> 2. Query Axie GraphQL Gateway → fetch the 6 parts (eyes / ears / mouth / horn / back / tail)
> 3. Apply our parts → ATK / DEF / Level / Effect lookup table
> 4. Server signs the card stats at match start = anti-cheat
>
> **Same Axie always → same card.** No randomness. Audit-friendly. **3M+ Axies = 3M+ unique playable cards** with no manual art needed.
>
> ## Web 2.5 — the differentiating thesis
> Web2 players never see a wallet. Web3 players unlock a deeper, NFT-native layer. **Both compete on equal ground** thanks to our F2P balance manifesto: NFT cards are *side-grades*, not upgrades.

**Speaker notes**
- "This is the slide that matters. Three things: deterministic NFT-to-card algorithm, Web 2.5 onboarding, F2P parity. If a Sky Mavis evaluator only remembers one slide, make it this one."
- Tease the live `/my-axies` demo: "I'll show you this in 30 seconds — it works right now."

---

## Slide 4 — Built production-grade from day one

**Visual**
- Architecture diagram (3 layers):
  - **Web** (Vercel — Next.js 14) ←WebSocket→ **Game-server** (Railway — Colyseus authoritative) ←HTTP→ **API** (Railway — Express + Prisma)
  - **API** → Postgres 16 (Supabase) + Redis 7 (Upstash) + Ronin (Saigon, viem 2.x)
- Stat strip below: **22,800 LOC TypeScript · 155 LOC Solidity · 73+ tests green · 42+ Swagger endpoints · 31 cards · 15 Prisma models**

**Body**
> # Tech stack & architecture
>
> | Layer | Stack |
> |---|---|
> | Web | Next.js 14 (App Router) on Vercel · TypeScript strict |
> | Game-server | Colyseus 0.16 authoritative · deterministic replay log · Schema 3.x |
> | API | Express + Prisma + Postgres 16 + Redis 7 |
> | Auth | Google · Microsoft · Facebook · Ronin Waypoint (jose JWK verify) · EIP-4361 SIWE |
> | Blockchain | viem 2.x · Saigon-ready (chainId 2021) · 3 Solidity contracts (OpenZeppelin) |
> | Quality | 73+ tests · CI/CD GitHub Actions · Swagger UI on `/docs` · pino structured logging |
>
> **Live infrastructure**:
> - 🌐 https://axie-duel.vercel.app
> - 🔌 https://axie-api-production.up.railway.app
> - 🎮 wss://axie-game-prod.up.railway.app

**Speaker notes**
- "Built solo, but built like a team would. TypeScript strict, real tests, CI on every push, three deployed services."
- Mention: "Colyseus authoritative server means the client sends *intentions*, the server validates with Zod and decides outcomes. No client-side cheating possible."
- "Smart contracts are written and audited internally — pending deploy on Saigon, which we'd love to do with Sky Mavis guidance for testnet faucet provisioning."

---

## Slide 5 — Live demo highlights

**Visual**
- 2x2 screenshot grid (high-res):
  1. Dashboard mobile (3 PvE difficulty cards visible)
  2. Battle screen mid-combat (axies on field + phase wheel)
  3. Deck builder with magnifier (lupa) preview
  4. `/my-axies` — Axie NFTs rendered as unique cards (THE HOOK)

**Body**
> # What's live today (playable beta)
>
> - ✅ **Onboarding**: Google sign-in → starter pick (Plant / Bird / Beast) → forced 5-slide tutorial
> - ✅ **PvE ladder**: 3 difficulties (Novato / Avanzado / Experto) — bot AI uses class advantage logic
> - ✅ **Deck builder**: 31 cards, 40–60 validation, max 3 copies, mobile lupa preview
> - ✅ **Tournaments**: single-elimination brackets · byes · prize distribution · refunds
> - ✅ **Daily quests**: WIN_PVE / PLAY_GAMES with atomic claim
> - ✅ **Wallet linking**: Waypoint MPC + manual SIWE flow (NFT validation gates Ranked Premium)
> - ✅ **Mobile-first UX**: tested on Samsung Internet, Safari iOS, Chrome Android
> - ✅ **Match persistence**: deterministic replay log (cap 10k entries) for audit & analytics
> - ✅ **`/my-axies` page**: live Ronin address → real Axies as cards · or **Demo mode** with 5 preset Axies (no wallet required)
>
> 🎬 **5-min walkthrough video**: [YouTube unlisted link]

**Speaker notes**
- "Right now, no signup needed: visit `/my-axies` and click Demo Mode — you see five Axies rendered as unique cards in two seconds."
- "Or paste any Ronin address and we fetch their real Axies live from the GraphQL gateway."
- "Phase wheel, hand limit discard, surrender confirm modal — every TCG-genre staple is here."

---

## Slide 6 — Sky Mavis ecosystem alignment

**Visual**
- 6-row checklist table; left column = Sky Mavis pillar, right column = how Axie Duel hits it.
- Footer strip with IP-respect note.

**Body**
> # Aligned with Sky Mavis pillars
>
> | Sky Mavis Pillar | How Axie Duel delivers |
> |---|---|
> | **Ronin-first** | viem 2.x · Saigon chainId 2021 · 3 contracts ready to deploy |
> | **AXS demand sinks** | Pack opening · deck slots · **tournament entry: 90 % prize pool / 10 % BURN** |
> | **Increase Axie utility** | Deterministic parts → unique card algorithm: 3M+ Axies → 3M+ playable cards. Rare parts → distinctive effects → marketplace pricing premium justified by **gameplay diversity**, not pay-to-win |
> | **Web2-first onboarding** | Google / MS / Facebook day 1 · Waypoint MPC for wallet linking later |
> | **Community-driven** | Open-source repo · Swagger docs public · daily quests · public leaderboard |
> | **Mobile-first** | Responsive desktop + mobile · landscape battle layout · 9+ mobile-specific iterations |
>
> **IP respect**:
> - README + UI disclaimer: *"Fan-made project. Not officially affiliated with Sky Mavis."*
> - Original SVG card art — no copied Axie assets
> - Working title — open to rename on partnership terms ("Lunacian Duel" / "Origins Duel" / etc.)
> - ERC-721 contract mints **game cards** (Spells / Traps), NOT representations of Axie NFTs. Axies are read-only inputs.

**Speaker notes**
- "Every pillar in your public Builders Program rationale, we hit. The 90/10 burn is the headline: every tournament entry burns AXS or SLP forever. Direct deflationary pressure."
- "On IP: we're transparent, we use only public APIs, no copied art, name is open to change."

---

## Slide 7 — Roadmap (12 months post-acceptance)

**Visual**
- Horizontal Gantt-style timeline, 4 quarters, with milestone bars

**Body**
> # 12-month roadmap with Sky Mavis support
>
> ## Q1 (Month 1–3) — Partnership integration
> - Deploy 3 smart contracts to **Saigon testnet** · audited
> - Live Axie GraphQL integration polish · scale-test against real wallets
> - Tutorial guided match (already designed in Block 3)
> - Greenlight community feedback iteration
>
> ## Q2 (Month 4–6) — Mainnet + economy
> - Migrate to **Ronin mainnet**
> - On-chain AXS economy (real burns + rewards on tournaments)
> - First 100 Axie-NFT-cards mintable as ERC-721 (with stats from parts)
> - Public sponsored tournaments
>
> ## Q3 (Month 7–9) — Content + esports
> - 100+ new cards (Mech / Dawn / Dusk class expansions)
> - Ranked seasons with leaderboards
> - First sanctioned Sky Mavis tournament (collab branding)
>
> ## Q4 (Month 10–12) — Scale
> - Team grows: 1 → 3-4 (backend, frontend, game design, art)
> - Mavis Hub permanent listing
> - Mobile apps (PWA → wrapper for App Store / Google Play)
> - Sky Mavis revenue split kicks in

**Speaker notes**
- "We're realistic: solo dev today, but the goal is to use the grant to onboard a game designer, an artist, and a community manager."
- "Q1 milestones are concrete enough to be measurable in the first review cycle."

---

## Slide 8 — Tournament economy & deflationary design

**Visual**
- Flow diagram (ASCII or SVG): User pays AXS/SLP entry → 90 % goes to prize pool → 10 % goes to BURN address → public on-chain ledger

**Body**
> # Tournament-first deflationary economy
>
> ## Tournaments — the core AXS/SLP demand sink
> - **Entry fee**: paid in **AXS** (preferred) or **SLP** (legacy token Sky Mavis wants reduced from circulation)
> - **90 % of pot → prize pool**
> - **10 % → permanent BURN** (sent to `0x000…dEaD`)
> - **Result**: every tournament = real, auditable deflationary pressure on AXS + SLP supply
>
> ## Why this matters to Sky Mavis
> - Direct alignment with the **#1 stated pillar: Increase AXS demand sinks**
> - **Burns SLP** — explicitly addresses the legacy-token oversupply problem
> - **Skill-rewarded payouts** (NOT NFT-rewarded) → counters pay-to-win narrative
> - **Public on-chain burn ledger** = transparency by default
>
> ## Other revenue streams + sinks
> 1. **Pack sales** in AXS — 25 % of pack revenue burned
> 2. **Premium Battle Pass** (cosmetic only) — 100 % of revenue burned (no power gating)
> 3. **Deck slot expansions** — small AXS burn per slot
> 4. **Mavis Marketplace royalty** on Axie-NFT-card secondary trades (flows to Sky Mavis)
>
> ## Revenue split (per Sky Mavis Builders Program guidelines)
> - $0 – $10k / month: 0 % to Community Treasury
> - $10k – $50k / month: 20 % to Community Treasury
> - $50k+ / month: 25 % to Community Treasury
> - Remainder: development + team

**Speaker notes**
- "This is the answer to: 'how does this benefit the broader Axie ecosystem?'"
- "We don't just create demand — we destroy supply. Every match leaves the AXS supply marginally smaller. At scale, that's hundreds of thousands of AXS burned per year."
- "Battle Pass is cosmetic only. F2P never feels gated."

---

## Slide 9 — Team & commitment

**Visual**
- Headshot or GitHub avatar of Anuar (left)
- Right column: bio bullets + GitHub stats placeholder
- Footer: "Looking to add" cards (3 future hires)

**Body**
> # The team
>
> ## Anuar Issa — Founder, Lead Engineer
> - **Full-stack TypeScript engineer** with focus on real-time multiplayer + Web3 integration
> - Built Axie Duel solo: full architecture, code, testing, deployment
> - **3 months intense execution** — core idea developed for longer; AI tooling accelerated build velocity
> - GitHub: github.com/anuarissa
> - Email: anuarissa117@gmail.com
>
> ## Why I'm building this
> - Long-time Axie player & holder
> - Saw the gap: Axie NFT utility outside Origins is largely unexplored
> - TCG genre is proven — *Master Duel* $200M/yr, Hearthstone, Magic Arena. Axie has the IP and community to win this category.
>
> ## Looking to add (post-grant)
> - **Game designer** (cards balance + meta + content cadence)
> - **Pixel artist** (Axie-style card frames + animations)
> - **Community manager** (tournaments + Discord moderation)

**Speaker notes**
- "I'm transparent: solo dev. The grant unlocks the team that takes this from MVP to production-scale."
- "I'm not asking Sky Mavis to take a leap of faith on someone with a slide deck. The product is live, tests are green, and the algorithm is open-source and auditable."

---

## Slide 10 — The ask

**Visual**
- 3-column "ask" CTA block
- Bottom strip: live URLs + contact

**Body**
> # What we need from Sky Mavis
>
> ## 1. Acceptance to the Builders Program
> - **Minimum $10k AXS grant** to fund 3 months of focused development
> - Engineering guidance for **Saigon deployment** + audit prep
>
> ## 2. Mavis Hub: Greenlight listing
> - Community visibility for early playtest cohort (1k–10k players)
> - Voting → permanent Mavis Hub listing
>
> ## 3. API access tier upgrade
> - Higher rate limits for **Axie GraphQL Gateway** (the public tier limits us at scale)
> - Access to internal developer tools / Cookbook resources
>
> ---
>
> ## What we offer Sky Mavis
> - A **production-grade product** ready to onboard the next 100k Axie players via the TCG genre
> - **Real, deflationary Axie NFT utility** that's engaging, not pay-to-win
> - **Mobile-first** = expanded TAM beyond the desktop-only original Axie audience
> - **Open-source-friendly monorepo** — risk-mitigated for Sky Mavis (others can fork if needed)
> - **Track record**: 22,800 LOC + 73+ tests + 12+ production deploys in 3 months — proven ship velocity
>
> ---
>
> **Live now**: https://axie-duel.vercel.app · **Repo**: github.com/anuarissa/axie-duel
> **Email**: anuarissa117@gmail.com · **Discord**: anuarissa · **Twitter**: [TODO]

**Speaker notes**
- "We're not asking for the moon. $10k AXS, technical guidance, an API tier. We deliver the next major TCG home for Axie holders."
- "Thanks for your time. Happy to walk through the live product right now if there's interest."

---

## Appendix — Anticipated FAQ (back-pocket)

> **Q: How will you monetize?**
> Tournament entries (AXS/SLP, 10 % burn), pack sales, cosmetic Battle Pass, deck-slot expansions, marketplace royalties on Axie-NFT-cards. F2P retention model proven by Hearthstone (~30 % of F2P become paying within 90 days).
>
> **Q: When mainnet?**
> Q2 of the post-acceptance roadmap. Three contracts are written and audited internally; we want Sky Mavis review before deployment.
>
> **Q: How do you balance NFT vs F2P?**
> Documented publicly in `docs/F2P_BALANCE_MANIFESTO.md`. NFT cards are side-grades, not upgrades. Stat ranges overlap. Quarterly meta reviews + nerfs if any NFT card hits >40 % of top-10 decks.
>
> **Q: Why not just build on Axie's existing chain integrations?**
> We do — viem 2.x for Ronin reads, Axie GraphQL Gateway for parts, Waypoint for auth. We don't replace Axie infrastructure; we consume it as a TCG layer on top.
>
> **Q: What's stopping someone else from building this?**
> Three months of execution velocity, 22k LOC, and a deterministic-algorithm spec already worked out. We're not racing on the moat — we're racing on the partnership.
>
> **Q: What's the IP risk?**
> Public Axie APIs are open. We use no copied art. Title is provisional and subject to renaming. Disclaimer is on every page. Game is built to run alongside official Axie products, not against them.
