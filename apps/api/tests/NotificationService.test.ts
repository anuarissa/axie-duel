import { describe, expect, it, beforeEach } from 'vitest';
import { mockDeep, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { NotificationService } from '../src/services/NotificationService.js';

describe('NotificationService', () => {
  let prisma: DeepMockProxy<PrismaClient>;
  let service: NotificationService;

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    service = new NotificationService(prisma);
  });

  describe('create', () => {
    it('inserts notification with kind/message/metadata', async () => {
      prisma.notification.create.mockResolvedValueOnce({ id: 'n_1' } as never);
      const r = await service.create('u1', 'AXS_EARNED', 'Ganaste 50 AXS', { amount: 50 });
      expect(r?.id).toBe('n_1');
      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'u1',
            kind: 'AXS_EARNED',
            message: 'Ganaste 50 AXS',
            metadata: { amount: 50 },
          }),
        }),
      );
    });

    it('returns null on DB error (no-fatal)', async () => {
      prisma.notification.create.mockRejectedValueOnce(new Error('DB down'));
      const r = await service.create('u1', 'SYSTEM', 'test');
      expect(r).toBeNull();
    });
  });

  describe('list', () => {
    it('respects unreadOnly filter', async () => {
      prisma.notification.findMany.mockResolvedValueOnce([]);
      await service.list('u1', { unreadOnly: true, limit: 10 });
      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'u1', read: false },
          take: 10,
        }),
      );
    });

    it('caps limit at 200', async () => {
      prisma.notification.findMany.mockResolvedValueOnce([]);
      await service.list('u1', { limit: 99999 });
      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 200 }),
      );
    });

    it('default sort is createdAt desc', async () => {
      prisma.notification.findMany.mockResolvedValueOnce([]);
      await service.list('u1');
      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
    });
  });

  describe('markRead', () => {
    it('updates only when userId matches (anti-spoof)', async () => {
      prisma.notification.updateMany.mockResolvedValueOnce({ count: 1 });
      const r = await service.markRead('n_1', 'u1');
      expect(r.updated).toBe(1);
      expect(prisma.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'n_1', userId: 'u1', read: false },
        }),
      );
    });

    it('returns updated:0 when notification belongs to other user', async () => {
      prisma.notification.updateMany.mockResolvedValueOnce({ count: 0 });
      const r = await service.markRead('n_1', 'u_attacker');
      expect(r.updated).toBe(0);
    });
  });

  describe('markAllRead', () => {
    it('only marks unread notifs', async () => {
      prisma.notification.updateMany.mockResolvedValueOnce({ count: 5 });
      const r = await service.markAllRead('u1');
      expect(r.updated).toBe(5);
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', read: false },
        data: { read: true, readAt: expect.any(Date) },
      });
    });
  });

  describe('unreadCount', () => {
    it('returns count of unread notifs for user', async () => {
      prisma.notification.count.mockResolvedValueOnce(7);
      const c = await service.unreadCount('u1');
      expect(c).toBe(7);
    });
  });
});
