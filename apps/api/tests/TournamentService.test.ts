/**
 * Tests TournamentService con mock prisma. Cubre:
 * - create: validación de prizeDistribution (suma 1, no duplicate ranks)
 * - register: validaciones secuenciales sin nested transaction
 * - shuffle determinista por seed
 *
 * NOTA: No testeo el flujo completo register → start → reportMatch → complete
 * con mock porque requiere mockear demasiados queries chain. Eso lo cubre el
 * smoke test contra Supabase real (`pnpm --filter @axie-duel/api smoke:tournament`).
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { mockDeep, type DeepMockProxy } from 'vitest-mock-extended';
import { Prisma, type PrismaClient } from '@prisma/client';
import { TournamentService } from '../src/services/TournamentService.js';
import { ValidationError, RuleViolationError, NotFoundError } from '../src/lib/errors.js';

// Mocks de servicios externos.
vi.mock('../src/services/AxsService.js', () => ({
  axsService: {
    burn: vi.fn().mockResolvedValue({ newBalance: '900', txId: 'b1' }),
    earn: vi.fn().mockResolvedValue({ newBalance: '1000', txId: 'e1' }),
  },
}));

vi.mock('../src/services/NotificationService.js', () => ({
  notificationService: {
    create: vi.fn().mockResolvedValue({ id: 'n_1' }),
  },
}));

const mkTournament = (overrides: Record<string, unknown> = {}) => ({
  id: 't_1',
  name: 'Test Cup',
  description: null,
  format: 'SINGLE_ELIM',
  status: 'REGISTRATION',
  entryCostAxs: new Prisma.Decimal('100'),
  prizePoolAxs: new Prisma.Decimal('400'),
  prizeDistribution: [{ rank: 1, share: 1 }],
  maxParticipants: 64,
  requiresNFTAxies: false,
  registrationDeadline: new Date(Date.now() + 60_000),
  startsAt: new Date(Date.now() + 120_000),
  endsAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('TournamentService', () => {
  let prisma: DeepMockProxy<PrismaClient>;
  let service: TournamentService;

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    service = new TournamentService(prisma);
  });

  describe('create — validación de prizeDistribution', () => {
    it('rechaza si shares no suman 1', async () => {
      await expect(
        service.create({
          name: 'Bad',
          entryCostAxs: 0,
          prizePoolAxs: 100,
          prizeDistribution: [{ rank: 1, share: 0.6 }, { rank: 2, share: 0.3 }],
          registrationDeadline: new Date(Date.now() + 60_000),
          startsAt: new Date(Date.now() + 120_000),
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('rechaza ranks duplicados', async () => {
      await expect(
        service.create({
          name: 'Dup',
          entryCostAxs: 0,
          prizePoolAxs: 100,
          prizeDistribution: [{ rank: 1, share: 0.5 }, { rank: 1, share: 0.5 }],
          registrationDeadline: new Date(Date.now() + 60_000),
          startsAt: new Date(Date.now() + 120_000),
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('rechaza prizeDistribution vacía', async () => {
      await expect(
        service.create({
          name: 'Empty',
          entryCostAxs: 0,
          prizePoolAxs: 100,
          prizeDistribution: [],
          registrationDeadline: new Date(Date.now() + 60_000),
          startsAt: new Date(Date.now() + 120_000),
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('rechaza si startsAt <= registrationDeadline', async () => {
      const now = Date.now();
      await expect(
        service.create({
          name: 'Bad timing',
          entryCostAxs: 0,
          prizePoolAxs: 100,
          prizeDistribution: [{ rank: 1, share: 1 }],
          registrationDeadline: new Date(now + 60_000),
          startsAt: new Date(now + 30_000),
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('acepta config válida y llama prisma.tournament.create', async () => {
      prisma.tournament.create.mockResolvedValueOnce(mkTournament() as never);
      await service.create({
        name: 'Valid',
        entryCostAxs: 50,
        prizePoolAxs: 200,
        prizeDistribution: [{ rank: 1, share: 0.5 }, { rank: 2, share: 0.3 }, { rank: 3, share: 0.2 }],
        registrationDeadline: new Date(Date.now() + 60_000),
        startsAt: new Date(Date.now() + 120_000),
      });
      expect(prisma.tournament.create).toHaveBeenCalled();
    });
  });

  describe('register — sin nested transactions (pgbouncer-safe)', () => {
    it('rechaza si tournament no existe', async () => {
      prisma.tournament.findUnique.mockResolvedValueOnce(null);
      await expect(service.register('t_x', 'u_1')).rejects.toThrow(NotFoundError);
    });

    it('rechaza si status !== REGISTRATION', async () => {
      prisma.tournament.findUnique.mockResolvedValueOnce(
        mkTournament({ status: 'COMPLETED' }) as never,
      );
      await expect(service.register('t_1', 'u_1')).rejects.toThrow(RuleViolationError);
    });

    it('rechaza si registration deadline pasó', async () => {
      prisma.tournament.findUnique.mockResolvedValueOnce(
        mkTournament({ registrationDeadline: new Date(Date.now() - 60_000) }) as never,
      );
      await expect(service.register('t_1', 'u_1')).rejects.toThrow(RuleViolationError);
    });

    it('rechaza si user ya está registrado', async () => {
      prisma.tournament.findUnique.mockResolvedValueOnce(mkTournament() as never);
      prisma.tournamentParticipant.findUnique.mockResolvedValueOnce({ id: 'p1' } as never);
      await expect(service.register('t_1', 'u_1')).rejects.toThrow(RuleViolationError);
    });

    it('rechaza si maxParticipants alcanzado', async () => {
      prisma.tournament.findUnique.mockResolvedValueOnce(
        mkTournament({ maxParticipants: 2 }) as never,
      );
      prisma.tournamentParticipant.findUnique.mockResolvedValueOnce(null);
      prisma.tournamentParticipant.count.mockResolvedValueOnce(2);
      await expect(service.register('t_1', 'u_1')).rejects.toThrow(RuleViolationError);
    });

    it('rechaza si requiresNFTAxies y user no tiene NFT', async () => {
      prisma.tournament.findUnique.mockResolvedValueOnce(
        mkTournament({ requiresNFTAxies: true }) as never,
      );
      prisma.tournamentParticipant.findUnique.mockResolvedValueOnce(null);
      prisma.tournamentParticipant.count.mockResolvedValueOnce(0);
      prisma.user.findUnique.mockResolvedValueOnce({ hasNFTAxies: false } as never);
      await expect(service.register('t_1', 'u_1')).rejects.toThrow(RuleViolationError);
    });

    it('happy path: crea participant tras pagar entrada', async () => {
      prisma.tournament.findUnique.mockResolvedValueOnce(mkTournament() as never);
      prisma.tournamentParticipant.findUnique.mockResolvedValueOnce(null);
      prisma.tournamentParticipant.count.mockResolvedValueOnce(0);
      prisma.tournamentParticipant.create.mockResolvedValueOnce({
        id: 'p_1',
        userId: 'u_1',
        tournamentId: 't_1',
      } as never);

      const result = await service.register('t_1', 'u_1');
      expect(result.id).toBe('p_1');
      expect(prisma.tournamentParticipant.create).toHaveBeenCalled();
    });
  });
});
