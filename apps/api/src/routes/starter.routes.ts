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

/** Previews de los 3 archetypes en una sola call (1 query a DB + cache 10min).
 * Optimización para /store: antes el cliente hacía 3 calls separadas + status; ahora 1 call.
 * Público — no necesita auth. */
router.get('/previews', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const previews = await starterDeckService.previewAllArchetypes();
    res.json({ previews });
  } catch (err) {
    next(err);
  }
});

/** Preview detallado de un archetype: composition enriquecida con datos de cada Card.
 * Usado por /store y dashboard showcase para mostrar "qué incluye" cada starter sin
 * comprometer al user. Público (no necesita auth). */
router.get('/preview/:archetype', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const archetype = req.params.archetype;
    if (archetype !== 'plant' && archetype !== 'bird' && archetype !== 'beast') {
      throw new ValidationError('Invalid archetype. Must be plant, bird, or beast.');
    }
    const preview = await starterDeckService.previewArchetype(archetype as StarterArchetype);
    res.json(preview);
  } catch (err) {
    next(err);
  }
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
