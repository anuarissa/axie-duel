# Axie Duel — Progression Design (Leveling beyond cosmetics)

> **Status: ROADMAP / design intent.** None of this is built yet. Account
> level is currently 100 % cosmetic (frame tiers only). This document is the
> design contract for what leveling *will* unlock post-partnership — and,
> just as importantly, what it will **never** unlock.

## The one rule that governs everything here

**Leveling is HORIZONTAL progression, never VERTICAL.**

It unlocks **identity, access, convenience, collection, and economy-feel**.
It never grants **raw in-match power**.

This is not a limitation — it is the single most important design decision in
the game, and it is downstream of the [F2P Balance Manifesto](./F2P_BALANCE_MANIFESTO.md):

- **Rule 2** — effects are *side-grades, not upgrades* (conditional / trade-off, never always-on power).
- **Rule 3** — no "must-have" cards (anything in >40 % of top-10 decks gets nerfed).
- **Rule 5** — Ranked Premium is *matchmaking quality, not power*: "no card buffs, no faster XP, no in-match advantage."
- **The Line** — "reach the top 10 % of the ladder without spending a single AXS, without a single NFT, without a single ad."

If level granted stats / LP / matchmaking edge, Axie Duel would become
grind-to-win (the exact 2021 narrative the whole pitch counters). So the
honest answer to *"can leveling affect your power in a match?"* is **no — by
design, permanently**. Stating this explicitly is itself a selling point: it
shows the team internalized the manifesto.

---

## What level SHOULD unlock — the F2P-safe levers

### A. Identity & expression (cosmetic)

| Lever | Notes |
|---|---|
| Hero frame tiers | **Live today.** Initiate → Ranger → Vanguard → Ascendant → Mythic |
| Card backs / sleeves | Unlock new deck-back art at level milestones |
| Board themes | Battlefield skins (Lunacian dawn/dusk, Mavis Hub, etc.) |
| Profile banner | Header art on the public profile/leaderboard |
| Victory emotes / animations | Cosmetic flourish on win — zero gameplay effect |
| Nameplate titles | "Vanguard of the Lunacians", "Mythic Duelist" |
| Hero preset unlocks | A few of the 9 hero presets gated as a collection goal (cosmetic only) |

### B. Access & convenience (zero power)

| Lever | Notes |
|---|---|
| Free deck slots at milestones | L5/L10/L15 grant a slot otherwise bought for 50 AXS — pro-F2P |
| Loadout presets | Save/swap deck loadouts faster |
| Replay history depth | Higher level → longer replay retention |
| Spectate slots | Watch more concurrent friends' matches |
| Early access to **cosmetics/events** | Earlier window for cosmetic drops only — **never gameplay cards** (soft advantage forbidden) |

### C. Economy-feel (marginal, retention — Hearthstone-validated)

| Lever | Notes |
|---|---|
| Bonus Dust per win at high level | +5–10 % Dust → accelerates *collection variety*, not the competitive ceiling (already F2P-reachable). Respects veteran time. |
| Free pack at L5/10/15/20 | Cards are side-grades, so a free pack = variety, not power |
| Tournament entry rebate | L15+ → 1 free daily-tournament entry. Pure accessibility, aligns with Rule 4 |

### D. Mastery & status (social, no stat)

| Lever | Notes |
|---|---|
| Level + tier shown in battle/profile/leaderboard | Partially live (battle HUD badge) |
| Class mastery tracks | "Plant Master" / "Aqua Master" badges for games won per class — **badge only, no stat bonus** |
| Seasonal prestige | "Lunacian Rank" soft-reset each season with cosmetic-only rewards |

### E. The special card given by leveling — as a SIDE-GRADE (Rule 2)

Two ways to do this. Both stay manifesto-safe; the choice is post-partnership.

**Option E1 — Cosmetic variant (recommended, 100 % safe)**
A foil/animated reskin of an existing starter card: *same stats, same
effect*, unique art + alternate name (e.g. **"Lunacian's Renewal"** = a
visual variant of *Verdant Renewal*). Pure collection/flair. Zero power
delta → cannot break balance, cannot become a must-have.

**Option E2 — Level-gated side-grade card (gameplay variety)**
A new Spell/Trap with a *conditional + trade-off* effect — interesting but
never dominant. Example:

> **Veteran's Gambit** (Trap) — *When you take battle damage while below
> 3000 LP, draw 1 card; but skip your next Draw Phase.*

Situational (only fires when behind) + trade-off (card now vs. tempo later)
= textbook side-grade per Rule 2. **Unlocked by reaching the level, which
any F2P player hits just by playing — never sold.** Subject to the same
quarterly governance as everything else: if it appears in >40 % of top-10
decks, it gets nerfed/sidestepped (Rule 3). The effect engine already
supports this (extensible kinds: damage / draw / buff / equip / tributeDraw
/ burn — a new card = a JSON definition + an effect handler).

**Recommendation:** ship E1 first (zero risk, immediate flair), evaluate E2
later with live balance data.

### F. What level will NEVER unlock (the selling point)

Documented as a hard contract, because saying it out loud is the pitch:

- ❌ No stat bonus to your cards (ATK/DEF/LP) at any level
- ❌ No extra starting hand / mulligan / LP
- ❌ No matchmaking advantage (Rule 5)
- ❌ No exclusive must-have cards (Rule 3)
- ❌ No faster XP / better rewards for paying players (Rule 5, explicit)
- ❌ No level requirement to enter competitive play or tournaments (Rule 4)

A level-1 F2P player and a level-50 whale sit down to the *same game*. The
only difference visible across the table is flair.

---

## Roadmap placement

This is **Q3–Q4 post-partnership** territory (alongside "ranked seasons" +
content drops in the pitch-deck roadmap, Slide 7). It is gated on Sky Mavis
acceptance and is **not** being built now. Sequencing once greenlit:

1. **Q3** — Identity layer (A) + free deck slots (B) + class mastery badges (D); Option E1 cosmetic variant card.
2. **Q4** — Economy-feel levers (C) behind a feature flag + live KPI watch; seasonal prestige (D); evaluate Option E2 with real balance data.
3. **Ongoing** — every lever audited against the F2P Manifesto KPIs (top-10 % F2P share, win-rate parity); anything that drifts toward power gets cut.

Bottom line for Sky Mavis: progression in Axie Duel deepens *attachment and
identity*, never the *power curve*. It is retention design that strengthens —
not contradicts — the "Skill, Not Stripe" promise.
