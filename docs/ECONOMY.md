# Axie Duel — Economy & Tokenomics

## Core thesis

**Every transaction in Axie Duel either burns AXS/SLP or routes value to the Sky Mavis Community Treasury.** The economy is designed to be deflationary by default — aligned with Sky Mavis's pillar #1: *"Increase AXS demand sinks"*.

## Tournament economy: the primary AXS/SLP sink

Tournaments are the heart of the competitive economy and the largest deflationary mechanism.

### Flow

```
            ┌─────────────────────────────────┐
            │  Players enter with AXS or SLP  │
            │  (e.g., 100 players × 10 AXS)   │
            │  Total pot: 1000 AXS            │
            └──────────────┬──────────────────┘
                           │
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
   ┌─────────────────┐ ┌─────────┐ ┌──────────────────┐
   │ 90% PRIZE POOL  │ │ 5% BURN │ │ 5% GAME TREASURY │
   │ 900 AXS         │ │ 50 AXS  │ │ 50 AXS           │
   │ → Top 3 winners │ │ → Burn  │ │ → Funds content, │
   │   (60/25/15%)   │ │   addr  │ │   audits, prize  │
   │                 │ │         │ │   seeding        │
   └─────────────────┘ └─────────┘ └──────────────────┘
                           │              │
                           ▼              ▼
              ┌────────────────────────────┐
              │ Both flows are on-chain    │
              │ auditable on Ronin         │
              │ explorer                   │
              └────────────────────────────┘
```

### Numbers (per tournament)

| Param | Value |
|---|---|
| Min entry fee | 1 AXS or 100 SLP |
| Max entry fee | 100 AXS or 10,000 SLP (sponsored events) |
| Players (typical) | 64-256 |
| **Players share** | **90%** (fixed) |
| **Burn rate** | **5%** (fixed, permanent removal) |
| **Game treasury** | **5%** (fixed, multisig — funds content, audits, prize seeding) |
| **Prize distribution** | **60% / 25% / 15%** (top 3) |
| Tournament cadence | Daily small + Weekly large |

### Why 90 / 5 / 5 (not 90 / 10)?

The original v1 design was 90 % to players / 10 % burn. We refined to **90 / 5 / 5** because pure burn is great for token economics but leaves the game itself underfunded long-term. Splitting the non-prize half in two solves both problems:

- **5 % permanent burn** — direct deflationary pressure on AXS/SLP. Aligns with Sky Mavis pillar #1.
- **5 % to a game treasury multisig** — funds the day-to-day that keeps the game alive: new content drops, security audits, contract upgrades, seeding free tournaments for F2P players, sponsoring esports events. Without this, the game runway is hostage to fundraises.

**Why not "send 5 % to Sky Mavis directly"?** Because that would conflate the **player-side game economy** with the **Builders Program revenue split** (which is a separate column — see below). The 5 % treasury is the *project's* operating fund; the Builders Program % is *Sky Mavis's* share of project revenue.

### Game treasury — what it funds (transparent priorities)

| Bucket | Approx % of treasury | What |
|---|---|---|
| Content drops | 40 % | New cards, balance patches, art commissions |
| Security audits | 20 % | Quarterly contract + game-server audits |
| Free-tournament prize seeding | 25 % | Seeds F2P-friendly events with no entry fee |
| Marketing + community | 10 % | Sponsored streams, creator grants |
| Reserve | 5 % | Multisig emergency runway |

### Why both AXS AND SLP?

- **AXS** is the governance token; deflationary pressure here directly benefits all holders.
- **SLP** is the legacy token Sky Mavis explicitly wants to absorb/burn (its supply was inflated during 2021 P2E era).
- Accepting both gives players flexibility AND helps Sky Mavis solve the SLP overhang.

### Why both AXS AND SLP?

- **AXS** is the governance token; deflationary pressure here directly benefits all holders.
- **SLP** is the legacy token Sky Mavis explicitly wants to absorb/burn (its supply was inflated during 2021 P2E era).
- Accepting both gives players flexibility AND helps Sky Mavis solve the SLP overhang.

## Other AXS sinks (non-tournament)

| Action | AXS spent | Burn % | Rest |
|---|---|---|---|
| **Open booster pack** | 500 AXS | 25% (125 burn) | 75% to Treasury |
| **Premium Battle Pass** | 1,000 AXS | 100% (1000 burn) | 0% (cosmetic, full burn) |
| **Deck slot expansion** | 50 AXS | 100% | 0% |
| **Cosmetic card frame** | 20 AXS | 100% | 0% |
| **NFT card minting** (Spell/Trap from your collection) | 200 AXS | 50% | 50% Sky Mavis royalty |

**Total estimated burn rate** (mature platform with 50k DAU): **~$80k AXS/SLP burned per month**.

## Revenue split per Sky Mavis Builders Program guidelines

| Monthly revenue tier | Community Treasury | Operations + team |
|---|---|---|
| $0 - $10k | 0% | 100% (early stage, runway) |
| $10k - $50k | 20% | 80% |
| $50k - $200k | 25% | 75% |
| $200k+ | 25-30% | 70-75% (negotiable) |

**This is on top of the 5 % tournament burn + 5 % game treasury** which are *not* Sky Mavis revenue — the burn is pure deflationary value to all AXS holders, and the treasury funds project operations transparently.

## F2P player ROI vs NFT holder ROI (validation of balance)

**F2P player** (Web2 only):
- Gets free starter deck day 1
- Earns ~50 Dust per match win
- Daily quests: 100-500 Dust per day
- Free tournaments: prize pool funded by sponsor or platform
- **Top 10% ladder reachable** without spending a single AXS

**NFT holder** (Web3):
- Same starter deck access (no day-1 advantage)
- Their Axies become unique cards (collectible + flavor + side-grade effects)
- Access to AXS/SLP-entry tournaments (higher prize ceilings)
- Ranked Premium tier (separate matchmaking pool, NOT power tier)
- **Same top 10% ladder reachable** — NFT cards do not provide raw power advantage

**This is the F2P promise**: skill + deck-building > pay-to-win. NFT holders get *flavor + collectibility + access to higher-stake events*, never raw stat advantage.

## Smart contracts (Saigon-ready, mainnet post-partnership)

- `AxieDuelToken.sol` — ERC-20 capped (max supply 100M), pausable. **Used for off-chain → on-chain Dust→Token swap when mainnet rolls out**.
- `AxieDuelCardNFT.sol` — ERC-721 for Spell/Trap card NFTs (NOT for Axies — those stay as Axie Infinity originals).
- `AxsTokenMock.sol` — testnet ERC-20 mirror of AXS for local development.

All audited code-ready in `packages/contracts/`. Deployment pending Sky Mavis collaboration on Saigon faucet provision + mainnet timeline alignment.

## Audit & transparency

- All burn transactions emit on-chain `Transfer to 0x0` events — auditable on https://saigon-app.roninchain.com (testnet) and Ronin mainnet (post-partnership).
- Tournament prize distributions are **single multisig payouts per tournament** — single transaction proof, easy to audit.
- Off-chain ledger (`AxsTransaction`, `LunacianTransaction` Prisma models) keeps a parallel audit trail.

## Comparison to other Web3 game economies

| Game | Burn rate | Tournament tax | F2P viability |
|---|---|---|---|
| **Axie Duel** | **5 % burn + 5 % treasury (10 % combined) + 25 % pack** | 10 % combined | **High** (top 10 % ladder F2P) |
| Axie Origins | Variable AXS sinks | Variable | Limited (NFT-gated) |
| Pixels | Token taxes on actions | High platform fees | Limited |
| Heroes of Mavia | NFT-locked progression | N/A | Low |
| Yu-Gi-Oh Master Duel | N/A (no Web3) | N/A | Strong F2P |

**Axie Duel hits the sweet spot**: Master Duel's F2P balance + real Web3 deflationary mechanics.

## Open questions for Sky Mavis

1. **AXS faucet availability for Saigon testing**: can we get a small allocation (10k AXS) for closed-beta tournament testing on testnet?
2. **Mavis Marketplace integration**: when we mint Axie-card NFTs from our collection, can they be listed on Mavis Marketplace day 1?
3. **SLP burn coordination**: are there specific SLP burn targets/cycles we should align our tournament schedule with?
4. **Revenue split flexibility**: at $200k+/month, is the 25% Treasury split firm or negotiable based on our specific economic alignment?

These are all post-acceptance discussions — happy to align with Sky Mavis's existing tokenomics roadmap.

---

**Bottom line**: every dollar that flows through Axie Duel either burns AXS/SLP or routes value to the Sky Mavis Community Treasury. The economy is **structurally aligned** with Sky Mavis's stated priorities — not retrofit, designed-in.
