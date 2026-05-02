/**
 * Servicio de torneos. Fase 0: single-elimination + entrada/premio en AXS off-chain.
 * Fase 3: Swiss + double-elim.
 *
 * Flujo:
 *   create() → status=SCHEDULED
 *   open registration cuando llega `registrationOpensAt` (manual por ahora)
 *   register() → status=REGISTRATION + cobra entryCostAxs (burn)
 *   start() → status=IN_PROGRESS, genera bracket
 *   reportMatchResult() → marca winner, avanza ronda; al cerrar la final, complete()
 *   complete() → status=COMPLETED, distribuye prizes (earn)
 */

import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { ValidationError, RuleViolationError, NotFoundError } from '../lib/errors.js';
import { axsService } from './AxsService.js';
import { notificationService } from './NotificationService.js';
import {
  generateSingleElimBracket,
  generateNextRound,
  computeFinalRanks,
  nextPowerOfTwo,
  totalRounds,
} from './bracket.js';

export interface PrizeShare {
  rank: number;
  share: number; // 0..1
}

export interface CreateTournamentInput {
  name: string;
  description?: string;
  format?: 'SINGLE_ELIM' | 'SWISS' | 'ROUND_ROBIN';
  entryCostAxs: string | number;
  prizePoolAxs: string | number;
  prizeDistribution: PrizeShare[];
  maxParticipants?: number;
  requiresNFTAxies?: boolean;
  registrationDeadline: Date;
  startsAt: Date;
}

export class TournamentService {
  constructor(private db: PrismaClient = prisma) {}

  async create(input: CreateTournamentInput) {
    this.validatePrizeDistribution(input.prizeDistribution);
    if (input.startsAt <= input.registrationDeadline) {
      throw new ValidationError('startsAt must be after registrationDeadline');
    }
    return this.db.tournament.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        format: input.format ?? 'SINGLE_ELIM',
        status: 'REGISTRATION',
        entryCostAxs: new Prisma.Decimal(input.entryCostAxs),
        prizePoolAxs: new Prisma.Decimal(input.prizePoolAxs),
        prizeDistribution: input.prizeDistribution as unknown as Prisma.InputJsonValue,
        maxParticipants: input.maxParticipants ?? 64,
        requiresNFTAxies: input.requiresNFTAxies ?? false,
        registrationDeadline: input.registrationDeadline,
        startsAt: input.startsAt,
      },
    });
  }

  async list(status?: string) {
    return this.db.tournament.findMany({
      ...(status ? { where: { status } } : {}),
      orderBy: { startsAt: 'asc' },
      include: { _count: { select: { participants: true } } },
    });
  }

  async getById(id: string) {
    const t = await this.db.tournament.findUnique({
      where: { id },
      include: {
        participants: {
          include: { user: { select: { id: true, username: true, hasNFTAxies: true } } },
          orderBy: [{ finalRank: 'asc' }, { totalPoints: 'desc' }],
        },
        matches: { orderBy: [{ round: 'asc' }, { bracketSlot: 'asc' }] },
      },
    });
    if (!t) throw new NotFoundError('Tournament');
    return t;
  }

  async register(tournamentId: string, userId: string) {
    // Validaciones (lecturas no-transaccionales).
    const t = await this.db.tournament.findUnique({ where: { id: tournamentId } });
    if (!t) throw new NotFoundError('Tournament');
    if (t.status !== 'REGISTRATION') throw new RuleViolationError('Tournament not open for registration');
    if (new Date() > t.registrationDeadline) throw new RuleViolationError('Registration deadline passed');

    const existing = await this.db.tournamentParticipant.findUnique({
      where: { tournamentId_userId: { tournamentId, userId } },
    });
    if (existing) throw new RuleViolationError('Already registered');

    const count = await this.db.tournamentParticipant.count({ where: { tournamentId } });
    if (count >= t.maxParticipants) throw new RuleViolationError('Tournament full');

    if (t.requiresNFTAxies) {
      const user = await this.db.user.findUnique({ where: { id: userId }, select: { hasNFTAxies: true } });
      if (!user?.hasNFTAxies) throw new RuleViolationError('This tournament requires NFT Axies');
    }

    // 1. Cobrar entrada (AxsService abre su propia $transaction interna).
    //    NO envolver en outer $transaction: Supabase pgbouncer (Transaction mode)
    //    no soporta nested transactions → timeout. Aprendido en E2E.
    if (t.entryCostAxs.gt(0)) {
      await axsService.burn(
        userId,
        t.entryCostAxs.toString(),
        'BURN_TOURNAMENT_ENTRY',
        `tournament:${tournamentId}`,
      );
    }

    // 2. Crear participant. Si falla (race condition con otro register simultáneo
    //    del mismo user → choca contra unique constraint), reembolsar atómicamente.
    try {
      return await this.db.tournamentParticipant.create({
        data: { tournamentId, userId },
        include: { user: { select: { username: true } } },
      });
    } catch (err) {
      if (t.entryCostAxs.gt(0)) {
        await axsService.earn(
          userId,
          t.entryCostAxs.toString(),
          'EARN_REFUND',
          `refund:tournament:${tournamentId}`,
        );
      }
      throw err;
    }
  }

  async start(tournamentId: string) {
    const t = await this.db.tournament.findUnique({
      where: { id: tournamentId },
      include: { participants: true },
    });
    if (!t) throw new NotFoundError('Tournament');
    if (t.status !== 'REGISTRATION') throw new RuleViolationError('Tournament cannot start');
    if (t.participants.length < 2) throw new RuleViolationError('Need at least 2 participants');

    const ids = this.shuffle(t.participants.map((p) => p.userId), tournamentId);
    const round1 = generateSingleElimBracket(ids);

    await this.db.$transaction([
      this.db.tournament.update({ where: { id: tournamentId }, data: { status: 'IN_PROGRESS' } }),
      this.db.tournamentMatch.createMany({
        data: round1.map((m) => ({
          tournamentId,
          round: m.round,
          bracketSlot: m.bracketSlot,
          player1Id: m.player1Id,
          player2Id: m.player2Id,
          status: m.player2Id ? 'PENDING' : 'BYE',
          winnerId: m.player2Id ? null : m.player1Id,
          finishedAt: m.player2Id ? null : new Date(),
        })),
      }),
    ]);

    logger.info({ tournamentId, participants: ids.length, round1Matches: round1.length }, 'tournament started');
    return this.getById(tournamentId);
  }

  /**
   * Reporta el resultado de un match. Si todos los matches de la ronda están completos,
   * genera la siguiente ronda automáticamente. Si era la final, llama a `complete()`.
   */
  async reportMatchResult(matchId: string, winnerId: string, scores?: { player1Score: number; player2Score: number }) {
    const match = await this.db.tournamentMatch.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundError('TournamentMatch');
    if (match.status === 'COMPLETED' || match.status === 'WALKOVER') {
      throw new RuleViolationError('Match already completed');
    }
    if (winnerId !== match.player1Id && winnerId !== match.player2Id) {
      throw new ValidationError('winnerId must be one of the match players');
    }

    await this.db.tournamentMatch.update({
      where: { id: matchId },
      data: {
        winnerId,
        player1Score: scores?.player1Score ?? 0,
        player2Score: scores?.player2Score ?? 0,
        status: 'COMPLETED',
        finishedAt: new Date(),
      },
    });

    // Update participant w/l counters.
    const loserId = winnerId === match.player1Id ? match.player2Id : match.player1Id;
    await this.db.tournamentParticipant.update({
      where: { tournamentId_userId: { tournamentId: match.tournamentId, userId: winnerId } },
      data: { wins: { increment: 1 }, totalPoints: { increment: 3 } },
    });
    if (loserId) {
      await this.db.tournamentParticipant.update({
        where: { tournamentId_userId: { tournamentId: match.tournamentId, userId: loserId } },
        data: { losses: { increment: 1 }, eliminated: true },
      });
    }

    // ¿Toda la ronda terminó?
    const sameRoundMatches = await this.db.tournamentMatch.findMany({
      where: { tournamentId: match.tournamentId, round: match.round },
      orderBy: { bracketSlot: 'asc' },
    });
    const allDone = sameRoundMatches.every((m) => m.winnerId !== null);
    if (!allDone) return { advanced: false };

    // Sí. Si era la final, completar.
    const t = await this.db.tournament.findUnique({
      where: { id: match.tournamentId },
      include: { participants: true },
    });
    if (!t) throw new NotFoundError('Tournament');
    const expectedRounds = totalRounds(t.participants.length);
    if (match.round >= expectedRounds) {
      await this.complete(match.tournamentId);
      return { advanced: true, completed: true };
    }

    // Sino, generar la siguiente ronda.
    const winners = sameRoundMatches.map((m) => m.winnerId!).filter(Boolean);
    const next = generateNextRound(match.round + 1, winners);
    await this.db.tournamentMatch.createMany({
      data: next.map((m) => ({
        tournamentId: match.tournamentId,
        round: m.round,
        bracketSlot: m.bracketSlot,
        player1Id: m.player1Id,
        player2Id: m.player2Id,
        status: m.player2Id ? 'PENDING' : 'BYE',
        winnerId: m.player2Id ? null : m.player1Id,
        finishedAt: m.player2Id ? null : new Date(),
      })),
    });
    return { advanced: true, completed: false, nextRound: match.round + 1 };
  }

  /** Cierra el torneo, asigna ranks finales y reparte premios. */
  async complete(tournamentId: string) {
    const t = await this.db.tournament.findUnique({
      where: { id: tournamentId },
      include: { matches: true, participants: true },
    });
    if (!t) throw new NotFoundError('Tournament');
    if (t.status === 'COMPLETED') return t;

    const ranks = computeFinalRanks(
      t.matches.map((m) => ({
        round: m.round,
        player1Id: m.player1Id,
        player2Id: m.player2Id,
        winnerId: m.winnerId,
      })),
    );

    // Asignar finalRank a cada participante.
    for (const participant of t.participants) {
      const rank = ranks.get(participant.userId);
      if (rank) {
        await this.db.tournamentParticipant.update({
          where: { id: participant.id },
          data: { finalRank: rank },
        });
      }
    }

    // Repartir premios según prizeDistribution + notificar.
    const distribution = t.prizeDistribution as unknown as PrizeShare[];
    for (const slot of distribution) {
      const winner = t.participants.find((p) => ranks.get(p.userId) === slot.rank);
      if (!winner) continue;
      const reward = t.prizePoolAxs.times(slot.share);
      if (reward.lte(0)) continue;
      await axsService.earn(
        winner.userId,
        reward.toString(),
        'EARN_TOURNAMENT',
        `tournament:${tournamentId}:rank${slot.rank}`,
      );
      notificationService
        .create(
          winner.userId,
          'TOURNAMENT_WON',
          `Terminaste #${slot.rank} en "${t.name}" — ganaste ${reward.toString()} AXS`,
          {
            tournamentId,
            tournamentName: t.name,
            rank: slot.rank,
            rewardAxs: reward.toString(),
          },
        )
        .catch(() => undefined);
    }

    await this.db.tournament.update({
      where: { id: tournamentId },
      data: { status: 'COMPLETED', endsAt: new Date() },
    });

    logger.info({ tournamentId }, 'tournament completed and prizes distributed');
    return this.getById(tournamentId);
  }

  async cancel(tournamentId: string, refund = true) {
    const t = await this.db.tournament.findUnique({
      where: { id: tournamentId },
      include: { participants: true },
    });
    if (!t) throw new NotFoundError('Tournament');
    if (t.status === 'COMPLETED' || t.status === 'CANCELLED') return t;

    if (refund && t.entryCostAxs.gt(0)) {
      for (const p of t.participants) {
        await axsService.earn(
          p.userId,
          t.entryCostAxs.toString(),
          'EARN_REFUND',
          `cancel:tournament:${tournamentId}`,
        );
      }
    }

    await this.db.tournament.update({
      where: { id: tournamentId },
      data: { status: 'CANCELLED', endsAt: new Date() },
    });
    return this.getById(tournamentId);
  }

  async leaderboard(tournamentId: string) {
    return this.db.tournamentParticipant.findMany({
      where: { tournamentId },
      orderBy: [{ finalRank: 'asc' }, { totalPoints: 'desc' }, { wins: 'desc' }],
      include: { user: { select: { id: true, username: true, hasNFTAxies: true } } },
    });
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private validatePrizeDistribution(dist: PrizeShare[]): void {
    if (!Array.isArray(dist) || dist.length === 0) {
      throw new ValidationError('prizeDistribution must be a non-empty array');
    }
    const total = dist.reduce((acc, d) => acc + d.share, 0);
    if (Math.abs(total - 1) > 0.001) {
      throw new ValidationError(`prizeDistribution shares must sum to 1 (got ${total})`);
    }
    const ranks = new Set(dist.map((d) => d.rank));
    if (ranks.size !== dist.length) throw new ValidationError('duplicate rank in prizeDistribution');
  }

  /** Shuffle determinista con seed = tournamentId (para reproducibilidad). */
  private shuffle<T>(arr: T[], seed: string): T[] {
    const result = [...arr];
    let state = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) {
      state ^= seed.charCodeAt(i);
      state = Math.imul(state, 0x01000193) >>> 0;
    }
    for (let i = result.length - 1; i > 0; i--) {
      let t = (state += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      const j = Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * (i + 1));
      const tmp = result[i]!;
      result[i] = result[j]!;
      result[j] = tmp;
      state = ((t ^ (t >>> 14)) >>> 0);
    }
    return result;
  }
}

export const tournamentService = new TournamentService();
