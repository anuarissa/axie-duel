/**
 * CLI: crea las quests del día. Idempotente — si ya existen las del día actual, skip.
 * Uso: pnpm --filter @axie-duel/api db:seed-quests
 *
 * En Fase 3 esto lo correrá un cron (Render scheduled job o similar) cada 24h.
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

const { questService } = await import('../src/services/QuestService.js');
const { prisma } = await import('../src/lib/prisma.js');

async function main() {
  const result = await questService.createDailyQuests();
  console.info(`[seed-quests] created=${result.created} existing=${result.existing}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
