/**
 * Lunacian Coins (LC) — moneda local off-chain.
 * Distinta de AXS: AXS es cripto (mint en Ronin con partnership Sky Mavis), LC es interna.
 * Se gana jugando matches y daily quests; se gasta en sobres de cartas, level-ups, slots.
 *
 * Ledger inmutable en `LunacianTransaction`. Mismo patrón que AxsService.
 */

import type { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { ValidationError, RuleViolationError } from '../lib/errors.js';

export type LunacianEarnKind =
  | 'EARN_MATCH'
  | 'EARN_DAILY'
  | 'EARN_QUEST'
  | 'EARN_STARTER_BONUS';

export type LunacianSpendKind =
  | 'SPEND_PACK'
  | 'SPEND_LEVEL_UP'
  | 'SPEND_DECK_SLOT';

export type LunacianTxKind = LunacianEarnKind | LunacianSpendKind;

export interface LunacianLedgerEntry {
  newBalance: string; // BigInt serializado como string para JSON safety
  txId: string;
}

export class LunacianCoinsService {
  constructor(private db: PrismaClient = prisma) {}

  async getBalance(userId: string): Promise<string> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { lunacianCoins: true },
    });
    if (!user) throw new ValidationError('User not found');
    return user.lunacianCoins.toString();
  }

  async earn(
    userId: string,
    amount: number | bigint,
    kind: LunacianEarnKind,
    reason: string,
  ): Promise<LunacianLedgerEntry> {
    const big = this.toBigInt(amount);
    if (big <= 0n) throw new ValidationError('amount must be positive for earn');
    return this.applyDelta(userId, big, kind, reason);
  }

  async spend(
    userId: string,
    amount: number | bigint,
    kind: LunacianSpendKind,
    reason: string,
  ): Promise<LunacianLedgerEntry> {
    const big = this.toBigInt(amount);
    if (big <= 0n) throw new ValidationError('amount must be positive for spend');
    return this.applyDelta(userId, -big, kind, reason);
  }

  async assertSufficient(userId: string, amount: number | bigint): Promise<void> {
    const big = this.toBigInt(amount);
    const balance = BigInt(await this.getBalance(userId));
    if (balance < big) {
      throw new RuleViolationError(`Insufficient Lunacian Coins: needs ${big}, has ${balance}`);
    }
  }

  async getTransactions(userId: string, limit = 50, offset = 0) {
    return this.db.lunacianTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      skip: offset,
    });
  }

  /** Mutación atómica: actualiza balance y crea transacción en una sola tx. */
  private async applyDelta(
    userId: string,
    delta: bigint,
    kind: LunacianTxKind,
    reason: string,
  ): Promise<LunacianLedgerEntry> {
    const result = await this.db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { lunacianCoins: true },
      });
      if (!user) throw new ValidationError('User not found');

      const newBalance = user.lunacianCoins + delta;
      if (newBalance < 0n) {
        throw new RuleViolationError(
          `Insufficient Lunacian Coins: ${user.lunacianCoins} + ${delta} < 0`,
        );
      }

      await tx.user.update({
        where: { id: userId },
        data: { lunacianCoins: newBalance },
      });

      const txRow = await tx.lunacianTransaction.create({
        data: { userId, kind, reason, amount: delta },
      });

      return { newBalance: newBalance.toString(), txId: txRow.id };
    });

    logger.info(
      { userId, kind, reason, delta: delta.toString(), newBalance: result.newBalance },
      'lunacian ledger update',
    );
    return result;
  }

  private toBigInt(amount: number | bigint): bigint {
    if (typeof amount === 'bigint') return amount;
    if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
      throw new ValidationError(`invalid amount (must be integer): ${amount}`);
    }
    return BigInt(amount);
  }
}

export const lunacianCoinsService = new LunacianCoinsService();
