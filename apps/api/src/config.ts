/**
 * Configuración runtime. Validada con Zod al arranque — si falta algo crítico,
 * el proceso muere antes de aceptar tráfico (fail-fast).
 */

import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Auto-load .env subiendo directorios desde este archivo hasta encontrar uno.
// Permite correr `tsx src/index.ts` desde apps/api o desde root indistintamente.
function loadDotenv(): void {
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
}
loadDotenv();

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /// Pino log level. trace < debug < info < warn < error < fatal. Default: dev=debug, prod=info.
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).optional(),
  API_PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  WAYPOINT_CLIENT_ID: z.string().optional(),
  WAYPOINT_REDIRECT_URI: z.string().url().optional(),
  WAYPOINT_ISSUER: z.string().url().default('https://athena.skymavis.com'),
  RONIN_RPC_URL: z.string().url().default('https://saigon-testnet.roninchain.com/rpc'),
  RONIN_CHAIN_ID: z.coerce.number().int().default(2021),
  AXIE_CONTRACT_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .default('0x32950db2a7164ae833121501c797d79e7b79d74c'),
  AXIE_GRAPHQL_URL: z.string().url().default('https://graphql-gateway.axieinfinity.com/graphql'),
  AXIE_GAME_API_URL: z.string().url().default('https://game-api.axie.technology'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  /// Token compartido entre game-server y api para llamadas internas (POST /internal/matches).
  /// Generar con: openssl rand -hex 32. DEBE coincidir con GAME_SERVER_INTERNAL_TOKEN del game-server.
  INTERNAL_SERVICE_TOKEN: z.string().min(32).default('dev_internal_token_min_32_chars_xxxxxxx'),
  AXS_MODE: z.enum(['offchain', 'onchain']).default('offchain'),
  AXS_TOKEN_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional().or(z.literal('').transform(() => undefined)),
  AXS_STARTER_BONUS: z.coerce.number().min(0).default(100),
  // ── OAuth providers Web2. Cada uno opcional — si falta, el endpoint
  // correspondiente (/auth/google, /auth/microsoft, /auth/facebook) responde
  // 401 con code PROVIDER_DISABLED. Configurás los providers que quieras ofrecer.
  GOOGLE_CLIENT_ID: z.string().min(1).optional().or(z.literal('').transform(() => undefined)),
  MICROSOFT_CLIENT_ID: z.string().min(1).optional().or(z.literal('').transform(() => undefined)),
  FACEBOOK_APP_ID: z.string().min(1).optional().or(z.literal('').transform(() => undefined)),
  FACEBOOK_APP_SECRET: z.string().min(1).optional().or(z.literal('').transform(() => undefined)),
});

export type Config = z.infer<typeof ConfigSchema>;

const parsed = ConfigSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('[config] Invalid environment:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config: Config = parsed.data;

export const allowedOrigins = config.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
