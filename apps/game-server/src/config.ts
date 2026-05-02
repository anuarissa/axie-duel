import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Auto-load .env subiendo directorios desde este archivo hasta encontrar uno.
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
  GAME_SERVER_PORT: z.coerce.number().int().positive().default(2567),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  /// URL base del API REST (apps/api) para persistir Matches al GAME_OVER.
  API_BASE_URL: z.string().url().default('http://localhost:3001'),
  /// Token shared con apps/api para llamadas internas. DEBE matchear INTERNAL_SERVICE_TOKEN del api.
  INTERNAL_SERVICE_TOKEN: z.string().min(32).default('dev_internal_token_min_32_chars_xxxxxxx'),
});

export const config = ConfigSchema.parse(process.env);
export const allowedOrigins = config.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
