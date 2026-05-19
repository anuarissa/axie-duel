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
        lunacianCoins: true,
        starterPicked: true,
        starterArchetype: true,
        tutorialCompleted: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundError('User');
    res.json({
      ...user,
      axsBalance: user.axsBalance.toString(),
      lunacianCoins: user.lunacianCoins.toString(),
    });
  } catch (err) {
    next(err);
  }
});

export const UpdateProfileBody = z.object({
  username: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-z0-9_]+$/i, 'username: solo letras, números, _')
    .optional(),
  displayName: z.string().min(1).max(40).optional(),
  // Acepta una URL http(s) normal O el esquema centinela `hero:<presetId>`
  // de los avatares-héroe generados client-side (ver apps/web/src/lib/heroAvatar.ts).
  // No requiere cambio de schema DB: se guarda en la misma columna avatarUrl.
  avatarUrl: z
    .string()
    .max(500)
    .refine(
      (v) => /^https?:\/\//i.test(v) || /^hero:[a-z0-9-]+$/.test(v),
      { message: 'avatarUrl: debe ser una URL http(s) o un preset hero:<id>' },
    )
    .optional(),
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

/**
 * Marca el welcome tutorial como completado para el user actual.
 * Idempotente: si ya está completed, no falla. Llamado desde el cliente al
 * cerrar el TutorialWelcomeModal (slide 5 → "Got it!"). El replay manual
 * desde /rules NO toca este endpoint.
 */
router.post('/me/tutorial-complete', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { tutorialCompleted: true },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Perfil PÚBLICO de un usuario por username. NO requiere auth.
 * Expone solo info no-sensible (sin email, walletAddress, axsBalance, isAdmin).
 */
router.get('/:username', async (req: Request<{ username: string }>, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        hasNFTAxies: true,
        eloRanked: true,
        eloRankedNFT: true,
        level: true,
        xp: true,
        totalWins: true,
        totalLosses: true,
        totalDraws: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundError('User');
    const totalGames = user.totalWins + user.totalLosses + user.totalDraws;
    const winRate = totalGames > 0 ? user.totalWins / totalGames : 0;
    res.json({ ...user, totalGames, winRate: Number(winRate.toFixed(3)) });
  } catch (err) {
    next(err);
  }
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
