/**
 * Endpoints service-to-service (game-server → api).
 *
 * Auth: header `X-Internal-Token: <INTERNAL_SERVICE_TOKEN>`. Compara byte-a-byte
 * vía `crypto.timingSafeEqual` para evitar timing attacks.
 *
 * Endpoints:
 *   POST /internal/matches  — game-server llama esto al GAME_OVER para persistir el duelo.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { AuthError, ValidationError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

const router = Router();

// Token check middleware — solo aplica a /internal/*.
router.use((req: Request, _res: Response, next: NextFunction) => {
  const provided = req.header('x-internal-token') ?? '';
  const expected = config.INTERNAL_SERVICE_TOKEN;
  if (provided.length !== expected.length) {
    next(new AuthError('Invalid internal token', 'INTERNAL_AUTH_REQUIRED'));
    return;
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (!timingSafeEqual(a, b)) {
    next(new AuthError('Invalid internal token', 'INTERNAL_AUTH_REQUIRED'));
    return;
  }
  next();
});

const RecordMatchBody = z.object({
  player1Id: z.string().min(1),
  player2Id: z.string().nullable(),
  winnerId: z.string().nullable(),
  mode: z.enum(['PvE', 'PvP_Casual', 'PvP_Ranked', 'PvP_RankedNFT']),
  duration: z.number().int().min(0),
  turnsPlayed: z.number().int().min(0),
  /** Log determinista de eventos del duelo. JSON arbitrario. */
  replayLog: z.array(z.unknown()).optional(),
  /** Razón de fin: LIFE_POINTS_ZERO | DECK_OUT | SURRENDER | DISCONNECT_TIMEOUT */
  reason: z.string().optional(),
});

router.post('/matches', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = RecordMatchBody.parse(req.body);

    // El bot del PvE tiene userId='BOT', NO existe en User table.
    // Si aparece como player1 (siempre player2 según implementación actual de PvERoom),
    // lo guardamos como null + mode=PvE.
    const isBotMatch = body.player2Id === 'BOT' || body.player1Id === 'BOT';
    if (isBotMatch && body.mode !== 'PvE') {
      throw new ValidationError('BOT player only allowed in PvE mode');
    }

    const match = await prisma.match.create({
      data: {
        player1Id: body.player1Id,
        player2Id: body.player2Id === 'BOT' ? null : body.player2Id,
        winnerId: body.winnerId === 'BOT' ? null : body.winnerId,
        mode: body.mode,
        duration: body.duration,
        turnsPlayed: body.turnsPlayed,
        finishedAt: new Date(),
        // El replay log se guarda futuro en S3 (Fase 3). Por ahora lo dejamos en `null`
        // y solo persistimos el resumen del match.
        replayUrl: null,
        ...(body.reason ? {} : {}),
      },
    });

    logger.info(
      { matchId: match.id, mode: body.mode, winner: body.winnerId, duration: body.duration },
      'match persisted',
    );
    res.status(201).json({ matchId: match.id });
  } catch (err) {
    next(err);
  }
});

export default router;
