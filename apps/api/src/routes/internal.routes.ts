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
import { questService, type QuestKind } from '../services/QuestService.js';
import { notificationService } from '../services/NotificationService.js';
import { calculateElo, type EloOutcome } from '@axie-duel/game-rules';

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
        replayUrl: null,
        ...(body.reason ? { reason: body.reason } : {}),
        // Inline el replay log en JSONB para Fase 0. Fase 3 lo movemos a S3 + url.
        ...(body.replayLog ? { replayLog: body.replayLog as object } : {}),
      },
    });

    logger.info(
      { matchId: match.id, mode: body.mode, winner: body.winnerId, duration: body.duration },
      'match persisted',
    );

    // Hook quests: incrementa progreso para AMBOS jugadores en PLAY_GAMES, y para
    // el winner en WIN_PVE / WIN_PVP. Errores son no-fatales — el match ya quedó persistido.
    const realPlayerIds = [body.player1Id, body.player2Id].filter(
      (id): id is string => !!id && id !== 'BOT',
    );
    for (const pid of realPlayerIds) {
      questService.progressQuest(pid, 'PLAY_GAMES', 1).catch((err) =>
        logger.warn({ err, userId: pid }, 'progressQuest PLAY_GAMES failed'),
      );
    }
    if (body.winnerId && body.winnerId !== 'BOT') {
      const winKind: QuestKind = body.mode === 'PvE' ? 'WIN_PVE' : 'WIN_PVP';
      questService.progressQuest(body.winnerId, winKind, 1).catch((err) =>
        logger.warn({ err, userId: body.winnerId }, `progressQuest ${winKind} failed`),
      );
    }

    // Hook W/L/D counters denormalizados (no-fatal). Más rápido que COUNT(*) en /users/:username.
    const wldOps: Promise<unknown>[] = [];
    if (body.winnerId && body.winnerId !== 'BOT') {
      wldOps.push(
        prisma.user.update({ where: { id: body.winnerId }, data: { totalWins: { increment: 1 } } }),
      );
      const loserId = realPlayerIds.find((id) => id !== body.winnerId);
      if (loserId) {
        wldOps.push(
          prisma.user.update({ where: { id: loserId }, data: { totalLosses: { increment: 1 } } }),
        );
      }
    } else if (!body.winnerId && realPlayerIds.length >= 2) {
      // Sin winner = empate: ambos suman draw.
      for (const pid of realPlayerIds) {
        wldOps.push(prisma.user.update({ where: { id: pid }, data: { totalDraws: { increment: 1 } } }));
      }
    }
    Promise.all(wldOps).catch((err) =>
      logger.warn({ err, matchId: match.id }, 'W/L/D counter update failed'),
    );

    // Hook notifications: 'MATCH_RESULT' a cada player real con outcome.
    for (const pid of realPlayerIds) {
      const outcome = !body.winnerId ? 'DRAW' : body.winnerId === pid ? 'WIN' : 'LOSS';
      const message =
        outcome === 'WIN' ? '¡Ganaste tu partida!' : outcome === 'LOSS' ? 'Perdiste tu partida.' : 'Empate.';
      notificationService
        .create(pid, 'MATCH_RESULT', message, {
          matchId: match.id,
          mode: body.mode,
          outcome,
          duration: body.duration,
        })
        .catch((err) => logger.warn({ err, userId: pid }, 'notification create failed'));
    }

    // Hook ELO: solo para PvP_Ranked y PvP_RankedNFT. Aplicamos al field
    // correspondiente (eloRanked o eloRankedNFT). PvE / PvP_Casual no afectan.
    let eloDeltas: { player1: number; player2: number } | null = null;
    const isRanked = body.mode === 'PvP_Ranked' || body.mode === 'PvP_RankedNFT';
    if (isRanked && body.player2Id && body.player1Id !== 'BOT' && body.player2Id !== 'BOT') {
      try {
        const eloField = body.mode === 'PvP_RankedNFT' ? 'eloRankedNFT' : 'eloRanked';
        const [p1, p2] = await Promise.all([
          prisma.user.findUnique({ where: { id: body.player1Id }, select: { id: true, [eloField]: true } as never }),
          prisma.user.findUnique({ where: { id: body.player2Id }, select: { id: true, [eloField]: true } as never }),
        ]);
        if (p1 && p2) {
          const elo1 = (p1 as Record<string, number>)[eloField] ?? 1000;
          const elo2 = (p2 as Record<string, number>)[eloField] ?? 1000;
          const outcome: EloOutcome = !body.winnerId
            ? 'DRAW'
            : body.winnerId === body.player1Id
              ? 'P1_WIN'
              : 'P2_WIN';
          const change = calculateElo(elo1, elo2, outcome);
          await Promise.all([
            prisma.user.update({
              where: { id: body.player1Id },
              data: { [eloField]: change.player1NewElo },
            }),
            prisma.user.update({
              where: { id: body.player2Id },
              data: { [eloField]: change.player2NewElo },
            }),
          ]);
          eloDeltas = { player1: change.player1Delta, player2: change.player2Delta };
          // Persistir el delta en el Match para historiales y verificación.
          await prisma.match.update({
            where: { id: match.id },
            data: { eloDeltas: eloDeltas as object },
          });
          logger.info(
            { matchId: match.id, mode: body.mode, eloDeltas, eloField },
            'elo updated',
          );
        }
      } catch (err) {
        logger.warn({ err, matchId: match.id }, 'elo update failed');
      }
    }

    res.status(201).json({ matchId: match.id, eloDeltas });
  } catch (err) {
    next(err);
  }
});

export default router;
