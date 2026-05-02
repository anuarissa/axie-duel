import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authRequired } from '../middleware/auth.middleware.js';
import { axsService } from '../services/AxsService.js';

const router = Router();

router.get('/balance', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const balance = await axsService.getBalance(req.user!.userId);
    res.json({ balance });
  } catch (err) {
    next(err);
  }
});

const TxQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get('/transactions', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit, offset } = TxQuery.parse(req.query);
    const txs = await axsService.getTransactions(req.user!.userId, limit, offset);
    res.json({
      transactions: txs.map((t) => ({
        id: t.id,
        kind: t.kind,
        amount: t.amount.toString(),
        reason: t.reason,
        txHash: t.txHash,
        createdAt: t.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

const BurnBody = z.object({
  amount: z.union([z.string(), z.number()]),
  kind: z.enum(['BURN_NFT_MINT', 'BURN_COSMETIC', 'BURN_DECK_SLOT']),
  reason: z.string().min(1).max(200),
});

router.post('/burn', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = BurnBody.parse(req.body);
    const result = await axsService.burn(req.user!.userId, body.amount, body.kind, body.reason);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
