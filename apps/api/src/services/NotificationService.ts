/**
 * NotificationService — gestión del feed in-app de cada usuario.
 *
 * Crear notificaciones desde cualquier punto del backend con:
 *   await notificationService.create(userId, 'AXS_EARNED', 'Ganaste 50 AXS', { amount: 50 })
 *
 * Errores en create() son no-fatales (.catch en el caller). El feed es UX,
 * no quiero que un fallo acá rompa una transacción de match/quest/torneo.
 */

import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

export type NotificationKind =
  | 'AXS_EARNED'
  | 'AXS_BURNED'
  | 'COINS_EARNED'
  | 'QUEST_COMPLETED'
  | 'TOURNAMENT_WON'
  | 'TOURNAMENT_REGISTERED'
  | 'MATCH_RESULT'
  | 'CARD_DROP'
  | 'WALLET_LINKED'
  | 'NFT_MINTED'
  | 'STARTER_CLAIMED'
  | 'LEVEL_UP'
  | 'SYSTEM';

export interface ListOptions {
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
}

export class NotificationService {
  constructor(private db: PrismaClient = prisma) {}

  async create(
    userId: string,
    kind: NotificationKind,
    message: string,
    metadata?: Record<string, unknown>,
  ): Promise<{ id: string } | null> {
    try {
      const n = await this.db.notification.create({
        data: {
          userId,
          kind,
          message,
          ...(metadata ? { metadata: metadata as Prisma.InputJsonValue } : {}),
        },
        select: { id: true },
      });
      return n;
    } catch (err) {
      logger.warn({ err, userId, kind }, 'notification create failed');
      return null;
    }
  }

  async list(userId: string, opts: ListOptions = {}) {
    return this.db.notification.findMany({
      where: {
        userId,
        ...(opts.unreadOnly ? { read: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(opts.limit ?? 50, 200),
      skip: opts.offset ?? 0,
    });
  }

  async unreadCount(userId: string): Promise<number> {
    return this.db.notification.count({ where: { userId, read: false } });
  }

  async markRead(notificationId: string, userId: string): Promise<{ updated: number }> {
    // Anti-spoof: WHERE incluye userId, así un user no puede marcar notifs ajenas como leídas.
    const result = await this.db.notification.updateMany({
      where: { id: notificationId, userId, read: false },
      data: { read: true, readAt: new Date() },
    });
    return { updated: result.count };
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.db.notification.updateMany({
      where: { userId, read: false },
      data: { read: true, readAt: new Date() },
    });
    return { updated: result.count };
  }
}

export const notificationService = new NotificationService();
