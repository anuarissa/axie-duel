# Email templates — Sky Mavis outreach

Three templates ready to send. Copy → adjust links/handles → send.

---

## 1. Cold email — `builders@skymavis.com`

**Subject**: `Builders Program submission — Axie Duel (production-grade tactical TCG using Axie NFTs as cards)`

```
Hi Sky Mavis team,

I'm Anuar Issa, founder & lead engineer of Axie Duel — a tactical card game
that turns any Axie NFT into a unique playable card via a deterministic
parts → stats algorithm.

The MVP is already live in production:

  · Web      https://axie-duel.vercel.app
  · API      https://axie-api-production.up.railway.app
  · Game     wss://axie-game-prod.up.railway.app
  · Repo     https://github.com/anuarissa/axie-duel  (public, MIT/private-beta)

Quick technical snapshot:

  · Next.js 14 + Colyseus 0.16 authoritative game-server (anti-cheat by
    architecture)
  · Prisma + Postgres + Redis · Express API w/ Swagger UI on /docs
  · viem 2.x · 3 Solidity contracts (OpenZeppelin) Saigon-ready
  · 73+ tests green · CI/CD GitHub Actions · TypeScript strict
  · Web2-first onboarding (Google / MS / Facebook) + Ronin Waypoint MPC for
    Web3 users

Why we think this fits the Builders Program rationale:

  1. Direct Axie utility — every NFT (3M+ in circulation) deterministically
     becomes a unique, audit-friendly playable card. Live demo at /my-axies.

  2. AXS demand sink — tournament entries (AXS or SLP) split 90 % to players
     / 5 % permanent burn / 5 % to a transparent multisig game treasury that
     funds content + audits. Direct deflationary pressure plus sustainable
     project runway.

  3. F2P balance manifesto — starter decks competitive on top ladder. NFT
     cards are side-grades, not upgrades. Counters the 2021 pay-to-win
     narrative head-on.

  4. Web 2.5 onboarding — Google sign-in for non-crypto users; Ronin layer
     unlocks for those who want it. Expands TAM beyond the existing Axie
     audience.

I'd love to:

  1. Submit to Mavis Hub: Greenlight (game is in playable beta — full game
     loop, PvE ladder, tournaments, daily quests).
  2. Apply to the Builders Program in the next intake cycle.
  3. Get guidance on the right channel for Saigon contract deployment +
     internal API tier upgrades.

Attached: pitch deck (PDF).
5-min YouTube walkthrough: https://youtu.be/4z2y129paOY (unlisted)
Happy to set up a 30-min call any timezone.

Cheers,

Anuar Issa
anuarissa117@gmail.com
GitHub: anuarissa  ·  Discord: anuarissa  ·  Twitter: @issayarur
```

---

## 2. Cold email (BD-flavored) — `partnerships@skymavis.com`

**Subject**: `Partnership inquiry — production tactical TCG using Axie NFTs (live MVP)`

```
Hi partnerships team,

Quick BD-flavored intro — same project as the email I'm sending to
builders@, but framed for the partnerships angle.

Axie Duel is a tactical card game live in production at
https://axie-duel.vercel.app . It uses Axie NFTs as playable cards via a
deterministic algorithm and runs a tournament economy with a 90 / 5 / 5
split — 90 % to players, 5 % permanent burn, 5 % to a transparent
multisig game treasury (AXS or SLP entry).

What I think is BD-relevant:

  1. New TCG-genre funnel for Axie holders + new Web2 funnel for
     non-crypto TCG players (Hearthstone / Master Duel converts).
  2. AXS + SLP burns are real, public, on-chain (post-mainnet). Direct
     positive-supply impact for Sky Mavis.
  3. Mavis Marketplace alignment — rare Axie parts produce distinctive
     in-game effects, justifying premium pricing through gameplay
     diversity (not pay-to-win).
  4. Sponsored tournaments + co-branded events possible from day 1 of a
     partnership.

Tech is already solid (TS strict + 73+ tests + 3 deployed services + CI),
so the discussion is about ecosystem fit, IP terms (we use a working title,
open to rename), and revenue split structure (we follow your published
Builders Program tiers by default).

I'm submitting in parallel to builders@ for the Builders Program track. If
the partnership angle is the better channel, please point me there.

Thanks,

Anuar Issa
anuarissa117@gmail.com
```

---

## 3. Follow-up (1 week if no reply)

**Subject**: `Re: Builders Program submission — Axie Duel (quick follow-up)`

```
Hi team,

Quick follow-up on my email from last week re: Axie Duel submission to the
Builders Program / Greenlight.

A couple of updates since:

  · [TODO before sending: list one or two concrete shipped changes —
     e.g. "Saigon contracts deployed at 0x... ", "/my-axies live demo
     updated", "added tournament-burn ledger", etc.]

If the form / Greenlight cycle is the right channel right now, I'm happy
to wait — just want to confirm receipt and that this is on the radar.

Also happy to do a 30-min screen-share walkthrough of the live product if
that's the easier path.

Thanks again,

Anuar Issa
anuarissa117@gmail.com
https://axie-duel.vercel.app
```

---

## Sending checklist

Before hitting send on email #1:

- [ ] PDF of `PITCH_DECK.md` exported (Slidev or Keynote/Figma)
- [ ] PDF file size < 10 MB (compress images if needed)
- [ ] YouTube walkthrough uploaded (unlisted) and link inserted
- [ ] Twitter handle filled into the signature
- [ ] All three live URLs respond with HTTP 200
- [ ] Repo is public & README looks professional in browser
- [ ] `/my-axies` Demo Mode renders 5 cards in < 2 s
- [ ] `/docs` Swagger UI loads without auth
