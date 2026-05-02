import { Router, type Request, type Response, type NextFunction } from 'express';
import { authRequired } from '../middleware/auth.middleware.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

router.get('/history', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const matches = await prisma.match.findMany({
      where: { OR: [{ player1Id: req.user!.userId }, { player2Id: req.user!.userId }] },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ matches });
  } catch (err) {
    next(err);
  }
});

export default router;
