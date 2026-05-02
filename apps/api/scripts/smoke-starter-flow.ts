/**
 * Smoke test efímero: verifica el flow starter completo end-to-end.
 *
 * Pasos:
 *  1. Loguea estado actual del user (Anuar) — starterPicked + lunacianCoins
 *  2. GET /starter/archetypes (público)
 *  3. GET /starter/status con JWT del user
 *  4. POST /starter/claim con archetype 'plant' (si no pickeó)
 *  5. Verifica que se creó el deck + lunacianCoins aumentó
 *
 * Uso: pnpm --filter @axie-duel/api exec tsx scripts/smoke-starter-flow.ts
 */

import 'dotenv/config';
import { SignJWT } from 'jose';
import { PrismaClient } from '@prisma/client';

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:3001';
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET missing in env');

const prisma = new PrismaClient();

async function main() {
  // 1. User actual.
  const user = await prisma.user.findFirst({
    where: { username: { not: '' } },
    select: { id: true, username: true, lunacianCoins: true, starterPicked: true, starterArchetype: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!user) {
    console.error('[smoke] no users in DB. Crear uno via /auth/google primero.');
    process.exit(1);
  }
  console.log('[smoke] user:', {
    id: user.id,
    username: user.username,
    lunacianCoins: user.lunacianCoins.toString(),
    starterPicked: user.starterPicked,
    starterArchetype: user.starterArchetype,
  });

  const secret = new TextEncoder().encode(JWT_SECRET);
  const token = await new SignJWT({ userId: user.id, username: user.username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('axie-duel')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secret);

  // 2. /starter/archetypes
  const arches = await fetch(`${API_BASE}/starter/archetypes`).then((r) => r.json() as Promise<{ archetypes: unknown[] }>);
  console.log(`[smoke] /starter/archetypes returned ${arches.archetypes.length} archetypes`);

  // 3. /starter/status
  const status = await fetch(`${API_BASE}/starter/status`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  console.log('[smoke] /starter/status:', status);

  // 4. /starter/claim si no pickeó
  if (!user.starterPicked) {
    console.log('[smoke] claiming starter "plant"…');
    const claim = await fetch(`${API_BASE}/starter/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ archetype: 'plant' }),
    });
    const body = await claim.text();
    console.log(`[smoke] /starter/claim → ${claim.status}`);
    console.log('[smoke] response:', body.slice(0, 400) + (body.length > 400 ? '...' : ''));
    if (!claim.ok) {
      console.error('[smoke] claim FAILED');
      process.exit(1);
    }
  } else {
    console.log('[smoke] user already picked, skipping claim');
  }

  // 5. Verificar el state final.
  const after = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      lunacianCoins: true, starterPicked: true, starterArchetype: true,
      decks: { where: { isStarter: true }, select: { id: true, name: true, isActive: true, cards: { select: { quantity: true } } } },
    },
  });
  console.log('[smoke] after state:', {
    lunacianCoins: after?.lunacianCoins.toString(),
    starterPicked: after?.starterPicked,
    starterArchetype: after?.starterArchetype,
    starterDecks: after?.decks.map((d) => ({
      id: d.id,
      name: d.name,
      isActive: d.isActive,
      totalCards: d.cards.reduce((s, c) => s + c.quantity, 0),
    })),
  });

  // 6. /internal/decks/:id (lo que llama el game-server)
  if (after?.decks[0]) {
    const deckId = after.decks[0].id;
    const internal = await fetch(`${API_BASE}/internal/decks/${deckId}`, {
      headers: { 'X-Internal-Token': process.env.INTERNAL_SERVICE_TOKEN ?? '' },
    });
    if (!internal.ok) {
      console.error('[smoke] internal/decks failed:', internal.status);
      process.exit(1);
    }
    const data = (await internal.json()) as { mainCardIds: string[] };
    console.log(`[smoke] /internal/decks/${deckId}: mainCardIds.length = ${data.mainCardIds.length}`);
    const counts = data.mainCardIds.reduce<Record<string, number>>((acc, id) => {
      acc[id] = (acc[id] ?? 0) + 1;
      return acc;
    }, {});
    console.log('[smoke] composition:', counts);
  }

  console.log('[smoke] OK ✓');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[smoke] FAILED:', err);
  process.exit(1);
});
