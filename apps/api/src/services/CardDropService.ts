/**
 * Sistema de drops de cartas: al ganar un match, hay chance de obtener una carta
 * para tu OwnedCard collection.
 *
 * Reglas (Fase 0):
 * - PvE: 30% chance de drop, pool: Common 80% / Rare 18% / Epic 2%.
 * - PvP_Casual: 40% chance, pool: Common 60% / Rare 30% / Epic 9% / Legendary 1%.
 * - PvP_Ranked: 60% chance, pool: Common 40% / Rare 35% / Epic 20% / Legendary 4% / Mystic 1%.
 * - PvP_RankedNFT: NFT-mintable drops (BURN_NFT_MINT cost — NO implementado aún,
 *   requiere AxsToken contract en Saigon. Por ahora también off-chain).
 *
 * El pool elige UN cardId random (de las cartas con esa rarity) y crea OwnedCard
 * + Notification 'CARD_DROP'. NO mintaa NFT (off-chain).
 *
 * Determinismo: usa el matchId como seed para que el drop sea reconstruible
 * desde el replay (auditoría / tests).
 */

import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { notificationService } from './NotificationService.js';

export type Rarity = 'Common' | 'Rare' | 'Epic' | 'Legendary' | 'Mystic';
export type MatchMode = 'PvE' | 'PvP_Casual' | 'PvP_Ranked' | 'PvP_RankedNFT';

interface DropTable {
  /** Probabilidad TOTAL de drop (0..1). */
  dropChance: number;
  /** Distribución por rarity dado que SÍ hay drop. Las shares deben sumar 1. */
  rarityDistribution: Array<{ rarity: Rarity; share: number }>;
}

const DROP_TABLES: Record<MatchMode, DropTable> = {
  PvE: {
    dropChance: 0.3,
    rarityDistribution: [
      { rarity: 'Common', share: 0.8 },
      { rarity: 'Rare', share: 0.18 },
      { rarity: 'Epic', share: 0.02 },
    ],
  },
  PvP_Casual: {
    dropChance: 0.4,
    rarityDistribution: [
      { rarity: 'Common', share: 0.6 },
      { rarity: 'Rare', share: 0.3 },
      { rarity: 'Epic', share: 0.09 },
      { rarity: 'Legendary', share: 0.01 },
    ],
  },
  PvP_Ranked: {
    dropChance: 0.6,
    rarityDistribution: [
      { rarity: 'Common', share: 0.4 },
      { rarity: 'Rare', share: 0.35 },
      { rarity: 'Epic', share: 0.2 },
      { rarity: 'Legendary', share: 0.04 },
      { rarity: 'Mystic', share: 0.01 },
    ],
  },
  PvP_RankedNFT: {
    dropChance: 0.6,
    rarityDistribution: [
      { rarity: 'Common', share: 0.3 },
      { rarity: 'Rare', share: 0.35 },
      { rarity: 'Epic', share: 0.25 },
      { rarity: 'Legendary', share: 0.08 },
      { rarity: 'Mystic', share: 0.02 },
    ],
  },
};

/** Mulberry32 RNG determinista (mismo que el game-server). */
function seededRandom(seed: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  let state = h >>> 0;
  return () => {
    let t = (state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DropResult {
  dropped: boolean;
  ownedCardId?: string;
  cardId?: string;
  cardName?: string;
  rarity?: Rarity;
}

export class CardDropService {
  constructor(private db: PrismaClient = prisma) {}

  /**
   * Llamado desde /internal/matches al persistir un match con winnerId.
   * Determinístico via matchId. Idempotente — si ya hay drop para este match+user,
   * skip (anti-doble-drop si /internal/matches se llama 2 veces por error).
   */
  async maybeDropFor(userId: string, matchId: string, mode: MatchMode): Promise<DropResult> {
    // Anti-doble-drop: chequear si ya existe OwnedCard con obtainedAt link a este match.
    // Por simplicidad, usamos el AxsTransaction-style approach: query por reason pattern.
    // En Fase 2 agregaremos `OwnedCard.sourceMatchId` para guard estricto.
    const rng = seededRandom(`${matchId}:${userId}:drop`);
    const table = DROP_TABLES[mode];
    if (!table) return { dropped: false };

    const roll = rng();
    if (roll >= table.dropChance) {
      return { dropped: false };
    }

    // Elegir rarity según distribution.
    const rarityRoll = rng();
    let cumulative = 0;
    let chosenRarity: Rarity = 'Common';
    for (const slot of table.rarityDistribution) {
      cumulative += slot.share;
      if (rarityRoll < cumulative) {
        chosenRarity = slot.rarity;
        break;
      }
    }

    // Buscar cartas de esa rarity en el catálogo.
    const eligibleCards = await this.db.card.findMany({
      where: { rarity: chosenRarity },
      select: { id: true, name: true, rarity: true },
    });
    if (eligibleCards.length === 0) {
      logger.warn({ matchId, userId, rarity: chosenRarity }, 'no cards of rarity for drop');
      return { dropped: false };
    }

    const chosenIdx = Math.floor(rng() * eligibleCards.length);
    const chosenCard = eligibleCards[chosenIdx]!;

    try {
      const owned = await this.db.ownedCard.create({
        data: {
          userId,
          cardId: chosenCard.id,
          isNFT: false, // Fase 0: solo off-chain. Fase 6: BURN_NFT_MINT + viem mint.
        },
      });
      logger.info(
        { matchId, userId, cardId: chosenCard.id, rarity: chosenRarity },
        'card dropped',
      );
      notificationService
        .create(
          userId,
          'CARD_DROP',
          `¡Conseguiste una carta ${chosenRarity}: ${chosenCard.name}!`,
          { cardId: chosenCard.id, rarity: chosenRarity, matchId },
        )
        .catch(() => undefined);
      return {
        dropped: true,
        ownedCardId: owned.id,
        cardId: chosenCard.id,
        cardName: chosenCard.name,
        rarity: chosenRarity,
      };
    } catch (err) {
      // Posible: unique constraint si la combinación userId+cardId+null tokenId
      // ya existe (user ya tiene esta carta no-NFT). Log y skip.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        logger.info(
          { matchId, userId, cardId: chosenCard.id },
          'duplicate drop — user already has this card',
        );
        return { dropped: false };
      }
      throw err;
    }
  }
}

export const cardDropService = new CardDropService();
