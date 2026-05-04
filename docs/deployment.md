# Deployment — Axie Duel

## Arquitectura

El monorepo tiene **3 piezas independientes** que necesitan hosting:

| Pieza | Stack | Necesita |
|---|---|---|
| **Web** (`apps/web`) | Next.js 14 | Static + Edge runtime → **Vercel** ideal |
| **API** (`apps/api`) | Express + Prisma + Postgres | Long-running Node + DB → **Railway / Render / Fly** |
| **Game-server** (`apps/game-server`) | Colyseus 0.16 (WebSocket) | Long-running Node + WS support → **Railway / Fly** |
| **DB** | Postgres 16 | Managed → **Supabase / Neon / Railway** |
| **Redis** | redis 7 | Managed → **Upstash (free tier)** |

> Vercel **NO** sirve para API/game-server porque:
> - Las funciones serverless tienen timeout (10–60s) → matchmaking + duelo no encajan.
> - WebSocket persistente no es soportado en Edge Functions estables.
> - Prisma + connection pool requiere un proceso Node de larga duración.

## Setup mínimo "test desde celular"

### Opción A — TÚNEL LOCAL (rápido, sin pagar nada)

Para testear desde el celular SIN deploar el backend a un host pago:
1. Levantás el backend local (`pnpm dev`).
2. Exponés los puertos 3001 (API) y 2567 (game-server) vía **cloudflared** (gratis, sin cuenta).
3. Apuntás Vercel a esas URLs públicas temporales.

**Pasos:**

```powershell
# 1. Instalar cloudflared (Windows, una sola vez):
winget install --id Cloudflare.cloudflared

# 2. En 3 terminales separadas:

# Terminal 1: backend local
cd C:\dev\axie-duel
pnpm dev

# Terminal 2: tunel API (puerto 3001) → URL pública .trycloudflare.com
cloudflared tunnel --url http://localhost:3001
# Output: "https://random-words.trycloudflare.com"

# Terminal 3: tunel game-server (puerto 2567) → otra URL .trycloudflare.com
cloudflared tunnel --url http://localhost:2567
# Output: "https://other-words.trycloudflare.com"
```

3. **Setear env vars en Vercel** (dashboard → Settings → Environment Variables):
   - `NEXT_PUBLIC_API_BASE_URL=https://random-words.trycloudflare.com`
   - `NEXT_PUBLIC_GAME_SERVER_URL=wss://other-words.trycloudflare.com` (¡nota `wss://` no `ws://`!)
   - `NEXT_PUBLIC_GOOGLE_CLIENT_ID=<tu-client-id>` (mismo del .env local)

4. **Re-deployar Vercel** para que use las nuevas vars: `vercel --prod`

5. **Abrir la URL de Vercel desde el celular** (ej: `https://axie-duel.vercel.app`).

⚠️ Limitaciones del túnel: cloudflared genera una URL nueva cada vez que lo reiniciás. Para URLs estables hay que crear una "Cloudflare Tunnel" con cuenta (también gratis).

### Opción B — BACKEND HOSTEADO (estable, ideal para beta)

Cuando quieras URLs permanentes que aguanten varios usuarios:

#### 1. Postgres → Supabase (gratis hasta 500MB)
- Crear proyecto en [supabase.com](https://supabase.com)
- Copiar `Postgres connection string` (use `pooler` para el plan free)
- En `.env`: `DATABASE_URL=postgres://...supabase.co/postgres`

#### 2. Redis → Upstash (gratis hasta 10K cmds/día)
- Crear DB en [upstash.com](https://upstash.com)
- Copiar `REDIS_URL=rediss://...upstash.io:6379` (note `rediss://` para TLS)

#### 3. API → Railway (~$5/mes para 24/7)
- `cd apps/api && railway init` (con `railway login` previo)
- Setear env vars en Railway dashboard (DATABASE_URL, REDIS_URL, JWT_SECRET, etc)
- Deploy: `railway up` desde `apps/api`
- Output: URL pública `https://axie-api-production.up.railway.app`

#### 4. Game-server → Railway (~$5/mes — NECESITA WebSocket support)
- Mismo proceso que API pero desde `apps/game-server`
- Importante: setear `PORT` y exponer `2567` correctamente
- Output: `https://axie-game-prod.up.railway.app` → usar como `wss://...`

#### 5. Vercel env vars
Apuntar a las URLs Railway:
- `NEXT_PUBLIC_API_BASE_URL=https://axie-api-production.up.railway.app`
- `NEXT_PUBLIC_GAME_SERVER_URL=wss://axie-game-prod.up.railway.app`

## Deploy del web a Vercel (paso a paso)

### Primera vez (project setup)

```powershell
cd C:\dev\axie-duel
vercel login           # ya hecho — auth: anuarissa
vercel link            # asocia este folder con un proyecto Vercel
vercel env pull        # opcional: trae env vars del dashboard a .env.local
vercel --prod          # primer deploy a producción
```

Durante `vercel link` te va a preguntar:
- "Set up and deploy?": **Y**
- "Which scope?": tu account `anuarissa`
- "Link to existing project?": **N** (primera vez)
- "What's your project's name?": `axie-duel`
- "In which directory is your code located?": `./` (raíz del monorepo)
- Override settings? **N** (vercel.json ya tiene los settings)

Luego de `vercel --prod`, te da la URL final (ej: `https://axie-duel.vercel.app`).

### Re-deploys posteriores

Cualquier cambio local → `vercel --prod` desde la raíz. Vercel detecta el monorepo (vercel.json), corre `pnpm install` + `pnpm turbo run build --filter=@axie-duel/web`, sube el `.next` output.

**Auto-deploy con git push** (recomendado más adelante):
1. Push el repo a GitHub.
2. En Vercel dashboard → Import Git Repository → selecciona el repo.
3. Cada push a `main` → deploy automático.

## Env vars completas (referencia)

### Web (`apps/web`)
```
NEXT_PUBLIC_API_BASE_URL=https://api.example.com
NEXT_PUBLIC_GAME_SERVER_URL=wss://game.example.com
NEXT_PUBLIC_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
```

### API (`apps/api`)
```
DATABASE_URL=postgres://user:pass@host:5432/db
REDIS_URL=rediss://default:pass@host:6379
JWT_SECRET=<32+ char random string>
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
INTERNAL_SERVICE_TOKEN=<random secret for game-server ↔ api>
PORT=3001
```

### Game-server (`apps/game-server`)
```
PORT=2567
API_BASE_URL=https://api.example.com  (para fetch de decks)
INTERNAL_SERVICE_TOKEN=<must match api>
LOG_LEVEL=info
```

## Checklist post-deploy (probar todo)

- [ ] Vercel URL carga el dashboard (sin errores 500)
- [ ] Login con Google funciona desde el celular
- [ ] `/cards` muestra el catálogo (cards images se ven OK con SVG fallback)
- [ ] `/decks/builder` funciona (deck switcher, save deck)
- [ ] `/play/pve` conecta al game-server (WS handshake exitoso)
- [ ] Todos los SFX suenan + BGM arranca al primer click (si el browser permite AudioContext)
- [ ] Match completo: deploy axie → attack → win → ver +50 LC en game over
- [ ] Dashboard auto-refresh al volver del match (sin F5)

## Inviting testers (compartir la URL con otra gente)

La URL **https://axie-duel.vercel.app** es **pública por default** — cualquiera con el link puede entrar y crear cuenta con Google. NO hay que invitarlos a tu account de Vercel.

⚠️ **Lo único que importa**: que el BACKEND (API + game-server) sea alcanzable desde su red. Si el backend apunta a `localhost`, los testers ven la página pero el login y el match no funcionan.

### Opción A — Test sincronizado (vos prendido durante el test)

Ideal para una sesión rápida con 1-3 personas mientras vos estás disponible.

```powershell
# Terminal 1: backend local (mantener abierto)
cd C:\dev\axie-duel
pnpm dev

# Terminal 2: tunel para la API
cloudflared tunnel --url http://localhost:3001
# → Copia la URL que sale, ej: https://abc-def-ghi.trycloudflare.com

# Terminal 3: tunel para el game-server
cloudflared tunnel --url http://localhost:2567
# → Copia la URL que sale, ej: https://xyz-uvw-rst.trycloudflare.com
```

Después en Vercel dashboard ([vercel.com/anuarissas-projects/axie-duel/settings/environment-variables](https://vercel.com/anuarissas-projects/axie-duel/settings/environment-variables)):

| Key | Value | Environment |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `https://abc-def-ghi.trycloudflare.com` | Production |
| `NEXT_PUBLIC_GAME_SERVER_URL` | `wss://xyz-uvw-rst.trycloudflare.com` (NOTA: `wss://` no `https://`) | Production |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | tu Google OAuth client ID | Production |

Re-deploy para que tome las vars nuevas:

```powershell
cd C:\dev\axie-duel
vercel --prod
```

Compartí el link con tus testers:

> **https://axie-duel.vercel.app** — entrá con tu cuenta de Google y probá el juego. Es web, funciona en celular y desktop.

Mientras vos tengas las 3 terminales corriendo, ellos pueden jugar normal.

⚠️ Cuando cerrás cloudflared o `pnpm dev`, el sitio carga pero el login/match falla. Avisales antes de cortar.

### Opción B — Test continuo (24/7, sin tu PC)

Para beta cerrada con varios usuarios probando en distintos horarios:

1. **Postgres** → [Supabase](https://supabase.com) (free hasta 500MB).
2. **Redis** → [Upstash](https://upstash.com) (free hasta 10K cmds/día).
3. **API + game-server** → [Railway](https://railway.app) (~$5/mes total para ambos).
4. Setear las URLs de Railway en Vercel env vars.
5. URL queda permanente: cualquiera puede jugar a cualquier hora.

Detalles en la sección "Opción B — BACKEND HOSTEADO" arriba.

### Tracking opcional (saber quién prueba)

Agregar Vercel Analytics (free hasta 2.5K events/mes):

```bash
cd apps/web && pnpm add @vercel/analytics
```

En `apps/web/src/app/layout.tsx`:

```tsx
import { Analytics } from '@vercel/analytics/react';
// dentro del <body>:
<Analytics />
```

Después en Vercel dashboard → Analytics tab → vés visitas + páginas más usadas + dispositivos.

### Lista de qué decirles a los testers

Mensaje sugerido:

> 🎮 **Axie Duel — beta interna**
>
> Probá el juego en: **https://axie-duel.vercel.app**
>
> 1. Entrá con tu cuenta de Google.
> 2. La primera vez te pide elegir un starter deck (Plant / Bird / Beast).
> 3. Click "🤖 Play vs Bot" en el dashboard para tu primera partida.
> 4. Cualquier bug, screenshot por WhatsApp.
>
> Funciona en celular (vertical) y PC. Testeado en Chrome/Edge, Safari iOS también.

## Troubleshooting

### "Module not found: @axie-duel/shared-types" en Vercel build
Asegurarse que `pnpm install --no-frozen-lockfile` corre desde la RAÍZ del monorepo (no desde `apps/web`). El `vercel.json` ya tiene esto configurado.

### WebSocket connect fails: "wss connection refused"
- ¿Setteaste `wss://` (TLS) y NO `ws://` (cleartext)? Vercel solo permite `wss://`.
- ¿El game-server está deployado y respondiendo en HTTPS? Probar con `wscat -c wss://your-url`.
- ¿CORS está abierto? El game-server debe permitir el origin `https://your-vercel-url`.

### Build OK pero página blanca al cargar
Probable: env var `NEXT_PUBLIC_*` faltante. Revisar en Vercel dashboard → Settings → Env Vars que estén las 3 (`API_BASE_URL`, `GAME_SERVER_URL`, `GOOGLE_CLIENT_ID`). Después re-deployar (las env vars se aplican al siguiente build).
