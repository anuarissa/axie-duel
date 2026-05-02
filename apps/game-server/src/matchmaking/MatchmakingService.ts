/**
 * Matchmaking via Redis sorted sets. Algoritmo: tolerancia ELO crece linealmente
 * desde ±50 a ±200 al cabo de 60s en cola.
 *
 * Esquema de keys:
 *   mm:queue:<mode>          ZSET de userId → enqueue timestamp
 *   mm:elo:<userId>          STRING con ELO al momento del enqueue
 *
 * NOTA: este servicio aún no está integrado al Room. Es la base para Fase 3.
 */

import {
  ELO_INITIAL,
  MATCHMAKING_INITIAL_TOLERANCE,
  MATCHMAKING_MAX_TOLERANCE,
  MATCHMAKING_TOLERANCE_GROW_MS,
} from '@axie-duel/game-rules';
import Redis from 'ioredis';

export type MmMode = 'casual' | 'ranked' | 'ranked_nft';

export class MatchmakingService {
  constructor(private redis: Redis) {}

  async enqueue(userId: string, mode: MmMode, elo = ELO_INITIAL): Promise<void> {
    const now = Date.now();
    await Promise.all([
      this.redis.zadd(`mm:queue:${mode}`, now, userId),
      this.redis.set(`mm:elo:${userId}`, elo.toString(), 'EX', 600),
    ]);
  }

  async dequeue(userId: string, mode: MmMode): Promise<void> {
    await this.redis.zrem(`mm:queue:${mode}`, userId);
  }

  /** Busca un oponente compatible con la tolerancia actual. */
  async findMatch(userId: string, mode: MmMode): Promise<string | null> {
    const eloStr = await this.redis.get(`mm:elo:${userId}`);
    if (!eloStr) return null;
    const myElo = parseInt(eloStr, 10);

    const enqueueScore = await this.redis.zscore(`mm:queue:${mode}`, userId);
    if (!enqueueScore) return null;
    const waitedMs = Date.now() - Number(enqueueScore);
    const ratio = Math.min(1, waitedMs / MATCHMAKING_TOLERANCE_GROW_MS);
    const tolerance =
      MATCHMAKING_INITIAL_TOLERANCE +
      Math.floor((MATCHMAKING_MAX_TOLERANCE - MATCHMAKING_INITIAL_TOLERANCE) * ratio);

    const candidates = await this.redis.zrange(`mm:queue:${mode}`, 0, -1);
    for (const candidate of candidates) {
      if (candidate === userId) continue;
      const cEloStr = await this.redis.get(`mm:elo:${candidate}`);
      if (!cEloStr) continue;
      const cElo = parseInt(cEloStr, 10);
      if (Math.abs(cElo - myElo) <= tolerance) {
        // Candidato encontrado: removemos a ambos de la cola.
        await Promise.all([
          this.redis.zrem(`mm:queue:${mode}`, userId),
          this.redis.zrem(`mm:queue:${mode}`, candidate),
        ]);
        return candidate;
      }
    }
    return null;
  }

  async queueLength(mode: MmMode): Promise<number> {
    return this.redis.zcard(`mm:queue:${mode}`);
  }
}
