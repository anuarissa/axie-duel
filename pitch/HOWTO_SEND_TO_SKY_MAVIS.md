# HOWTO — Mandar el package a Sky Mavis (paso a paso)

> **Objetivo**: ejecutar la submission completa al Sky Mavis Builders Program / Mavis Hub: Greenlight, en orden y sin saltearte canales.
>
> **Tiempo total**: ~3 horas distribuidas en 2 semanas. La mayoría del trabajo es Day 0 + Day 1.
>
> **Imprimí esta página** y andá tachando los checkboxes a medida que los completás. Es la única forma de no olvidarte de un paso bajo presión.

---

## DAY 0 — Preparación (~2 horas)

> **Cuándo**: el día anterior al envío del email. Ideal: domingo a la noche o lunes a la mañana temprano.

### A. Verificación técnica

- [ ] **`/my-axies` está live**: abrí https://axie-duel.vercel.app/my-axies en una ventana incógnito y confirmá que el botón **"Run demo"** renderiza 5 cards en menos de 3 segundos
- [ ] **Repo público**: andá a https://github.com/anuarissa/axie-duel y verificá que **NO** dice "Private" abajo del nombre. El README se renderiza con badges, secciones, links activos.
- [ ] **Swagger UI live**: abrí https://axie-api-production.up.railway.app/docs y confirmá que carga sin pedir auth
- [ ] **Tests verde**: en una terminal, `cd C:/dev/axie-duel && pnpm test` debe terminar con 160+ pasados
- [ ] **GIF teaser existe**: `C:/dev/axie-duel/pitch/assets/my-axies-teaser.gif` pesa < 5 MB y se reproduce en Windows Photos

### B. Grabación del video

- [ ] **Grabá** el video walkthrough siguiendo [`HOWTO_RECORD_VIDEO.md`](./HOWTO_RECORD_VIDEO.md) (1–1.5 h con 2-3 takes)
- [ ] **Subiste a YouTube** como "No listado"
- [ ] **Copiaste el link** y lo pegaste en:
  - [ ] Slide 5 de [`PITCH_DECK.md`](./PITCH_DECK.md) (reemplaza `[YouTube unlisted link]`)
  - [ ] (Lo vas a pegar también en el email — Day 1)

### C. PDF del pitch deck

- [ ] El PDF del pitch deck está en `pitch/exports/PITCH_DECK.pdf` (regenerado automáticamente por `scripts/export-docs.mjs`)
- [ ] Abrilo en Edge / Acrobat y revisá que:
  - [ ] Todos los headings se ven bien
  - [ ] Las tablas están alineadas
  - [ ] El link de YouTube está actualizado (re-corré el script si lo agregaste después)
- [ ] **Si tenés tiempo**: convertilo a PDF "más visual" con [Slidev](https://sli.dev/) (`npm i -g @slidev/cli && slidev export pitch/PITCH_DECK.md`) o copiando a Figma/Keynote. La versión Pandoc/md-to-pdf es funcional y profesional pero no tiene transiciones bonitas.

---

## DAY 1 — Email + Discord (~30 min)

> **Cuándo**: martes o miércoles a la mañana (Sky Mavis está principalmente en Singapur — UTC+8). Si estás en Argentina/Latam, mandá entre 8 y 10 AM tu zona horaria; les llega al final de su día laboral, lo van a leer al día siguiente.

### A. Email — el canal MÁS importante

- [ ] Abrir Gmail (cuenta `anuarissa117@gmail.com`)
- [ ] **Para**: `builders@skymavis.com`
- [ ] **CC**: `partnerships@skymavis.com`
- [ ] **Asunto**: `Builders Program submission — Axie Duel (production-grade tactical TCG using Axie NFTs as cards)`
- [ ] **Cuerpo**: copiá y pegá el **template #1** de [`EMAIL_TEMPLATE.md`](./EMAIL_TEMPLATE.md) — empieza con "Hi Sky Mavis team,"
- [ ] Reemplazá el placeholder de Twitter por `@issayarur` si todavía no está
- [ ] **Adjuntar** **un solo archivo**: `pitch/exports/PITCH_DECK.pdf` (cualquier email pesado se va a spam)
- [ ] **Antes de enviar**:
  - [ ] Re-leer una vez de arriba abajo
  - [ ] Verificá que TODOS los links del cuerpo (live URLs, repo, video YouTube) son clickeables y funcionan
  - [ ] Verificá que el PDF adjunto pesa < 8 MB
- [ ] **Enviar**
- [ ] Anotá en algún lado (Notion, papel, Notas de Mac): "Sky Mavis email sent: [fecha y hora]"

### B. Discord — `#builders-program`

> Hacelo **30–60 minutos después del email** (no inmediato — querés que lleguen los emails primero).

- [ ] Joineá el server oficial: https://discord.com/invite/axie
- [ ] **Username**: `anuarissa` (asegurate que es ese, no algún nick personal con números raros — Sky Mavis va a buscar correlacionar con el email)
- [ ] **Esperá 30 minutos navegando el server**:
  - [ ] Leé las reglas del canal (suelen estar pinneadas en `#welcome` o `#rules`)
  - [ ] Mirá los últimos 10–15 mensajes en `#builders-program` para entender el tono
- [ ] Postear en `#builders-program` el **mensaje #1** de [`DISCORD_INTRO.md`](./DISCORD_INTRO.md)
- [ ] **NO postees en otros canales el mismo día** — los mods detectan crossposting como spam y te warnean

---

## DAY 2 — Twitter (~20 min)

> **Cuándo**: miércoles o jueves entre 9 y 11 AM hora del **east coast** (UTC-4) — es el peak de engagement de Web3 Twitter. Si estás en Argentina/Latam, eso son las 10–12 AM hora de Buenos Aires.

- [ ] Abrir [`TWITTER_THREAD.md`](./TWITTER_THREAD.md)
- [ ] Abrir https://x.com/compose/post desde tu cuenta `@issayarur`
- [ ] **Importante**: vas a componer **los 10 tweets ANTES de postear el primero**. Twitter te deja agregarlos uno bajo otro con el botón **"+"** sin postear hasta que clickees "Post all".
  - Si posteás el primero y después editás los siguientes, perdés engagement
- [ ] Adjuntá medios:
  - **Tweet 1**: el GIF teaser (`pitch/assets/my-axies-teaser.gif`)
  - **Tweet 2**: screenshot de un Axie con sus 6 parts → carta resultante (podés hacerlo desde `/my-axies` con el modo demo)
  - **Tweet 4**: screenshot de [`docs/F2P_BALANCE_MANIFESTO.md`](../docs/F2P_BALANCE_MANIFESTO.md) o de la sección de Rules en el live
  - **Tweet 5**: screenshot del flow del 90/10 burn de [`docs/ECONOMY.md`](../docs/ECONOMY.md)
  - **Tweet 6**: screenshot del repo en GitHub (con el README y badges)
- [ ] Tags en el **tweet 1**: `@AxieInfinity @SkyMavisHQ @Jihoz_Axie @RoninNetwork`
- [ ] Hashtags: poné solo `#AxieInfinity` en el tweet 1 (más es spam)
- [ ] **Click "Post all"** — Twitter postea los 10 en orden automáticamente
- [ ] **Después de postear**:
  - [ ] Reply a TU PROPIO tweet 10 con el link de YouTube unlisted (los reply-to-self boostean el algoritmo)
  - [ ] Pinneá el tweet 1 en tu perfil (si todavía es ese tu uso principal)
  - [ ] Mandate el thread por WhatsApp a 1-2 amigos pidiéndoles que le den RT — el primer empuje viene de tu círculo

---

## DAY 3 — Discord `#mavis-hub-greenlight` (~10 min)

- [ ] Abrir Discord → server Axie Infinity
- [ ] Buscar el canal `#mavis-hub-greenlight` (puede llamarse distinto — `#mavis-hub-submissions`, `#submissions`, etc.)
- [ ] Si NO existe el canal: postear en `#tools-api-etc` el **mensaje #2** adaptado de [`DISCORD_INTRO.md`](./DISCORD_INTRO.md), preguntando dónde está el canal de Greenlight
- [ ] Si SÍ existe: postear el mensaje #2 directo
- [ ] **Pedir explícitamente** el link del Greenlight submission form (suele estar pinneado o en el bot)

---

## DAY 7 — Follow-up (si no hubo reply)

> **Solo si Sky Mavis no respondió tu email original**. Si respondieron pidiendo más info o programando una call, ignorá este paso y respondé lo que te pidieron.

- [ ] Abrir [`EMAIL_TEMPLATE.md`](./EMAIL_TEMPLATE.md) **template #3** (el follow-up)
- [ ] **Llená el bullet "[TODO before sending]"** con 1–2 cosas concretas que hayas shipeado entre Day 1 y Day 7. Ejemplos:
  - "Deployed contracts to Saigon at 0xABC..."
  - "Added 5 new cards to the catalog (Mech class)"
  - "Fixed mobile layout on /tournaments page"
  - "Hit 100 unique testers via Discord"
- [ ] **Enviar como REPLY** al thread original del email (no email nuevo) — Gmail conserva el contexto
- [ ] **Asunto**: dejá el "Re:" automático que pone Gmail
- [ ] Tono: **NO** disculparte, NO "just following up", NO emojis. Concreto: "Quick update from last week's email — shipped X and Y. Still keen to engage on the Builders Program when the team has bandwidth."

---

## DAY 14+ — Engagement sostenido (opcional pero alta-ROI)

> Sky Mavis valora la consistencia. Aceptan menos people que mandan email y desaparecen, vs gente que sigue construyendo en público.

- [ ] **Cada 7 días**: postear un update en Twitter con progreso real (no marketing). Ejemplos:
  - "Shipped 3 new cards this week. Mech class is now playable. Live at axie-duel.vercel.app"
  - "Tournament burn ledger is now public — first 1000 AXS burned: [link al on-chain ledger]"
  - "F2P player just hit top-10 on the Saigon ladder using only starter cards. Validates our F2P manifesto."
- [ ] **Cada 14 días**: responder a 2-3 preguntas en Discord de otros builders (Substance > self-promo)
- [ ] **Si Sky Mavis lanza un ciclo formal**: vos ya estás en el radar, vas a ser primero en la lista

---

## Checklist global (panorama)

```
DAY 0  □ /my-axies live  □ video grabado  □ video subido YT (No listado)
       □ link YT pegado en deck + email  □ PDF del deck listo

DAY 1  □ Email a builders@ (CC partnerships@)
       □ PDF adjunto < 8 MB
       □ Discord #builders-program post (30-60 min después del email)

DAY 2  □ Twitter thread compuesto antes de postear el primero
       □ Tweet 1 con GIF teaser + tags Sky Mavis
       □ Reply al thread con link YT

DAY 3  □ Discord #mavis-hub-greenlight (o pedir el canal en #tools-api)

DAY 7  □ Email follow-up (solo si no hubo reply)

DAY 14 □ Twitter update con progreso real
+      □ Responder en Discord con substance
```

Cuando los 4 primeros días están ✓, estás dentro de la cola de revisión de Sky Mavis. El resto es mantenimiento.

---

## Reglas de oro (no las rompas)

1. **Nunca DM a co-founders sin invitación**. Cold DMs a `@Jihoz_Axie` en Twitter o Discord = se borran y te flaggean.
2. **Nunca mandes el mismo mensaje en 3 canales el mismo día**. Sky Mavis tiene staff compartido entre Discord y email — lo notan.
3. **Nunca mientas sobre métricas**. Si los tests son 160 verdes, decí 160. Si son 161 al rato, actualizalo. Las stats falsas son lo primero que un evaluador chequea.
4. **Nunca pidas en el primer mensaje "podés conectarme con X"**. Pedís acceso al programa, no atajos.
5. **Si Sky Mavis dice "vamos a revisar y volver en X semanas"**: respetá el timeline. Re-pingar antes = cae al fondo de la cola.
