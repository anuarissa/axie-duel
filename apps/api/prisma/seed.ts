/**
 * Seed: carga el catálogo de cartas en la DB.
 * Uso: pnpm --filter @axie-duel/api db:seed
 */

import { PrismaClient } from '@prisma/client';
import { allCards } from '@axie-duel/card-database';
import type { Card } from '@axie-duel/shared-types';
import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Auto-load .env raíz para que prisma encuentre DATABASE_URL/DIRECT_URL.
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

const prisma = new PrismaClient();

function pickSubtype(c: Card): string | null {
  if (c.type === 'Spell') return c.subtype;
  if (c.type === 'Trap') return c.subtype;
  return null;
}

async function main() {
  console.info(`[seed] loading ${allCards.length} cards into Card table...`);

  for (const c of allCards) {
    await prisma.card.upsert({
      where: { id: c.id },
      update: {},
      create: {
        id: c.id,
        name: c.name,
        type: c.type,
        subType: pickSubtype(c),
        rarity: c.rarity,
        attribute: c.type === 'Monster' ? c.attribute : null,
        level: c.type === 'Monster' ? c.level : null,
        atk: c.type === 'Monster' ? c.atk : null,
        def: c.type === 'Monster' ? c.def : null,
        effectJson: (c.effect ?? {}) as object,
        imageUrl: c.imageUrl,
        description: c.description,
      },
    });
  }

  console.info('[seed] done.');
}

main()
  .catch((err) => {
    console.error('[seed] error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
