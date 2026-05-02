/**
 * Redis client. Estrategia gradeful:
 *
 *   - Si REDIS_URL es accesible → ioredis normal (Upstash o Docker local).
 *   - Si NO es accesible → fallback a un Map() in-memory que implementa
 *     la subset de comandos que usamos (get/set/del/expire/ttl/zadd/zrange/zrem/zscore/zcard/incr).
 *     Esto evita spam de errores ECONNREFUSED en dev cuando aún no hay Redis,
 *     y permite que el API arranque limpio mientras se configura Upstash.
 *
 * IMPORTANT: el fallback in-memory NO es para producción. Es una conveniencia
 * de dev. En prod el connection error debe escalar y matar el proceso.
 */

import Redis, { type Redis as RedisType } from 'ioredis';
import { config } from '../config.js';
import { logger } from './logger.js';

// ── Tipo del cliente público ─────────────────────────────────────────────
// Solo expone los comandos que el resto del código usa. Si necesitás más,
// los agregás aquí + en `InMemoryRedis`.
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: Array<string | number>): Promise<'OK' | string | null>;
  del(...keys: string[]): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  zadd(key: string, score: number, member: string): Promise<number>;
  zrange(key: string, start: number, stop: number): Promise<string[]>;
  zrem(key: string, ...members: string[]): Promise<number>;
  zscore(key: string, member: string): Promise<string | null>;
  zcard(key: string): Promise<number>;
  on(event: string, handler: (arg: unknown) => void): unknown;
}

// ── In-memory fallback ───────────────────────────────────────────────────
class InMemoryRedis implements RedisLike {
  private store = new Map<string, string>();
  private expirations = new Map<string, number>();
  private zsets = new Map<string, Map<string, number>>();

  private isExpired(key: string): boolean {
    const exp = this.expirations.get(key);
    if (exp && Date.now() > exp) {
      this.store.delete(key);
      this.expirations.delete(key);
      return true;
    }
    return false;
  }

  async get(key: string): Promise<string | null> {
    if (this.isExpired(key)) return null;
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string, ...args: Array<string | number>): Promise<'OK'> {
    this.store.set(key, value);
    // Soporta `EX <seconds>` al estilo ioredis: redis.set(k, v, 'EX', 3600)
    for (let i = 0; i < args.length - 1; i++) {
      if (String(args[i]).toUpperCase() === 'EX') {
        const seconds = Number(args[i + 1]);
        if (Number.isFinite(seconds)) {
          this.expirations.set(key, Date.now() + seconds * 1000);
        }
      }
    }
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const k of keys) {
      if (this.store.delete(k)) count++;
      this.expirations.delete(k);
      this.zsets.delete(k);
    }
    return count;
  }

  async expire(key: string, seconds: number): Promise<number> {
    if (!this.store.has(key) && !this.zsets.has(key)) return 0;
    this.expirations.set(key, Date.now() + seconds * 1000);
    return 1;
  }

  async ttl(key: string): Promise<number> {
    const exp = this.expirations.get(key);
    if (!exp) return -1;
    const remaining = Math.floor((exp - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }

  async incr(key: string): Promise<number> {
    const n = Number(this.store.get(key) ?? '0') + 1;
    this.store.set(key, String(n));
    return n;
  }

  async zadd(key: string, score: number, member: string): Promise<number> {
    let z = this.zsets.get(key);
    if (!z) {
      z = new Map();
      this.zsets.set(key, z);
    }
    const isNew = !z.has(member);
    z.set(member, score);
    return isNew ? 1 : 0;
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    const z = this.zsets.get(key);
    if (!z) return [];
    const sorted = [...z.entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m);
    const end = stop === -1 ? sorted.length : stop + 1;
    return sorted.slice(start, end);
  }

  async zrem(key: string, ...members: string[]): Promise<number> {
    const z = this.zsets.get(key);
    if (!z) return 0;
    let removed = 0;
    for (const m of members) {
      if (z.delete(m)) removed++;
    }
    return removed;
  }

  async zscore(key: string, member: string): Promise<string | null> {
    const z = this.zsets.get(key);
    if (!z) return null;
    const score = z.get(member);
    return score === undefined ? null : String(score);
  }

  async zcard(key: string): Promise<number> {
    return this.zsets.get(key)?.size ?? 0;
  }

  on(_event: string, _handler: (arg: unknown) => void): this {
    return this;
  }
}

// ── Selección del backend ────────────────────────────────────────────────
function buildRedis(): RedisLike {
  const isProd = config.NODE_ENV === 'production';
  const url = config.REDIS_URL;

  // Heurística: si la URL es localhost y NO hay Docker corriendo, usar in-memory directo.
  // En prod siempre intentar conexión real (y fallar con loud error si no anda).
  if (!isProd && /:\/\/(localhost|127\.0\.0\.1|::1)/.test(url)) {
    const probe = new Redis(url, {
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      lazyConnect: true,
      connectTimeout: 1500,
    });
    let isReady = false;
    probe.on('ready', () => {
      isReady = true;
    });
    probe.connect().catch(() => undefined);

    // Esperar 1s asíncronamente; si no conecta, switch a in-memory.
    // Como el resto del código asume el cliente sincrónico, devolvemos un proxy.
    const inMemory = new InMemoryRedis();
    let active: RedisLike = inMemory;
    setTimeout(() => {
      if (isReady) {
        active = probe as unknown as RedisLike;
        logger.info('redis local connected (real)');
      } else {
        probe.disconnect();
        logger.warn('REDIS_URL points to localhost but no Redis listening — using IN-MEMORY fallback. Configure Upstash or run docker:up for persistence.');
      }
    }, 1500);

    return new Proxy(inMemory, {
      get(target, prop) {
        const real = active as unknown as Record<string | symbol, unknown>;
        const value = real[prop];
        if (typeof value === 'function') return value.bind(active);
        const fallback = (target as unknown as Record<string | symbol, unknown>)[prop];
        return typeof fallback === 'function' ? (fallback as (...args: unknown[]) => unknown).bind(target) : fallback;
      },
    }) as RedisLike;
  }

  // URL externa (Upstash, prod): conexión real, fail loud si rompe.
  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });
  client.on('error', (err: unknown) => logger.error({ err }, 'redis error'));
  client.on('connect', () => logger.info('redis connected (external)'));
  return client as unknown as RedisLike;
}

export const redis: RedisLike = buildRedis();
// Mantenemos el tipo concreto por si otro módulo necesita acceso completo a ioredis.
export type { RedisType };
