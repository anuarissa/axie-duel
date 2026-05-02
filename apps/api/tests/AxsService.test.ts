/**
 * Tests AxsService con mock PrismaClient (vitest-mock-extended).
 * NO toca DB real — la lógica de Decimal + transactions + earn/burn/transfer
 * es lo que verificamos.
 *
 * Para los tests E2E contra DB real ver scripts/smoke-tournament.ts.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { mockDeep, type DeepMockProxy } from 'vitest-mock-extended';
import { Prisma, type PrismaClient } from '@prisma/client';
import { AxsService } from '../src/services/AxsService.js';
import { ValidationError, RuleViolationError } from '../src/lib/errors.js';

type MockPrisma = DeepMockProxy<PrismaClient>;

describe('AxsService', () => {
  let prisma: MockPrisma;
  let service: AxsService;

  beforeEach(() => {
    // mockDeep recurses nested namespaces (prisma.user, prisma.axsTransaction, etc.).
    // Crear fresh por test (sin mockReset — destruye sub-estructura).
    prisma = mockDeep<PrismaClient>();
    service = new AxsService(prisma);
  });

  describe('getBalance', () => {
    it('returns balance string', async () => {
      prisma.user.findUnique.mockResolvedValue({ axsBalance: new Prisma.Decimal('123.45') } as never);
      const balance = await service.getBalance('user_1');
      expect(balance).toBe('123.45');
    });

    it('throws if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getBalance('nope')).rejects.toThrow(ValidationError);
    });
  });

  describe('earn', () => {
    it('rejects amount <= 0', async () => {
      await expect(service.earn('u', 0, 'EARN_DAILY', 'test')).rejects.toThrow(ValidationError);
      await expect(service.earn('u', -10, 'EARN_DAILY', 'test')).rejects.toThrow(ValidationError);
    });

    it('rejects invalid amount strings', async () => {
      await expect(service.earn('u', 'not-a-number', 'EARN_DAILY', 'test')).rejects.toThrow(
        ValidationError,
      );
    });

    it('applies positive delta and returns newBalance + txId', async () => {
      // $transaction recibe un callback que se ejecuta con `tx`. Configuramos
      // el mock para que invoque el callback con un objeto que se comporte como prisma.
      prisma.$transaction.mockImplementation((async (cb: (tx: MockPrisma) => unknown) => {
        // Dentro de la callback, simular que el user existe con balance 100.
        prisma.user.findUnique.mockResolvedValueOnce({
          axsBalance: new Prisma.Decimal('100'),
        } as never);
        prisma.user.update.mockResolvedValueOnce({} as never);
        prisma.axsTransaction.create.mockResolvedValueOnce({ id: 'tx_123' } as never);
        return cb(prisma);
      }) as never);

      const result = await service.earn('u', 50, 'EARN_DAILY', 'first_login');
      expect(result.newBalance).toBe('150');
      expect(result.txId).toBe('tx_123');
    });
  });

  describe('burn', () => {
    it('rejects amount <= 0', async () => {
      await expect(service.burn('u', 0, 'BURN_NFT_MINT', 'test')).rejects.toThrow(ValidationError);
      await expect(service.burn('u', -5, 'BURN_NFT_MINT', 'test')).rejects.toThrow(ValidationError);
    });

    it('subtracts when balance is sufficient', async () => {
      prisma.$transaction.mockImplementation((async (cb: (tx: MockPrisma) => unknown) => {
        prisma.user.findUnique.mockResolvedValueOnce({
          axsBalance: new Prisma.Decimal('200'),
        } as never);
        prisma.user.update.mockResolvedValueOnce({} as never);
        prisma.axsTransaction.create.mockResolvedValueOnce({ id: 'tx_burn' } as never);
        return cb(prisma);
      }) as never);

      const result = await service.burn('u', 75, 'BURN_TOURNAMENT_ENTRY', 'tournament:abc');
      expect(result.newBalance).toBe('125');
    });

    it('rejects when balance insufficient (does not go negative)', async () => {
      prisma.$transaction.mockImplementation((async (cb: (tx: MockPrisma) => unknown) => {
        prisma.user.findUnique.mockResolvedValueOnce({
          axsBalance: new Prisma.Decimal('10'),
        } as never);
        return cb(prisma);
      }) as never);

      await expect(service.burn('u', 100, 'BURN_NFT_MINT', 'mint')).rejects.toThrow(RuleViolationError);
    });
  });

  describe('assertSufficient', () => {
    it('passes when balance >= amount', async () => {
      prisma.user.findUnique.mockResolvedValue({ axsBalance: new Prisma.Decimal('500') } as never);
      await expect(service.assertSufficient('u', 200)).resolves.not.toThrow();
    });

    it('throws when balance < amount', async () => {
      prisma.user.findUnique.mockResolvedValue({ axsBalance: new Prisma.Decimal('50') } as never);
      await expect(service.assertSufficient('u', 100)).rejects.toThrow(RuleViolationError);
    });
  });

  describe('transfer', () => {
    it('rejects same-user transfer', async () => {
      await expect(service.transfer('u1', 'u1', 50, 'self')).rejects.toThrow(ValidationError);
    });

    it('rejects amount <= 0', async () => {
      await expect(service.transfer('u1', 'u2', 0, 'test')).rejects.toThrow(ValidationError);
      await expect(service.transfer('u1', 'u2', -10, 'test')).rejects.toThrow(ValidationError);
    });
  });

  describe('Decimal precision', () => {
    it('handles 18 decimal places without floating-point drift', async () => {
      prisma.$transaction.mockImplementation((async (cb: (tx: MockPrisma) => unknown) => {
        prisma.user.findUnique.mockResolvedValueOnce({
          axsBalance: new Prisma.Decimal('0.000000000000000001'),
        } as never);
        prisma.user.update.mockResolvedValueOnce({} as never);
        prisma.axsTransaction.create.mockResolvedValueOnce({ id: 'tx_x' } as never);
        return cb(prisma);
      }) as never);

      const result = await service.earn('u', '0.000000000000000002', 'EARN_DAILY', 'tiny');
      // Decimal.toString() devuelve notación científica para valores muy chicos.
      // El valor matemáticamente correcto es 3e-18 (= 0.000000000000000003).
      expect(new Prisma.Decimal(result.newBalance).equals(new Prisma.Decimal('3e-18'))).toBe(true);
    });
  });
});
