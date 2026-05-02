/**
 * Snapshot rápido del estado de la DB para debugging / onboarding.
 * Uso: pnpm --filter @axie-duel/api exec tsx scripts/db-state.ts
 */
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

const { PrismaClient } = await import('@prisma/client');
const p = new PrismaClient();

try {
  const users = await p.user.findMany({
    select: {
      username: true,
      email: true,
      isAdmin: true,
      axsBalance: true,
      walletAddress: true,
      totalWins: true,
      totalLosses: true,
      hasNFTAxies: true,
    },
  });
  console.log('=== USERS ===');
  users.forEach((u) =>
    console.log(
      `  ${u.username}  isAdmin=${u.isAdmin}  AXS=${u.axsBalance}  W/L=${u.totalWins}/${u.totalLosses}  wallet=${u.walletAddress ?? 'none'}  NFTAxies=${u.hasNFTAxies}`,
    ),
  );

  const axs = await p.axsTransaction.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { user: { select: { username: true } } },
  });
  console.log('\n=== AXS TRANSACTIONS (últimas 10) ===');
  axs.forEach((t) => console.log(`  ${t.user.username}: ${t.kind}  ${t.amount.toString()}  reason=${t.reason}`));

  const notifs = await p.notification.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { user: { select: { username: true } } },
  });
  console.log('\n=== NOTIFICATIONS (últimas 10) ===');
  notifs.forEach((n) => console.log(`  ${n.user.username}: [${n.kind}] ${n.message}  read=${n.read}`));

  const decks = await p.deck.findMany({
    include: { user: { select: { username: true } }, _count: { select: { cards: true } } },
  });
  console.log('\n=== DECKS ===');
  decks.forEach((d) =>
    console.log(`  ${d.user.username}: "${d.name}" ${d.format}  cards=${d._count.cards}  active=${d.isActive}`),
  );

  const tournaments = await p.tournament.findMany({
    include: { _count: { select: { participants: true } } },
  });
  console.log('\n=== TOURNAMENTS ===');
  tournaments.forEach((t) =>
    console.log(`  "${t.name}"  ${t.status}  entry=${t.entryCostAxs}  pool=${t.prizePoolAxs}  parts=${t._count.participants}`),
  );

  const quests = await p.userQuestProgress.findMany({
    include: {
      user: { select: { username: true } },
      quest: { select: { kind: true, target: true } },
    },
  });
  console.log('\n=== QUEST PROGRESS ===');
  quests.forEach((q) =>
    console.log(`  ${q.user.username}: ${q.quest.kind}  ${q.current}/${q.quest.target}  done=${q.completed}  claimed=${q.claimed}`),
  );

  const matches = await p.match.findMany({ orderBy: { createdAt: 'desc' }, take: 5 });
  console.log('\n=== MATCHES (últimos 5) ===');
  matches.forEach((m) =>
    console.log(`  ${m.id.slice(0, 8)}  mode=${m.mode}  winner=${m.winnerId?.slice(0, 8) ?? 'none'}  duration=${m.duration}s`),
  );

  const owned = await p.ownedCard.findMany({
    include: { user: { select: { username: true } }, card: { select: { name: true, rarity: true } } },
  });
  console.log('\n=== OWNED CARDS ===');
  owned.forEach((o) => console.log(`  ${o.user.username}: ${o.card.name} (${o.card.rarity})  isNFT=${o.isNFT}`));
} finally {
  await p.$disconnect();
}
