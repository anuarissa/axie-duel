/**
 * Smoke test manual del flujo completo de torneo contra Supabase.
 * Útil para verificar end-to-end después de cambios.
 *
 * Uso: pnpm --filter @axie-duel/api tsx scripts/smoke-tournament.ts
 *
 * NO es un test automatizado (vive en /scripts, no en /tests). Eso es a propósito:
 * el e2e test puede colgarse intermitentemente con pgbouncer y queremos correrlo
 * a mano, no en CI.
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const NAMESPACE = `smoke_${Date.now()}`;
const log = (...args: unknown[]) => console.info(`[${new Date().toISOString().slice(11, 19)}]`, ...args);

async function main() {
  const prisma = new PrismaClient({ log: ['error'] });
  const { tournamentService } = await import('../src/services/TournamentService.js');
  const { axsService } = await import('../src/services/AxsService.js');

  const userIds: string[] = [];
  let tournamentId = '';

  try {
    log('creating 4 synthetic users with 1000 AXS each');
    for (let i = 0; i < 4; i++) {
      const u = await prisma.user.create({
        data: {
          username: `${NAMESPACE}_p${i}`,
          email: `${NAMESPACE}_p${i}@smoke.test`,
          axsBalance: '1000',
        },
      });
      userIds.push(u.id);
    }

    log('creating tournament: entry=100 AXS, prize_pool=400 AXS, dist=50/30/20');
    const t = await tournamentService.create({
      name: `${NAMESPACE} cup`,
      entryCostAxs: 100,
      prizePoolAxs: 400,
      prizeDistribution: [
        { rank: 1, share: 0.5 },
        { rank: 2, share: 0.3 },
        { rank: 3, share: 0.2 },
      ],
      maxParticipants: 4,
      registrationDeadline: new Date(Date.now() + 60_000),
      startsAt: new Date(Date.now() + 120_000),
    });
    tournamentId = t.id;
    log(`tournament ${t.id} created in status=${t.status}`);

    log('registering 4 users');
    for (const uid of userIds) {
      await tournamentService.register(t.id, uid);
    }
    for (const uid of userIds) {
      const balance = await axsService.getBalance(uid);
      console.assert(Number(balance) === 900, `expected 900, got ${balance} for ${uid}`);
    }
    log('all users at 900 AXS (entry 100 burned)');

    log('starting tournament');
    await tournamentService.start(t.id);
    let detail = await tournamentService.getById(t.id);
    log(`status=${detail.status}, round1 matches=${detail.matches.filter((m) => m.round === 1).length}`);

    log('reporting round 1 results (player1 wins each)');
    const round1 = detail.matches.filter((m) => m.round === 1);
    for (const m of round1) {
      log(`  match ${m.id} → winner ${m.player1Id}`);
      await tournamentService.reportMatchResult(m.id, m.player1Id, { player1Score: 8000, player2Score: 0 });
    }

    detail = await tournamentService.getById(t.id);
    const round2 = detail.matches.filter((m) => m.round === 2);
    log(`round 2 created: ${round2.length} matches`);

    log('reporting final');
    const final = round2[0]!;
    await tournamentService.reportMatchResult(final.id, final.player1Id, { player1Score: 8000, player2Score: 0 });

    detail = await tournamentService.getById(t.id);
    log(`final status=${detail.status}`);

    log('verifying ranks + AXS distribution');
    const champion = detail.participants.find((p) => p.finalRank === 1);
    const runnerUp = detail.participants.find((p) => p.finalRank === 2);
    log(`  rank 1: ${champion?.userId}`);
    log(`  rank 2: ${runnerUp?.userId}`);
    if (champion) {
      const balance = await axsService.getBalance(champion.userId);
      log(`  champion balance: ${balance} (expected 1100 = 900 + 200)`);
    }
    if (runnerUp) {
      const balance = await axsService.getBalance(runnerUp.userId);
      log(`  runner-up balance: ${balance} (expected 1020 = 900 + 120)`);
    }

    log('SMOKE TEST PASSED ✓');
  } catch (err) {
    log('SMOKE TEST FAILED:', err);
    process.exitCode = 1;
  } finally {
    log('cleanup');
    if (tournamentId) {
      await prisma.tournamentMatch.deleteMany({ where: { tournamentId } });
      await prisma.tournamentParticipant.deleteMany({ where: { tournamentId } });
      await prisma.tournament.delete({ where: { id: tournamentId } }).catch(() => undefined);
    }
    if (userIds.length) {
      await prisma.axsTransaction.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await prisma.$disconnect();
  }
}

void main();
