# Pitch package — Sky Mavis Builders Program

This directory holds everything needed to submit Axie Duel to Sky Mavis: pitch deck content, email templates, social copy, and the video script.

## Files

| File | Purpose | Where it ends up |
|---|---|---|
| [PITCH_DECK.md](./PITCH_DECK.md) | 10-slide deck content + speaker notes | Exported to PDF (Slidev / Keynote / Figma), attached to email |
| [EMAIL_TEMPLATE.md](./EMAIL_TEMPLATE.md) | Cold + follow-up emails to Sky Mavis | Sent to `builders@skymavis.com` and `partnerships@skymavis.com` |
| [DISCORD_INTRO.md](./DISCORD_INTRO.md) | Posts for `#builders-program`, `#mavis-hub-greenlight` | Posted in Axie Discord ([invite](https://discord.com/invite/axie)) |
| [TWITTER_THREAD.md](./TWITTER_THREAD.md) | 10-tweet public reveal thread | Posted from project Twitter handle |
| [VIDEO_SCRIPT.md](./VIDEO_SCRIPT.md) | 5-min screen-recording script + YouTube metadata | Recorded → uploaded as unlisted YouTube |

## Suggested order of operations

1. **Export pitch deck → PDF.** Use [Slidev](https://sli.dev/) for a markdown-native flow (`slidev export pitch/PITCH_DECK.md`), or copy slides into Keynote / Figma.
2. **Record the 5-min video.** Follow `VIDEO_SCRIPT.md` timing. Upload to YouTube as unlisted.
3. **Send the cold email.** Use `EMAIL_TEMPLATE.md` template #1 to `builders@skymavis.com`. CC `partnerships@skymavis.com` with template #2.
4. **Post on Discord.** Once email is out, post in the relevant channels per `DISCORD_INTRO.md`. Don't spam — pick one channel, wait 24 h, then move to the next if needed.
5. **Post the Twitter thread.** Once Discord and email have landed, post the public thread per `TWITTER_THREAD.md`.
6. **Wait 7 days.** If no reply, send the follow-up template (template #3 in `EMAIL_TEMPLATE.md`).

## Single source of truth for facts

If a fact appears in two places (deck + email + tweets), the deck wins. Update there first, then propagate. Common facts to keep in sync:

- LOC count: **22,800 TS / 155 Solidity**
- Tests count: **73+ green** (game-rules suite alone — the API/game-server have additional integration tests; verify before sending)
- Cards count: **31** (20 Axies + 6 Spells + 5 Traps)
- Endpoints: **42+ documented in Swagger**
- Solo build time: **3 months intense**
- Live URLs: `https://axie-duel.vercel.app` · `https://axie-api-production.up.railway.app` · `wss://axie-game-prod.up.railway.app`

## Contact (for the deck signature line)

- Email: `anuarissa117@gmail.com`
- GitHub: `anuarissa`
- Discord: `anuarissa`
- Twitter: `@issayarur`
