/**
 * Daily Quests service.
 *
 * Flujo:
 *   1. createDailyQuests(): genera las quests del día (idempotente por window).
 *   2. progressQuest(userId, kind, increment=1): incrementa el current,
 *      marca completed cuando llega a target.
 *   3. claimQuest(userId, questId): si completed && !claimed → earn AXS,
 *      set claimed=true, anti-duplicación atómica vía unique constraint.
 *   4. getActiveQuests(userId): devuelve quests activas + progreso del user.
 *
 * Hooks:
 *   - POST /internal/matches llama progressQuest cuando se persiste un Match
 *     (con kind='WIN_PVE' o 'WIN_PVP' según mode + winnerId).
 */

import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { axsService } from './AxsService.js';
import { notificationService } from './NotificationService.js';
import { logger } from '../lib/logger.js';
import { ValidationError, RuleViolationError, NotFoundError } from '../lib/errors.js';

export type QuestKind = 'WIN_PVE' | 'WIN_PVP' | 'PLAY_GAMES' | 'COMPLETE_TOURNAMENT';

interface QuestTemplate {
  kind: QuestKind;
  target: number;
  rewardAxs: number;
  description: string;
}

/**
 * Set base de quests diarias. Se rota/randomiza en Fase 3 con un pool más amplio.
 * Por ahora 3 fijas que cubren los principales modos de juego.
 */
const DEFAULT_DAILY_TEMPLATES: QuestTemplate[] = [
  { kind: 'WIN_PVE', target: 3, rewardAxs: 25, description: 'Gana 3 partidas PvE' },
  { kind: 'WIN_PVP', target: 1, rewardAxs: 50, description: 'Gana 1 partida PvP' },
  { kind: 'PLAY_GAMES', target: 5, rewardAxs: 15, description: 'Juega 5 partidas (cualquier modo)' },
];

export class QuestService {
  constructor(private db: PrismaClient = prisma) {}

  /**
   * Crea las quests del día actual (UTC). Idempotente: si ya existen quests con
   * validFrom == hoy 00:00 UTC, no las duplica.
   */
  async createDailyQuests(): Promise<{ created: number; existing: number }> {
    const now = new Date();
    const validFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const validUntil = new Date(validFrom.getTime() + 24 * 3600 * 1000);

    const existing = await this.db.dailyQuest.findMany({ where: { validFrom } });
    if (existing.length >= DEFAULT_DAILY_TEMPLATES.length) {
      return { created: 0, existing: existing.length };
    }

    const existingKinds = new Set(existing.map((q) => q.kind));
    const toCreate = DEFAULT_DAILY_TEMPLATES.filter((t) => !existingKinds.has(t.kind));
    await this.db.dailyQuest.createMany({
      data: toCreate.map((t) => ({
        kind: t.kind,
        target: t.target,
        rewardAxs: new Prisma.Decimal(t.rewardAxs),
        description: t.description,
        validFrom,
        validUntil,
      })),
    });
    logger.info({ created: toCreate.length, validFrom }, 'daily quests created');
    return { created: toCreate.length, existing: existing.length };
  }

  /**
   * Incrementa progreso de TODAS las quests activas del kind dado para este user.
   * Si la quest se completa, marca completed=true + completedAt.
   * Idempotente sobre re-ejecución del mismo evento (cuenta cada incremento).
   */
  async progressQuest(userId: string, kind: QuestKind, increment = 1): Promise<void> {
    if (increment <= 0) throw new ValidationError('increment must be positive');
    const now = new Date();
    const activeQuests = await this.db.dailyQuest.findMany({
      where: {
        kind,
        validFrom: { lte: now },
        validUntil: { gt: now },
      },
    });
    if (activeQuests.length === 0) return;

    for (const quest of activeQuests) {
      // Upsert progress.
      const existing = await this.db.userQuestProgress.findUnique({
        where: { userId_questId: { userId, questId: quest.id } },
      });
      if (existing?.claimed) continue; // ya cobrado, no incrementar más

      const newCurrent = (existing?.current ?? 0) + increment;
      const completed = newCurrent >= quest.target;
      await this.db.userQuestProgress.upsert({
        where: { userId_questId: { userId, questId: quest.id } },
        create: {
          userId,
          questId: quest.id,
          current: newCurrent,
          completed,
          ...(completed ? { completedAt: now } : {}),
        },
        update: {
          current: newCurrent,
          ...(completed && !existing?.completed ? { completed: true, completedAt: now } : {}),
        },
      });
    }
  }

  /**
   * Reclama el premio de una quest completada. Anti-duplicación atómica:
   * el WHERE incluye `claimed: false` así que un segundo claim simultáneo
   * actualiza 0 rows y rebota.
   */
  async claimQuest(userId: string, questId: string): Promise<{ rewardAxs: string; newBalance: string }> {
    const progress = await this.db.userQuestProgress.findUnique({
      where: { userId_questId: { userId, questId } },
      include: { quest: true },
    });
    if (!progress) throw new NotFoundError('Quest progress');
    if (!progress.completed) throw new RuleViolationError('Quest not completed yet');
    if (progress.claimed) throw new RuleViolationError('Quest already claimed');

    // Marcar claimed atómicamente — si otro request llegó primero, updateMany
    // afecta 0 rows.
    const claimed = await this.db.userQuestProgress.updateMany({
      where: { id: progress.id, claimed: false },
      data: { claimed: true, claimedAt: new Date() },
    });
    if (claimed.count === 0) throw new RuleViolationError('Quest already claimed (race)');

    const reward = await axsService.earn(
      userId,
      progress.quest.rewardAxs.toString(),
      'EARN_DAILY',
      `quest:${questId}`,
    );
    // Notification (no-fatal — la quest ya está claimed).
    notificationService
      .create(
        userId,
        'QUEST_COMPLETED',
        `Reclamaste ${progress.quest.rewardAxs} AXS de "${progress.quest.description}"`,
        { questId, rewardAxs: progress.quest.rewardAxs.toString() },
      )
      .catch(() => undefined);
    return { rewardAxs: progress.quest.rewardAxs.toString(), newBalance: reward.newBalance };
  }

  /** Lista quests activas + progreso del user (incluye no-iniciadas con current=0). */
  async getActiveQuests(userId: string) {
    const now = new Date();
    const quests = await this.db.dailyQuest.findMany({
      where: { validFrom: { lte: now }, validUntil: { gt: now } },
      orderBy: { kind: 'asc' },
    });
    const progressList = await this.db.userQuestProgress.findMany({
      where: { userId, questId: { in: quests.map((q) => q.id) } },
    });
    const progressByQuest = new Map(progressList.map((p) => [p.questId, p]));
    return quests.map((q) => {
      const p = progressByQuest.get(q.id);
      return {
        id: q.id,
        kind: q.kind,
        target: q.target,
        rewardAxs: q.rewardAxs.toString(),
        description: q.description,
        validUntil: q.validUntil,
        current: p?.current ?? 0,
        completed: p?.completed ?? false,
        claimed: p?.claimed ?? false,
      };
    });
  }
}

export const questService = new QuestService();
