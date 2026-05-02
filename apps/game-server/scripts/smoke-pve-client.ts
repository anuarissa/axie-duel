/**
 * Smoke test: cliente Colyseus 0.16 conecta a PvERoom y valida state inicial.
 * Uso: pnpm --filter @axie-duel/game-server exec tsx scripts/smoke-pve-client.ts
 *
 * EXIT CODES: 0 OK, 1 fail.
 */
import { Client } from 'colyseus.js';

const SERVER = process.env.GAME_SERVER_URL ?? 'ws://localhost:2567';
const TIMEOUT_MS = 10_000;

async function main(): Promise<number> {
  console.log(`[smoke] connecting to ${SERVER}`);
  const client = new Client(SERVER);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const room: any = await client.joinOrCreate('pve', { username: 'smoke-test', difficulty: 'Easy' });
  console.log(`[smoke] joined room ${room.roomId} sessionId=${room.sessionId}`);

  // Esperar a que llegue el state con players poblados.
  return await new Promise<number>((resolve) => {
    const timer = setTimeout(() => {
      console.error(`[smoke] FAIL: timeout esperando state después de ${TIMEOUT_MS}ms`);
      console.error(`[smoke] last state snapshot:`, dumpState(room.state));
      resolve(1);
    }, TIMEOUT_MS);

    function check(): boolean {
      const s = room.state;
      if (!s) return false;
      const playerCount = s.players?.size ?? 0;
      const phase = s.phase;
      const turn = s.turnNumber;
      const active = s.activePlayerId;
      console.log(`[smoke] state tick: players=${playerCount} phase=${phase} turn=${turn} active=${active}`);
      if (playerCount === 2 && phase === 'DRAW' && turn === 1 && active && active !== '') {
        clearTimeout(timer);
        console.log(`[smoke] OK — players=2, phase=DRAW, turn=1, activePlayerId=${active}`);
        console.log(`[smoke] full snapshot:`, JSON.stringify(dumpState(s), null, 2));
        room.leave().catch(() => undefined);
        resolve(0);
        return true;
      }
      return false;
    }

    if (check()) return;

    room.onStateChange(() => {
      check();
    });
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dumpState(s: any) {
  if (!s) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const players: Record<string, any> = {};
  if (s.players?.forEach) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    s.players.forEach((p: any, k: string) => {
      players[k] = {
        id: p.id,
        username: p.username,
        lifePoints: p.lifePoints,
        handSize: p.handSize,
        monsterZones: p.monsterZones?.length,
        spellTrapZones: p.spellTrapZones?.length,
      };
    });
  }
  return {
    matchId: s.matchId,
    status: s.status,
    mode: s.mode,
    phase: s.phase,
    turnNumber: s.turnNumber,
    activePlayerId: s.activePlayerId,
    playerCount: s.players?.size ?? 0,
    players,
  };
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error('[smoke] CRASH:', err);
    process.exit(1);
  },
);
