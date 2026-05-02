import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authRequired } from '../middleware/auth.middleware.js';
import { starterDeckService, type StarterArchetype } from '../services/StarterDeckService.js';
import { ValidationError, RuleViolationError } from '../lib/errors.js';

const router = Router();

const ClaimBody = z.object({
  archetype: z.enum(['plant', 'bird', 'beast']),
});

/** Lista pública de los 3 archetypes (para mostrar en /starter UI). */
router.get('/archetypes', (_req: Request, res: Response) => {
  res.json({ archetypes: starterDeckService.listArchetypes() });
});

/** Estado del usuario: ya pickeó un starter? cuál? id del deck creado? */
router.get('/status', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = await starterDeckService.getStatus(req.user!.userId);
    res.json(status);
  } catch (err) {
    next(err);
  }
});

/** Reclamar starter deck. One-shot: si ya pickeó, devuelve 409. */
router.post('/claim', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = ClaimBody.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(`Invalid body: ${parsed.error.message}`);
    }
    const result = await starterDeckService.claimStarterDeck(
      req.user!.userId,
      parsed.data.archetype as StarterArchetype,
    );
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof RuleViolationError && err.message.startsWith('STARTER_ALREADY_PICKED')) {
      res.status(409).json({ error: 'STARTER_ALREADY_PICKED', message: err.message });
      return;
    }
    next(err);
  }
});

export default router;
