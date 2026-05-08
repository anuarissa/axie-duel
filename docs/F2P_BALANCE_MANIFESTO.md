# F2P Balance Manifesto — The "Skill, Not Stripe" Promise

## The promise

> **You can reach the top 10% of the competitive ladder in Axie Duel without spending a single AXS, without owning a single Axie NFT, and without watching a single ad.**
>
> NFT cards add **flavor, collectibility, and access to higher-stake tournaments** — not raw power.

This is the line that separates Axie Duel from the 2021-era Web3 games that gave the genre a bad name.

## Why this matters

The original Axie Infinity (2018-2022) suffered from a perception that became reality: *"You need to spend to play, and you need to spend more to win."* This drove away non-crypto gamers and even hurt the Web3 audience as the secondary market collapsed.

Axie Duel is built explicitly to **counter this narrative** while still giving NFT holders meaningful, mechanically-relevant utility.

## The design rules (non-negotiable)

### Rule 1: Stat ranges overlap

| Card source | ATK range | DEF range | Notes |
|---|---|---|---|
| Starter cards (F2P) | 1500-2200 | 1000-1900 | Designed by hand for balance |
| Earned cards (post-pack) | 1400-2400 | 900-2100 | Wider variance, but no extreme outliers |
| Axie NFT cards | 1500-2500 | 1000-2200 | Algorithmic from parts; bounded by clamp() |

**No NFT card has stats outside the band that any F2P player can match with starter + earned cards.**

### Rule 2: NFT effects are **side-grades, not upgrades**

NFT card effects are designed to be:
- **Conditional**: "When attacking a Plant Axie, +200 ATK" — situational, not always-on
- **Trade-offs**: "+300 ATK while in DEF position" — gives one thing, takes another
- **Anti-meta**: counters specific strategies but not all decks

Compare:
- **Starter card "Olek the Verdant Guardian"** (Plant L4): 1100/1700, no effect.
- **NFT Plant Axie L4** (algorithmic): 1100/1700, "Aura: +100 DEF to other Plants you control".

Both are L4 Plant tanks with similar raw stats. The NFT version has a *conditional* aura — useful in mono-Plant decks, useless in mixed decks. **A skilled F2P player with the starter Olek can match an NFT Plant Axie by playing tighter.**

### Rule 3: No meta-defining "must-have" NFT cards

We commit to balancing such that **no NFT card becomes a "you must own this to compete"** scenario.

- Quarterly meta reviews using ladder + tournament data.
- If an NFT card type appears in >40% of top-10 decks, we adjust its effect (nerf or sidestep).
- F2P deck recipes published officially every 2 weeks showing competitive options.

### Rule 4: Tournament accessibility

- **Free entry tournaments**: daily/weekly events with smaller prize pools, funded by platform/sponsors.
- **AXS-entry tournaments**: higher-stake events. **F2P players can earn AXS via:**
  - Daily quests (small but consistent)
  - Free tournament prize pools
  - Greenlight community grants (1-time)
- **No NFT requirement**: even AXS-entry tournaments accept anyone with the AXS, regardless of NFT ownership.

### Rule 5: Ranked Premium tier — quality, not power

- **What it IS**: a separate matchmaking pool for NFT-linked accounts. Match quality is higher (less afkers, less abandoners).
- **What it is NOT**: a power tier. Premium tier players don't get card buffs, faster XP, or any in-match advantage.

This is a **collectibility incentive + signaling tier**, not a pay-to-win mechanism.

## How we validate this in practice

### Tournament data analysis (post-launch)

**KPIs we'll track and publish quarterly:**
- % of top-10 ladder players who are F2P (target: ≥30%)
- % of top-50 tournament finishers who are F2P (target: ≥40%)
- Average win rate of starter decks vs NFT decks (target: within ±3%)
- "Must-include" cards by popularity in top decks (target: starter cards in top 10 by usage)

If any KPI fails, we **rebalance within 2 weeks** (cards or algorithm tweaks).

### Public balance reviews

- **Monthly**: blog post with current meta snapshot + balance changes.
- **Quarterly**: full balance review + community vote on major changes.
- **Yearly**: rotation/sunset of overused cards (similar to Hearthstone Standard rotation).

### Open balance philosophy

- **No hidden multipliers**: all card stats are public.
- **No matchmaking favoritism**: NFT holders don't get easier opponents.
- **No pay-to-cheat**: there is no version of "pay AXS to skip a turn" or "buy a power-up mid-match".

## What NFT holders DO get (the value proposition)

So why bother owning Axie NFTs if F2P is competitive? **Five reasons**:

1. **Flavor + identity**: your Axie #5234 is *your* card with *your* parts and *your* effect. Personal, not generic.
2. **Collectibility**: rare parts → distinctive effects. Trading on Mavis Marketplace becomes more interesting because parts have gameplay differentiation.
3. **Tournament access**: higher prize pools (gated by AXS entry, not NFT, but NFT holders typically have AXS).
4. **Ranked Premium quality**: less abandoners, faster matches, signaling tier.
5. **Future utility**: minting your Axie-card to ERC-721 for trading, leasing, etc. (post-mainnet roadmap).

**None of these is "raw power".** All of them are reasonable reasons to engage with Web3 — without locking F2P players out of competition.

## Why this is good for Sky Mavis

### 1. Counter the 2021 narrative

Sky Mavis publicly committed to making Axie sustainable, not extractive. **Axie Duel's F2P balance is concrete proof that Sky Mavis builders are aligned with that commitment.**

### 2. Expand the player base

By eliminating the "must-pay-to-play" friction, we open the funnel to:
- Casual TCG players from Hearthstone / Master Duel / etc
- Mobile gamers without Web3 onboarding
- Crypto-curious users who want to try before they buy

### 3. NFT demand from gameplay diversity

Because NFT cards are *side-grades* (each unique in flavor, not categorically stronger), demand shifts from "I need the strongest card" to "I want THIS specific Axie because its parts give an effect I love". This creates **more diverse demand** on Mavis Marketplace, not concentrated demand on a few "OP" cards.

### 4. Sustainable retention

F2P retention in TCGs is well-studied: ~30% of F2P players become spenders within 90 days *if the game respects them.* Axie Duel respects F2P players → higher long-term LTV.

## The closing line for the pitch

> *"Axie Duel respects the F2P player's time and skill. NFTs add flavor, not advantage. This is how we earn back the trust of the post-2021 gaming audience — and how we earn the trust of Sky Mavis to give us the keys to the official Axie ecosystem."*

---

**Public commitment**: this manifesto is part of the public repository. We will be held accountable to it.
