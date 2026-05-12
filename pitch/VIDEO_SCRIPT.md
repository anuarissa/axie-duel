# Video walkthrough script — 5 minutes

Target: a single, unedited (or lightly edited) 5-minute screen recording uploaded to YouTube as **unlisted**, linked from the pitch deck and the cold email.

**Tone**: confident, calm, fast, no filler. Speak as if explaining to a senior dev who already knows TCGs but hasn't seen Axie Duel.

**Recording setup**:
- 1080p OBS Studio at 30 fps minimum (see `HOWTO_RECORD_VIDEO.md` for setup details)
- Mic: any decent USB or headset mic; no music in background
- Browser: Chrome full-screen, no extensions visible, **test account already logged in with starter deck already picked** — you DO NOT show the login or starter-pick flow during the recording
- Use the production URL: https://axie-duel.vercel.app

---

## Timing breakdown (NEW STRUCTURE)

| Time | Section | Goal |
|---|---|---|
| 00:00 – 00:35 | 1. Project intro + Web 2.5 thesis | Frame the bet: "Web 2.5 game, F2P wins competitively, NFTs add flavor not power" |
| 00:35 – 01:10 | 2. Onboarding overview (mentioned, not shown) | Acknowledge login + starter pick exist, fast — vamos pa'lante |
| 01:10 – 02:30 | 3. Core loop — PvE match (Rookie) | Show the game actually playing — phase wheel, combat, win |
| 02:30 – 03:15 | 4. Deck depth + Packs / Sobres economy | F2P loop: free + paid packs, same competitive ceiling |
| 03:15 – 04:15 | 5. Web 3 layer — `/my-axies` + NFT gold frame ⭐ | The killer demo — moved to the end so it lands hardest |
| 04:15 – 04:45 | 6. Future roadmap (Tournaments, Ronin auth, mainnet) | Show the disabled Tournaments button + Phase 2 ambition |
| 04:45 – 05:00 | 7. Close + CTA | URLs, repo, email, Builders Program ask |

---

## Spoken script (with screen actions in brackets)

### 0:00 – 0:35 — Project intro + Web 2.5 thesis

[On screen: Chrome already open at `axie-duel.vercel.app` homepage]

> "Hi, I'm Anuar. This is **Axie Duel** — a tactical card game built for the Axie Infinity ecosystem.
>
> The thesis is simple: **Axie Duel is a Web 2.5 game**.
>
> [Click into `/dashboard`]
>
> **Web 2 players** sign in with Google in five seconds, get a free competitive starter deck, and can climb all the way to the top of the ladder — without spending a dollar, without owning a single NFT. It just takes more effort, more skill, more time. The free-to-play promise is non-negotiable.
>
> **Web 3 players** connect their Ronin wallet, and their Axie NFTs become unique playable cards in this game, derived from each NFT's parts.
>
> Both sides compete on the same ladder. **NFT cards are side-grades, not upgrades.** This is our F2P balance manifesto, published openly in the repo.
>
> Built solo, three months intense, in production right now. Let me walk you through it."

---

### 0:35 – 1:10 — Onboarding overview (mentioned, not shown)

[On screen: dashboard, with avatar / level / Dust / AXS counters visible, decks panel on the left, daily quests on the right]

> "I'm logged in on a test account. **Onboarding is**:
>
> - Sign in with Google — five seconds.
> - Pick a starter deck — Plant, Bird, or Beast. All three are competitive in F2P hands.
> - Five-slide forced tutorial — phases, LP bar, hand limits, win condition.
>
> Cold visitor to first match: under two minutes. **No wallet required, ever.**
>
> In the near future, **Ronin Waypoint** and **Ronin Wallet** will be added as auth options — for players who want to bring their NFTs in from day one. Today, just Google."

[Briefly hover over the "Connect Ronin Wallet" button in the header to show it exists but isn't required]

---

### 1:10 – 2:30 — Core loop: PvE match (Rookie)

[Scroll to the PvE ladder section — show the three tiers: Rookie / Veteran / Master]

> "Core game loop. PvE ladder has three difficulties: **Rookie**, **Veteran**, **Master**. Bot AI scales with each — Master uses class advantage logic and tribute economy. Today I'll play Rookie to show the basics fast."
>
> [Click "Rookie" → match starts]
>
> "Six-phase turn: Draw, Standby, Tactical, Combat, Tactical, End. Industry-standard pacing for TCGs.
>
> [Play a card from hand into the field]
>
> Cards drop in Tactical. The bot reacts.
>
> [Enter Combat phase]
>
> Combat math: ATK minus DEF, with class triangle giving ±15 percent shifts. Beast versus Plant — that's a class advantage, the damage is amplified.
>
> [Win the match]
>
> Win condition: drop opponent LP from 8000 to 0. Rewards: 50 XP, 10 Dust, plus daily-quest progress.
>
> Critical: **this is an authoritative server**. The client sends intentions, the Colyseus game-server validates them with Zod schemas, the server alone decides outcomes. Anti-cheat by architecture, day one."

---

### 2:30 – 3:15 — Deck depth + Packs / Sobres economy

[Navigate back to dashboard → click "🛠️ Build deck"]

> "Deck building lives here. **31 cards** in the beta — 20 Axies, 6 Spells, 5 Traps. 40 to 60 cards per deck, max 3 copies each. Classic TCG rules.
>
> [Briefly show the deck builder with the magnifier preview, then navigate to /store]
>
> **Card acquisition** is the heart of the F2P loop. Players power up their decks via **booster packs**:
>
> [On the /store page, point to the three pack types]
>
> - **Free packs** — earned over time through daily quests, ladder wins, and tournament participation.
> - **Paid packs** — bought with AXS or in-game Dust for players who want to progress faster.
>
> Either path leads to the **same competitive ceiling**. Money buys speed, not power. The free-to-play player gets to top ladder, just slower. This is the contract with the player.
>
> **NFT cards are different.** They don't come from packs. They come from your actual Axie NFTs on Ronin, via a deterministic algorithm. Let me show you that next — this is the killer feature."

---

### 3:15 – 4:15 — Web 3 layer: `/my-axies` + NFT gold frame ⭐ THE KILLER DEMO

[Navigate to `/my-axies`]

> "The Web 3 layer. This is where Axie NFTs become real, mechanically-relevant cards.
>
> The algorithm: connect Ronin wallet → server reads `balanceOf` on-chain → queries the Axie GraphQL Gateway for each Axie's six parts (eyes, ears, mouth, horn, back, tail) → applies a deterministic lookup table → renders a unique playable card with stats, class, level, and an effect.
>
> Same Axie always produces the same card. **No randomness.** Audit-friendly. The card is server-signed at match start, so the client cannot modify stats.
>
> [Click 'Run demo' — 5 cards render with animated gold frames]
>
> Five Axies, five unique cards. Beast, Plant, Bird, Bug, Aqua.
>
> **Notice the gold animated frame on every card.** That's our visual identity for **NFT-derived cards**. Web 2 starter cards and earned pack cards have neutral frames. **NFT cards have this shimmering gold border plus the NFT badge top-left.** At a glance, a player knows which cards in their collection are NFT-backed.
>
> **Collectibility cue, not power cue.** Stats stay within the same band as F2P cards. The gold is identity, not advantage.
>
> [Hover over one card to show the effect description]
>
> Three million plus Axies in circulation. Three million plus potentially unique playable cards. Zero manual art required.
>
> Live mode supports any Ronin address — paste a wallet, we hit the GraphQL gateway and render their real Axies. The Demo Mode you see uses preset Axies so this works without a wallet for the evaluator."

---

### 4:15 – 4:45 — Future roadmap (organized future)

[Navigate back to dashboard → highlight the disabled "🏆 Tournaments [Phase 2]" button]

> "What's next — three concrete fronts, in order:
>
> **One — Tournaments.** You see this disabled gold button on the dashboard. Ships in Phase 2 when the PvP ladder goes live. Entry in AXS or SLP, split **90 percent to players, 5 percent permanent burn, 5 percent to a transparent multisig game treasury** that funds content, audits, and free-tournament prize seeding. Sky Mavis pillar one is AXS demand sinks — this is direct, on-chain, auditable deflationary pressure, plus a sustainable runway.
>
> **Two — Ronin auth.** Today: Google sign-in. Next: **Waypoint MPC plus EIP-4361 SIWE**. Both are already coded in the repo, awaiting partnership to ship.
>
> **Three — Mainnet contracts.** Three Solidity contracts using OpenZeppelin — ERC-721 for game cards, ERC-20 capped for soft currency, AXS mock for testing. **Saigon-ready, deploy script committed.** Holding off on broadcast until Sky Mavis guides the audit track and Saigon faucet provision."

---

### 4:45 – 5:00 — Close + CTA

[Final title card: dark background, three URLs + email]

> "That's Axie Duel. Web 2.5, production grade, three deployed services, seventy-three tests green, public repo.
>
> Live at **axie-duel.vercel.app**.
> Repo at **github.com/anuarissa/axie-duel**.
> Submission to the **Sky Mavis Builders Program**.
>
> Excited to talk about partnership. Thanks for watching."

---

## Recording checklist

- [ ] Test account logged in BEFORE recording — starter pick + tutorial both completed (no forced redirects mid-video)
- [ ] Browser cleaned: no other tabs, no bookmarks bar, no extensions visible
- [ ] Notifications silenced (Win11 → Do Not Disturb / Focus Assist)
- [ ] Pre-record dry run to nail timing — first take is rarely the keeper
- [ ] Cursor highlight on (OBS sources → Display Capture → Properties → Capture Cursor: ON)
- [ ] Re-record any segment > 30 s of dead air or stumbling
- [ ] Hard cut total length to 5:00 — Sky Mavis evaluators will skim
- [ ] Add YouTube chapter markers matching the new timing breakdown

## YouTube upload metadata

**Title**: `Axie Duel — Sky Mavis Builders Program submission walkthrough (5 min)`

**Description** (paste in YouTube):
```
Axie Duel is a Web 2.5 tactical card game where every Axie NFT becomes a
unique playable card via a deterministic algorithm. Free-to-play players
can reach the top of the ladder without spending — NFT cards add flavor,
collectibility, and a distinctive gold frame, not raw power.

· Live: https://axie-duel.vercel.app
· Repo: https://github.com/anuarissa/axie-duel
· Pitch deck + docs in the repo

Submission to the Sky Mavis Builders Program (May 2026).

00:00 Project intro + Web 2.5 thesis
00:35 Onboarding overview (Google + starter — mentioned, not shown)
01:10 Core loop — PvE match on Rookie difficulty
02:30 Deck building + booster packs economy (free vs paid)
03:15 Web 3 layer — /my-axies + NFT gold frame ⭐
04:15 Future roadmap — Tournaments / Ronin auth / mainnet contracts
04:45 Close + CTA

Contact: anuarissa117@gmail.com
```

**Visibility**: Unlisted (sharing via direct link only — until Sky Mavis approves public release)

**Thumbnail**: 1280×720, dark Ronin-purple background, large text "AXIE DUEL · WEB 2.5 TCG", small inset showing a `/my-axies` card with the gold frame visible.
