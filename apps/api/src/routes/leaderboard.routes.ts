import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

const router = Router();

const Query = z.object({
  mode: z.enum(['ranked', 'rankedNFT']).default('ranked'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mode, limit } = Query.parse(req.query);
    const orderBy = mode === 'rankedNFT' ? { eloRankedNFT: 'desc' as const } : { eloRanked: 'desc' as const };
    const top = await prisma.user.findMany({
      orderBy,
      take: limit,
      select: {
        id: true,
        username: true,
        eloRanked: true,
        eloRankedNFT: true,
        hasNFTAxies: true,
        level: true,
      },
    });
    res.json({ mode, leaderboard: top });
  } catch (err) {
    next(err);
  }
});

export default router;
