import { Router, type Request, type Response, type NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cards = await prisma.card.findMany({ orderBy: [{ type: 'asc' }, { rarity: 'asc' }, { name: 'asc' }] });
    res.json({ count: cards.length, cards });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const card = await prisma.card.findUnique({ where: { id: req.params.id } });
    if (!card) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Card not found' });
      return;
    }
    res.json(card);
  } catch (err) {
    next(err);
  }
});

export default router;
