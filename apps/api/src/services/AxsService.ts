/**
 * AXS Ledger off-chain. Source-of-truth mientras no haya partnership con Sky Mavis.
 *
 * Cuando lleguemos al deal con Sky Mavis y obtengamos el AXS_TOKEN_ADDRESS real:
 * - `burn()` llamará a `AXS.burnFrom(user.walletAddress, amount)` vía viem (requiere allowance previa del usuario).
 * - `earn()` llamará a `AxsTokenMock.mint(user.walletAddress, amount)` mientras es nuestro mock,
 *   o a un contrato de "treasury" que distribuya AXS real cuando Sky Mavis nos asigne supply.
 * - El `axsBalance` en DB se vuelve cache (se sincroniza con `balanceOf(user.walletAddress)`).
 *
 * La interfaz pública (`getBalance`, `earn`, `burn`, `getTransactions`) NO cambia entre off-chain y on-chain.
 */

import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { ValidationError, RuleViolationError } from '../lib/errors.js';

export type AxsEarnKind =
  | 'EARN_TOURNAMENT'
  | 'EARN_DAILY'
  | 'EARN_STARTER_BONUS'
  | 'EARN_REFUND';

export type AxsBurnKind =
  | 'BURN_TOURNAMENT_ENTRY'
  | 'BURN_NFT_MINT'
  | 'BURN_COSMETIC'
  | 'BURN_DECK_SLOT';

export type AxsTxKind = AxsEarnKind | AxsBurnKind;

export interface AxsLedgerEntry {
  newBalance: string; // Decimal serializado como string para no perder precisión
  txId: string;
}

const ZERO = new Prisma.Decimal(0);

export class AxsService {
  constructor(private db: PrismaClient = prisma) {}

  async getBalance(userId: string): Promise<string> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { axsBalance: true },
    });
    if (!user) throw new ValidationError('User not found');
    return user.axsBalance.toString();
  }

  async earn(
    userId: string,
    amount: number | string,
    kind: AxsEarnKind,
    reason: string,
  ): Promise<AxsLedgerEntry> {
    const dec = this.toDecimal(amount);
    if (dec.lte(ZERO)) throw new ValidationError('amount must be positive for earn');
    return this.applyDelta(userId, dec, kind, reason);
  }

  async burn(
    userId: string,
    amount: number | string,
    kind: AxsBurnKind,
    reason: string,
  ): Promise<AxsLedgerEntry> {
    const dec = this.toDecimal(amount);
    if (dec.lte(ZERO)) throw new ValidationError('amount must be positive for burn');
    return this.applyDelta(userId, dec.neg(), kind, reason);
  }

  /** Devuelve el balance restante del jugador sin mutarlo, lanzando si no alcanza. */
  async assertSufficient(userId: string, amount: number | string): Promise<void> {
    const dec = this.toDecimal(amount);
    const balance = await this.getBalance(userId);
    if (new Prisma.Decimal(balance).lt(dec)) {
      throw new RuleViolationError(`Insufficient AXS balance: needs ${dec}, has ${balance}`);
    }
  }

  async getTransactions(userId: string, limit = 50, offset = 0) {
    return this.db.axsTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      skip: offset,
    });
  }

  /**
   * Mutación atómica: actualiza balance y crea transacción en una sola tx.
   * Acepta delta firmado (positivo=earn, negativo=burn).
   */
  private async applyDelta(
    userId: string,
    delta: Prisma.Decimal,
    kind: AxsTxKind,
    reason: string,
  ): Promise<AxsLedgerEntry> {
    const result = await this.db.$transaction(async (tx) => {
      // SELECT FOR UPDATE-equivalente: re-lee + actualiza en la misma tx.
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { axsBalance: true },
      });
      if (!user) throw new ValidationError('User not found');

      const newBalance = user.axsBalance.plus(delta);
      if (newBalance.lt(ZERO)) {
        throw new RuleViolationError(
          `Insufficient AXS balance: ${user.axsBalance.toString()} + ${delta.toString()} < 0`,
        );
      }

      await tx.user.update({
        where: { id: userId },
        data: { axsBalance: newBalance },
      });

      const txRow = await tx.axsTransaction.create({
        data: { userId, kind, reason, amount: delta },
      });

      return { newBalance: newBalance.toString(), txId: txRow.id };
    });

    logger.info({ userId, kind, reason, delta: delta.toString(), newBalance: result.newBalance }, 'axs ledger update');
    return result;
  }

  /** Transferencia interna entre 2 usuarios. Atómica. */
  async transfer(
    fromUserId: string,
    toUserId: string,
    amount: number | string,
    reason: string,
  ): Promise<{ fromBalance: string; toBalance: string }> {
    if (fromUserId === toUserId) throw new ValidationError('cannot transfer to self');
    const dec = this.toDecimal(amount);
    if (dec.lte(ZERO)) throw new ValidationError('amount must be positive');

    return this.db.$transaction(async (tx) => {
      const from = await tx.user.findUnique({ where: { id: fromUserId }, select: { axsBalance: true } });
      const to = await tx.user.findUnique({ where: { id: toUserId }, select: { axsBalance: true } });
      if (!from || !to) throw new ValidationError('User not found');
      if (from.axsBalance.lt(dec)) throw new RuleViolationError('Insufficient balance');

      const newFrom = from.axsBalance.minus(dec);
      const newTo = to.axsBalance.plus(dec);

      await tx.user.update({ where: { id: fromUserId }, data: { axsBalance: newFrom } });
      await tx.user.update({ where: { id: toUserId }, data: { axsBalance: newTo } });
      await tx.axsTransaction.createMany({
        data: [
          { userId: fromUserId, kind: 'BURN_TOURNAMENT_ENTRY', amount: dec.neg(), reason: `transfer:${reason}` },
          { userId: toUserId, kind: 'EARN_TOURNAMENT', amount: dec, reason: `transfer:${reason}` },
        ],
      });

      return { fromBalance: newFrom.toString(), toBalance: newTo.toString() };
    });
  }

  private toDecimal(amount: number | string): Prisma.Decimal {
    try {
      return new Prisma.Decimal(amount);
    } catch {
      throw new ValidationError(`invalid amount: ${amount}`);
    }
  }
}

export const axsService = new AxsService();
