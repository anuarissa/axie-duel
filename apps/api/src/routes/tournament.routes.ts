import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authRequired } from '../middleware/auth.middleware.js';
import { tournamentService } from '../services/TournamentService.js';

const router = Router();

const PrizeShareSchema = z.object({
  rank: z.number().int().min(1).max(64),
  share: z.number().min(0).max(1),
});

const CreateBody = z.object({
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

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const tournaments = await tournamentService.list(status);
    res.json({ tournaments });
  } catch (err) {
    next(err);
  }
});

router.post('/', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = CreateBody.parse(req.body);
    const t = await tournamentService.create({
      name: input.name,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.format !== undefined ? { format: input.format } : {}),
      entryCostAxs: input.entryCostAxs,
      prizePoolAxs: input.prizePoolAxs,
      prizeDistribution: input.prizeDistribution,
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

router.get('/:id', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const t = await tournamentService.getById(req.params.id);
    res.json(t);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/register', authRequired, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const p = await tournamentService.register(req.params.id, req.user!.userId);
    res.status(201).json(p);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/start', authRequired, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const t = await tournamentService.start(req.params.id);
    res.json(t);
  } catch (err) {
    next(err);
  }
});

const ReportBody = z.object({
  matchId: z.string().min(1),
  winnerId: z.string().min(1),
  player1Score: z.number().int().min(0).optional(),
  player2Score: z.number().int().min(0).optional(),
});

router.post('/:id/match/report', authRequired, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const body = ReportBody.parse(req.body);
    const result = await tournamentService.reportMatchResult(body.matchId, body.winnerId, {
      player1Score: body.player1Score ?? 0,
      player2Score: body.player2Score ?? 0,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/leaderboard', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const lb = await tournamentService.leaderboard(req.params.id);
    res.json({ leaderboard: lb });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/cancel', authRequired, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const t = await tournamentService.cancel(req.params.id, true);
    res.json(t);
  } catch (err) {
    next(err);
  }
});

export default router;
