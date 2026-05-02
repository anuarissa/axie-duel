import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authRequired } from '../middleware/auth.middleware.js';
import { prisma } from '../lib/prisma.js';
import { validateDeck, type DeckEntry } from '@axie-duel/game-rules';
import { ValidationError } from '../lib/errors.js';

const router = Router();

const CreateDeckBody = z.object({
  name: z.string().min(1).max(60),
  format: z.enum(['Standard', 'Premium']),
  cards: z.array(
    z.object({
      cardId: z.string(),
      zone: z.enum(['Main', 'Extra', 'Side']),
      quantity: z.number().int().min(1).max(3),
    }),
  ),
});

router.get('/', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const decks = await prisma.deck.findMany({
      where: { userId: req.user!.userId },
      include: { cards: true },
    });
    res.json({ decks });
  } catch (err) {
    next(err);
  }
});

router.post('/', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = CreateDeckBody.parse(req.body);
    const entries: DeckEntry[] = body.cards;
    const validation = validateDeck(entries);
    if (!validation.valid) throw new ValidationError(`Invalid deck: ${validation.errors.join('; ')}`);

    const deck = await prisma.deck.create({
      data: {
        userId: req.user!.userId,
        name: body.name,
        format: body.format,
        cards: {
          create: body.cards.map((c) => ({
            cardId: c.cardId,
            zone: c.zone,
            quantity: c.quantity,
          })),
        },
      },
      include: { cards: true },
    });
    res.status(201).json(deck);
  } catch (err) {
    next(err);
  }
});

export default router;
