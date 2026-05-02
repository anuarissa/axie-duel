import { Router, type Request, type Response, type NextFunction } from 'express';
import { authRequired } from '../middleware/auth.middleware.js';
import { axieGraphQLService } from '../services/AxieGraphQLService.js';
import { roninService } from '../services/RoninService.js';
import { ValidationError } from '../lib/errors.js';
import type { Address } from 'viem';

const router = Router();

router.get('/sync', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wallet = req.user!.walletAddress;
    if (!wallet) throw new ValidationError('User has no wallet linked');
    const [balance, list] = await Promise.all([
      roninService.getAxieBalance(wallet as Address),
      axieGraphQLService.getAxiesByOwner(wallet),
    ]);
    res.json({ balance, axies: list.axies, total: list.total });
  } catch (err) {
    next(err);
  }
});

router.get('/:axieId', async (req: Request<{ axieId: string }>, res: Response, next: NextFunction) => {
  try {
    const axie = await axieGraphQLService.getAxieById(req.params.axieId);
    if (!axie) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Axie not found' });
      return;
    }
    res.json(axie);
  } catch (err) {
    next(err);
  }
});

export default router;
