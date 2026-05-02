import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authRequired } from '../middleware/auth.middleware.js';
import { notificationService } from '../services/NotificationService.js';

const router = Router();

const ListQuery = z.object({
  unread: z
    .union([z.literal('true'), z.literal('false')])
    .transform((v) => v === 'true')
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get('/', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = ListQuery.parse(req.query);
    const [items, unreadCount] = await Promise.all([
      notificationService.list(req.user!.userId, {
        ...(q.unread !== undefined ? { unreadOnly: q.unread } : {}),
        limit: q.limit,
        offset: q.offset,
      }),
      notificationService.unreadCount(req.user!.userId),
    ]);
    res.json({
      unreadCount,
      count: items.length,
      notifications: items,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/read', authRequired, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const r = await notificationService.markRead(req.params.id, req.user!.userId);
    res.json(r);
  } catch (err) {
    next(err);
  }
});

router.post('/read-all', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const r = await notificationService.markAllRead(req.user!.userId);
    res.json(r);
  } catch (err) {
    next(err);
  }
});

export default router;
