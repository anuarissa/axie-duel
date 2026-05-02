import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
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
        emailVerified: true,
        displayName: true,
        avatarUrl: true,
        walletAddress: true,
        hasNFTAxies: true,
        isAdmin: true,
        eloRanked: true,
        eloRankedNFT: true,
        level: true,
        xp: true,
        axsBalance: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundError('User');
    res.json({ ...user, axsBalance: user.axsBalance.toString() });
  } catch (err) {
    next(err);
  }
});

const UpdateProfileBody = z.object({
  username: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-z0-9_]+$/i, 'username: solo letras, números, _')
    .optional(),
  displayName: z.string().min(1).max(40).optional(),
  avatarUrl: z.string().url().max(500).optional(),
});

router.patch('/me', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = UpdateProfileBody.parse(req.body);
    const updated = await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        ...(body.username !== undefined ? { username: body.username } : {}),
        ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
        ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

const ListCardsQuery = z.object({
  type: z.enum(['Monster', 'Spell', 'Trap']).optional(),
  rarity: z.enum(['Common', 'Rare', 'Epic', 'Legendary', 'Mystic']).optional(),
  isNFT: z
    .union([z.literal('true'), z.literal('false')])
    .transform((v) => v === 'true')
    .optional(),
});

/** Lista las cartas que el usuario posee (incluye Starter no-NFT y eventualmente NFT mintadas). */
router.get('/me/cards', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filter = ListCardsQuery.parse(req.query);
    const owned = await prisma.ownedCard.findMany({
      where: {
        userId: req.user!.userId,
        ...(filter.isNFT !== undefined ? { isNFT: filter.isNFT } : {}),
        ...(filter.type || filter.rarity
          ? {
              card: {
                ...(filter.type ? { type: filter.type } : {}),
                ...(filter.rarity ? { rarity: filter.rarity } : {}),
              },
            }
          : {}),
      },
      include: { card: true },
      orderBy: { obtainedAt: 'desc' },
    });
    res.json({
      count: owned.length,
      cards: owned.map((o) => ({
        ownedId: o.id,
        isNFT: o.isNFT,
        tokenId: o.tokenId,
        obtainedAt: o.obtainedAt,
        card: o.card,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
