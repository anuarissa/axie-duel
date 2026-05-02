import { Router, type Request, type Response, type NextFunction } from 'express';
import { authRequired } from '../middleware/auth.middleware.js';
import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';

const router = Router();

router.get('/me', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        username: true,
        email: true,
        walletAddress: true,
        hasNFTAxies: true,
        eloRanked: true,
        eloRankedNFT: true,
        level: true,
        xp: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundError('User');
    res.json(user);
  } catch (err) {
    next(err);
  }
});

export default router;
