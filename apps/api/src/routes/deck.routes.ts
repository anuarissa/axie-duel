import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authRequired } from '../middleware/auth.middleware.js';
import { prisma } from '../lib/prisma.js';
import { validateDeck, type DeckEntry } from '@axie-duel/game-rules';
import { ValidationError, NotFoundError, ForbiddenError } from '../lib/errors.js';

const router = Router();

const DeckCardEntry = z.object({
  cardId: z.string(),
  zone: z.enum(['Main', 'Extra', 'Side']),
  quantity: z.number().int().min(1).max(3),
});

const CreateDeckBody = z.object({
  name: z.string().min(1).max(60),
  format: z.enum(['Standard', 'Premium']),
  cards: z.array(DeckCardEntry),
});

const UpdateDeckBody = z.object({
  name: z.string().min(1).max(60).optional(),
  format: z.enum(['Standard', 'Premium']).optional(),
  cards: z.array(DeckCardEntry).optional(),
});

/** Lista todos los decks del user logueado. */
router.get('/', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const decks = await prisma.deck.findMany({
      where: { userId: req.user!.userId },
      include: { cards: true },
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    });
    res.json({ decks });
  } catch (err) {
    next(err);
  }
});

/** Detalle de un deck propio. */
router.get('/:id', authRequired, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const deck = await prisma.deck.findUnique({
      where: { id: req.params.id },
      include: { cards: { include: { card: true } } },
    });
    if (!deck) throw new NotFoundError('Deck');
    if (deck.userId !== req.user!.userId) throw new ForbiddenError('Not your deck');
    res.json(deck);
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
          create: body.cards.map((c) => ({ cardId: c.cardId, zone: c.zone, quantity: c.quantity })),
        },
      },
      include: { cards: true },
    });
    res.status(201).json(deck);
  } catch (err) {
    next(err);
  }
});

/** Update parcial: name, format, cards. Si vienen cards, reemplaza el set entero. */
router.put('/:id', authRequired, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const body = UpdateDeckBody.parse(req.body);
    const existing = await prisma.deck.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Deck');
    if (existing.userId !== req.user!.userId) throw new ForbiddenError('Not your deck');

    if (body.cards) {
      const validation = validateDeck(body.cards);
      if (!validation.valid) throw new ValidationError(`Invalid deck: ${validation.errors.join('; ')}`);
    }

    // Reemplazar cards si vinieron: borrar las viejas + crear las nuevas en una transacción.
    const updated = await prisma.$transaction(async (tx) => {
      if (body.cards) {
        await tx.deckCard.deleteMany({ where: { deckId: existing.id } });
      }
      return tx.deck.update({
        where: { id: existing.id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.format !== undefined ? { format: body.format } : {}),
          ...(body.cards
            ? {
                cards: {
                  create: body.cards.map((c) => ({ cardId: c.cardId, zone: c.zone, quantity: c.quantity })),
                },
              }
            : {}),
        },
        include: { cards: true },
      });
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/** Marca este deck como activo (y desactiva los otros del user). */
router.post('/:id/activate', authRequired, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.deck.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Deck');
    if (existing.userId !== req.user!.userId) throw new ForbiddenError('Not your deck');

    await prisma.$transaction([
      prisma.deck.updateMany({ where: { userId: req.user!.userId }, data: { isActive: false } }),
      prisma.deck.update({ where: { id: existing.id }, data: { isActive: true } }),
    ]);
    const refreshed = await prisma.deck.findUnique({
      where: { id: existing.id },
      include: { cards: true },
    });
    res.json(refreshed);
  } catch (err) {
    next(err);
  }
});

/** Borra el deck (cascadea las DeckCards via onDelete: Cascade en schema). */
router.delete('/:id', authRequired, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.deck.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Deck');
    if (existing.userId !== req.user!.userId) throw new ForbiddenError('Not your deck');
    await prisma.deck.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
