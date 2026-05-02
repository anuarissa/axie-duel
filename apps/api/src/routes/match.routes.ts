import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authRequired } from '../middleware/auth.middleware.js';
import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';

const router = Router();

const HistoryQuery = z.object({
  mode: z.enum(['PvE', 'PvP_Casual', 'PvP_Ranked', 'PvP_RankedNFT']).optional(),
  /** Filtrar a partidas vs un opponent específico (por userId). */
  opponentId: z.string().optional(),
  /** Solo partidas terminadas (default true). */
  finishedOnly: z
    .union([z.literal('true'), z.literal('false')])
    .transform((v) => v === 'true')
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get('/history', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = HistoryQuery.parse(req.query);
    const userId = req.user!.userId;

    const where = {
      AND: [
        { OR: [{ player1Id: userId }, { player2Id: userId }] },
        ...(q.mode ? [{ mode: q.mode }] : []),
        ...(q.opponentId
          ? [
              {
                OR: [
                  { AND: [{ player1Id: q.opponentId }, { player2Id: userId }] },
                  { AND: [{ player1Id: userId }, { player2Id: q.opponentId }] },
                ],
              },
            ]
          : []),
        ...(q.finishedOnly !== false ? [{ finishedAt: { not: null } }] : []),
      ],
    };

    const [matches, total] = await Promise.all([
      prisma.match.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: q.limit,
        skip: q.offset,
      }),
      prisma.match.count({ where }),
    ]);

    res.json({
      total,
      count: matches.length,
      matches: matches.map((m) => ({
        ...m,
        outcome: m.winnerId === userId ? 'WIN' : m.winnerId ? 'LOSS' : 'DRAW',
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authRequired, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const m = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!m) throw new NotFoundError('Match');
    const userId = req.user!.userId;
    if (m.player1Id !== userId && m.player2Id !== userId) {
      // Por ahora cualquiera puede ver match resumen para Match History público.
      // Si querés private match history estricto, descomentar la siguiente línea:
      // throw new ForbiddenError('Not your match');
    }
    res.json({
      ...m,
      outcome: m.winnerId === userId ? 'WIN' : m.winnerId ? 'LOSS' : 'DRAW',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
