/**
 * LevelService — Sistema de XP y level progression.
 *
 * Modelo:
 *   - `xp` en User es el TOTAL acumulado (lifetime).
 *   - `level` se DERIVA de xp via formula. Se cachea en columna para queries rápidos.
 *
 * Formula de XP requerido por level:
 *   xpForLevelStart(n) = 100 * n * (n - 1) / 2
 *
 *   Level 1: 0 XP   (start)        → necesita 100 XP para alcanzar L2
 *   Level 2: 100 XP (start)        → necesita 200 XP más para L3
 *   Level 3: 300 XP (start)        → necesita 300 XP más para L4
 *   Level 4: 600 XP (start)        → necesita 400 XP más para L5
 *   Level 5: 1000 XP (start)       → necesita 500 XP más para L6
 *   ...
 *   Level N: 100 * N * (N-1) / 2 XP start
 *
 * XP por outcome (ajustable):
 *   - WIN  : 25 XP
 *   - DRAW : 12 XP
 *   - LOSS : 6 XP   (consolation, evita frustration)
 *
 * Idempotencia: el servicio no es idempotente — quien lo llama (internal/matches)
 * debe asegurar que solo se invoca UNA vez por match.
 */

import type { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

export type MatchOutcome = 'WIN' | 'LOSS' | 'DRAW';

export const XP_PER_OUTCOME: Record<MatchOutcome, number> = {
  WIN:  25,
  DRAW: 12,
  LOSS: 6,
};

/** XP necesario acumulado para ESTAR en este level (start). Level 1 = 0. */
export function xpForLevelStart(level: number): number {
  if (level <= 1) return 0;
  return 100 * level * (level - 1) / 2;
}

/** XP requerido para subir DESDE este level al siguiente. */
export function xpForNextLevelDelta(level: number): number {
  return level * 100;
}

/** Deriva el level alcanzado dado el XP total. Inverso de xpForLevelStart. */
export function levelFromTotalXp(totalXp: number): number {
  if (totalXp <= 0) return 1;
  // Resolver L*(L-1)/2 = xp/100 → L = (1 + sqrt(1 + 8*xp/100)) / 2
  const level = Math.floor((1 + Math.sqrt(1 + 8 * totalXp / 100)) / 2);
  return Math.max(1, level);
}

export interface LevelProgress {
  level: number;
  xp: number;                 // total acumulado
  xpInCurrentLevel: number;   // XP ganado dentro del nivel actual
  xpForNextLevel: number;     // XP necesario para llegar al siguiente
  progressRatio: number;      // 0..1
}

export function progressFor(totalXp: number): LevelProgress {
  const level = levelFromTotalXp(totalXp);
  const start = xpForLevelStart(level);
  const need  = xpForNextLevelDelta(level);
  const inLvl = totalXp - start;
  return {
    level,
    xp: totalXp,
    xpInCurrentLevel: inLvl,
    xpForNextLevel: need,
    progressRatio: Math.min(1, Math.max(0, inLvl / need)),
  };
}

export interface XpGrantResult {
  oldXp: number;
  newXp: number;
  oldLevel: number;
  newLevel: number;
  leveledUp: boolean;
  delta: number;
}

export class LevelService {
  constructor(private db: PrismaClient = prisma) {}

  /**
   * Otorga XP a un user dado un outcome de match. Recalcula level y persiste ambos.
   * No-fatal: si falla, retorna null y se loggea el error (el match ya está guardado).
   *
   * @param overrideXp Si presente, usa este valor en vez del default por outcome.
   *                   Útil para difficulty multipliers en PvE.
   */
  async grantMatchXp(userId: string, outcome: MatchOutcome, overrideXp?: number): Promise<XpGrantResult | null> {
    try {
      const user = await this.db.user.findUnique({
        where: { id: userId },
        select: { xp: true, level: true },
      });
      if (!user) return null;
      const delta = overrideXp ?? XP_PER_OUTCOME[outcome];
      const oldXp = user.xp;
      const oldLevel = user.level;
      const newXp = oldXp + delta;
      const newLevel = levelFromTotalXp(newXp);
      await this.db.user.update({
        where: { id: userId },
        data: { xp: newXp, level: newLevel },
      });
      const result: XpGrantResult = {
        oldXp,
        newXp,
        oldLevel,
        newLevel,
        leveledUp: newLevel > oldLevel,
        delta,
      };
      if (result.leveledUp) {
        logger.info({ userId, oldLevel, newLevel, newXp }, 'user leveled up');
      }
      return result;
    } catch (err) {
      logger.warn({ err, userId, outcome }, 'grantMatchXp failed');
      return null;
    }
  }
}

export const levelService = new LevelService();
