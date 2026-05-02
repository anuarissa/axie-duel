/**
 * Demo flow: actúa como anuarissa117 firmando un JWT con JWT_SECRET y haciendo
 * todas las queries vía HTTP al API server (que ya tiene conexión a Supabase).
 *
 * Crea: deck válido + activación + torneo demo + inscripción + match PvE simulado.
 * Resultado: notifications + quest progress + AXS movements + W/L counters
 * actualizados, todo visible en /users/anuarissa117 y /notifications.
 *
 * Pre-requisito: tu API debe estar corriendo en localhost:3001 (`pnpm --filter @axie-duel/api dev`).
 *
 * Uso: pnpm --filter @axie-duel/api exec tsx scripts/demo-flow.ts [username]
 *      (default username: anuarissa117)
 */

import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SignJWT } from 'jose';

(function loadDotenv() {
  const here = dirname(fileURLToPath(import.meta.url));
  let dir = here;
  for (let i = 0; i < 6; i++) {
    const envPath = resolve(dir, '.env');
    if (existsSync(envPath)) {
      dotenv.config({ path: envPath });
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
})();

const API = process.env.API_BASE_URL ?? 'http://localhost:3001';
const JWT_SECRET = process.env.JWT_SECRET ?? '';
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? '';
const USERNAME = process.argv[2] ?? 'anuarissa117';

if (!JWT_SECRET) throw new Error('JWT_SECRET no encontrado en .env');
if (!INTERNAL_TOKEN) throw new Error('INTERNAL_SERVICE_TOKEN no encontrado en .env');

const SECRET_BYTES = new TextEncoder().encode(JWT_SECRET);
const log = (...args: unknown[]) => console.info('  ', ...args);
const section = (s: string) => console.info(`\n=== ${s} ===`);

async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(url, init);
  const txt = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}\n${txt}`);
  return JSON.parse(txt) as T;
}

async function main() {
  section(`Buscando user "${USERNAME}" via GET /users/:username (público)`);
  const profile = await fetchJson<{ id: string; username: string; hasNFTAxies: boolean }>(
    `${API}/users/${USERNAME}`,
  );
  log(`User encontrado: ${profile.id}`);

  section('Firmando JWT del juego con JWT_SECRET');
  const jwt = await new SignJWT({
    userId: profile.id,
    username: profile.username,
    hasNFTAxies: profile.hasNFTAxies,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('axie-duel')
    .setExpirationTime('1h')
    .setIssuedAt()
    .sign(SECRET_BYTES);
  log('JWT generado (válido 1h, equivalente al que tendría el browser)');

  const auth = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };

  section('1. POST /decks → crear deck válido (40 cartas main)');
  let deck: { id: string; name: string; format: string };
  try {
    deck = await fetchJson(`${API}/decks`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        name: 'Demo Deck v1',
        format: 'Standard',
        cards: [
          { cardId: 'mon_beast_001', zone: 'Main', quantity: 3 },
          { cardId: 'mon_aqua_001', zone: 'Main', quantity: 3 },
          { cardId: 'mon_plant_001', zone: 'Main', quantity: 3 },
          { cardId: 'mon_bird_001', zone: 'Main', quantity: 3 },
          { cardId: 'mon_reptile_001', zone: 'Main', quantity: 3 },
          { cardId: 'spl_001', zone: 'Main', quantity: 3 },
          { cardId: 'spl_002', zone: 'Main', quantity: 3 },
          { cardId: 'spl_003', zone: 'Main', quantity: 3 },
          { cardId: 'spl_004', zone: 'Main', quantity: 3 },
          { cardId: 'spl_005', zone: 'Main', quantity: 3 },
          { cardId: 'trp_001', zone: 'Main', quantity: 3 },
          { cardId: 'trp_002', zone: 'Main', quantity: 3 },
          { cardId: 'trp_003', zone: 'Main', quantity: 3 },
          { cardId: 'trp_004', zone: 'Main', quantity: 1 },
        ],
      }),
    });
    log(`Deck creado: ${deck.id} (${deck.name})`);
  } catch (err) {
    log(`Deck create skipped (probable: ya existe). ${(err as Error).message.split('\n')[0]}`);
    const list = await fetchJson<{ decks: Array<{ id: string; name: string; format: string }> }>(
      `${API}/decks`,
      { headers: auth },
    );
    deck = list.decks[0]!;
    log(`Usando deck existente: ${deck.id}`);
  }

  section('2. POST /decks/:id/activate');
  const activated = await fetchJson<{ isActive: boolean }>(`${API}/decks/${deck.id}/activate`, {
    method: 'POST',
    headers: auth,
  });
  log(`Deck activado: isActive=${activated.isActive}`);

  section('3. POST /admin/tournaments — crear torneo (admin only)');
  const now = Date.now();
  let tournament: { id: string; name: string; status: string };
  try {
    tournament = await fetchJson(`${API}/admin/tournaments`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        name: 'Demo Cup',
        description: 'Torneo creado por el demo flow.',
        entryCostAxs: 10,
        prizePoolAxs: 100,
        prizeDistribution: [{ rank: 1, share: 1 }],
        maxParticipants: 8,
        registrationDeadline: new Date(now + 60 * 60 * 1000).toISOString(),
        startsAt: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
      }),
    });
    log(`Torneo creado: ${tournament.id} (${tournament.name}, status=${tournament.status})`);
  } catch (err) {
    log(`Tournament create skipped: ${(err as Error).message.split('\n')[0]}`);
    const list = await fetchJson<{ tournaments: Array<{ id: string; name: string; status: string }> }>(
      `${API}/tournaments?status=REGISTRATION`,
    );
    tournament = list.tournaments[0]!;
    log(`Usando tournament existente: ${tournament?.id}`);
  }

  if (tournament) {
    section('4. POST /tournaments/:id/register — paga 10 AXS y se inscribe');
    try {
      const reg = await fetchJson<{ id: string }>(`${API}/tournaments/${tournament.id}/register`, {
        method: 'POST',
        headers: auth,
      });
      log(`Inscripto: participantId=${reg.id}`);
    } catch (err) {
      log(`Inscripción skipped (ya inscripto): ${(err as Error).message.split('\n')[0]}`);
    }
  }

  section('5. POST /internal/matches — simular match PvE ganado (dispara hooks)');
  const matchResp = await fetchJson<{ matchId: string }>(`${API}/internal/matches`, {
    method: 'POST',
    headers: { 'X-Internal-Token': INTERNAL_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      player1Id: profile.id,
      player2Id: 'BOT',
      winnerId: profile.id,
      mode: 'PvE',
      duration: 42,
      turnsPlayed: 8,
      reason: 'LIFE_POINTS_ZERO',
      replayLog: [
        { t: 0, type: 'MATCH_START', data: { players: [profile.id, 'BOT'] } },
        { t: 5000, type: 'NORMAL_SUMMON', playerId: profile.id, data: { cardInstanceId: 'demo_1' } },
        { t: 12000, type: 'DECLARE_ATTACK', playerId: profile.id, data: { target: 'DIRECT' } },
        { t: 42000, type: 'GAME_OVER', playerId: profile.id, data: { reason: 'LIFE_POINTS_ZERO' } },
      ],
    }),
  });
  log(`Match persistido: ${matchResp.matchId} (PvE, ganaste, 42s)`);
  log('Hooks disparados: quest WIN_PVE+1, PLAY_GAMES+1, notification MATCH_RESULT,');
  log('                  card drop chance 30%, W/L counter +1.');

  await new Promise((r) => setTimeout(r, 1500));

  section('6. Estado final del usuario');
  const me = await fetchJson<{
    username: string;
    axsBalance: string;
    totalWins: number;
    totalLosses: number;
  }>(`${API}/users/me`, { headers: auth });
  log(`User: ${me.username}  AXS=${me.axsBalance}  W/L=${me.totalWins}/${me.totalLosses}`);

  const notifs = await fetchJson<{ unreadCount: number; notifications: Array<{ kind: string; message: string }> }>(
    `${API}/notifications`,
    { headers: auth },
  );
  log(`Notifications no leídas: ${notifs.unreadCount}`);
  notifs.notifications.slice(0, 8).forEach((n) => log(`  [${n.kind}] ${n.message}`));

  const quests = await fetchJson<{ quests: Array<{ kind: string; current: number; target: number; completed: boolean; claimed: boolean }> }>(
    `${API}/quests`,
    { headers: auth },
  );
  log('Quests:');
  quests.quests.forEach((q) =>
    log(`  ${q.kind}: ${q.current}/${q.target}  done=${q.completed}  claimed=${q.claimed}`),
  );

  console.info('\n');
  console.info('████████████████████████████████████████████████████████');
  console.info('  ✅  DEMO COMPLETADO — abrí estos links para VER:');
  console.info('████████████████████████████████████████████████████████');
  console.info('');
  console.info(`  🌐 Tu perfil público (sin auth):`);
  console.info(`     ${API}/users/${USERNAME}`);
  console.info('');
  console.info(`  🌐 Catálogo de cartas:`);
  console.info(`     ${API}/cards`);
  console.info('');
  console.info(`  🌐 Detalle del torneo demo:`);
  console.info(`     ${API}/tournaments/${tournament?.id ?? '—'}`);
  console.info('');
  console.info(`  🌐 Replay log del match:`);
  console.info(`     ${API}/matches/${matchResp.matchId}/replay`);
  console.info('');
  console.info(`  🌐 Swagger UI (todos los endpoints, click "Authorize"):`);
  console.info(`     ${API}/docs`);
  console.info('');
}

main().catch((err) => {
  console.error('DEMO FAILED:', err);
  process.exit(1);
});
