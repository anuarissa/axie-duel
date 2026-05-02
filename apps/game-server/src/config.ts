import 'dotenv/config';
import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  GAME_SERVER_PORT: z.coerce.number().int().positive().default(2567),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
});

export const config = ConfigSchema.parse(process.env);
export const allowedOrigins = config.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
