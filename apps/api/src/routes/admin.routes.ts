/**
 * Endpoints administrativos. Requieren JWT + isAdmin=true.
 * Por convención todo bajo /admin/*.
 *
 *   POST   /admin/tournaments              — crear torneo (alias del POST /tournaments authRequired)
 *   POST   /admin/tournaments/:id/start    — fuerza el start (saltea registrationDeadline)
 *   POST   /admin/tournaments/:id/cancel   — cancela y reembolsa
 *   POST   /admin/users/:id/grant-axs      — emite AXS al usuario (compensaciones, eventos)
 *   POST   /admin/users/:id/promote        — promueve a admin
 *   POST   /admin/users/:id/demote         — quita admin
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authRequired } from '../middleware/auth.middleware.js';
import { adminRequired } from '../middleware/admin.middleware.js';
import { tournamentService, type PrizeShare } from '../services/TournamentService.js';
import { axsService } from '../services/AxsService.js';
import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';

const router = Router();

router.use(authRequired, adminRequired);

const PrizeShareSchema = z.object({
  rank: z.number().int().min(1).max(64),
  share: z.number().min(0).max(1),
});

const CreateTournamentBody = z.object({
  name: z.string().min(3).max(80),
  description: z.string().max(2000).optional(),
  format: z.enum(['SINGLE_ELIM', 'SWISS', 'ROUND_ROBIN']).optional(),
  entryCostAxs: z.union([z.string(), z.number()]).default(0),
  prizePoolAxs: z.union([z.string(), z.number()]),
  prizeDistribution: z.array(PrizeShareSchema).min(1),
  maxParticipants: z.number().int().min(2).max(256).optional(),
  requiresNFTAxies: z.boolean().optional(),
  registrationDeadline: z.coerce.date(),
  startsAt: z.coerce.date(),
});

router.post('/tournaments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = CreateTournamentBody.parse(req.body);
    const t = await tournamentService.create({
      name: input.name,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.format !== undefined ? { format: input.format } : {}),
      entryCostAxs: input.entryCostAxs,
      prizePoolAxs: input.prizePoolAxs,
      prizeDistribution: input.prizeDistribution as PrizeShare[],
      ...(input.maxParticipants !== undefined ? { maxParticipants: input.maxParticipants } : {}),
      ...(input.requiresNFTAxies !== undefined ? { requiresNFTAxies: input.requiresNFTAxies } : {}),
      registrationDeadline: input.registrationDeadline,
      startsAt: input.startsAt,
    });
    res.status(201).json(t);
  } catch (err) {
    next(err);
  }
});

router.post('/tournaments/:id/start', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const t = await tournamentService.start(req.params.id);
    res.json(t);
  } catch (err) {
    next(err);
  }
});

router.post('/tournaments/:id/cancel', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const t = await tournamentService.cancel(req.params.id, true);
    res.json(t);
  } catch (err) {
    next(err);
  }
});

const GrantAxsBody = z.object({
  amount: z.union([z.string(), z.number()]),
  reason: z.string().min(1).max(200),
});

router.post('/users/:id/grant-axs', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const { amount, reason } = GrantAxsBody.parse(req.body);
    const result = await axsService.earn(req.params.id, amount, 'EARN_REFUND', `admin-grant:${reason}`);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/users/:id/promote', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const u = await prisma.user.update({ where: { id: req.params.id }, data: { isAdmin: true } });
    res.json({ id: u.id, username: u.username, isAdmin: u.isAdmin });
  } catch {
    throw new NotFoundError('User');
  }
});

router.post('/users/:id/demote', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const u = await prisma.user.update({ where: { id: req.params.id }, data: { isAdmin: false } });
    res.json({ id: u.id, username: u.username, isAdmin: u.isAdmin });
  } catch {
    throw new NotFoundError('User');
  }
});

export default router;
