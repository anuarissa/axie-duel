/**
 * CLI script: promueve un usuario a admin.
 * Uso: pnpm --filter @axie-duel/api db:make-admin <username|id>
 *
 * Si no encuentra username exacto, busca por id. Si tampoco, error.
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

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: db:make-admin <username|id>');
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  let user = await prisma.user.findUnique({ where: { username: arg } });
  if (!user) {
    user = await prisma.user.findUnique({ where: { id: arg } });
  }
  if (!user) {
    console.error(`User "${arg}" not found by username or id`);
    process.exit(1);
  }
  if (user.isAdmin) {
    console.info(`${user.username} (${user.id}) is already admin.`);
    return;
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { isAdmin: true },
  });
  console.info(`Promoted ${updated.username} (${updated.id}) to admin.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
