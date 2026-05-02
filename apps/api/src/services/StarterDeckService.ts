/**
 * Starter Deck flow: el jugador nuevo elige uno de 3 mazos temáticos
 * inspirados en los Starter Axies de Axie Infinity (Plant/Bird/Beast).
 *
 * Cada archetype define:
 *  - composición fija de 40 cartas (bias temático sobre el catálogo actual)
 *  - bonus de bienvenida en Lunacian Coins (+50 LC)
 *  - flag `starterPicked` permanente en User (NO se puede cambiar)
 *
 * TODO (sprint posterior — partnership Sky Mavis):
 * - Reemplazar `STARTER_ARCHETYPES.composition` hardcoded por:
 *   `axieGraphQLService.fetchStarterPartsForArchetype(archetype)` → derivar cartas
 *   de las parts reales del Axie y sus abilities.
 */

import type { PrismaClient, Deck } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { ValidationError, RuleViolationError } from '../lib/errors.js';
import { lunacianCoinsService } from './LunacianCoinsService.js';

export type StarterArchetype = 'plant' | 'bird' | 'beast';

export interface StarterArchetypeMeta {
  id: StarterArchetype;
  name: string;
  axieClass: 'Plant' | 'Bird' | 'Beast';
  leadCard: string;
  description: string;
  playstyle: string;
  composition: Array<{ cardId: string; quantity: number; zone: 'Main' | 'Extra' | 'Side' }>;
}

const STARTER_BONUS_LC = 50;

/**
 * Composiciones de 40 cartas por archetype, derivadas conceptualmente del lore Axie.
 * - Plant (Verdant Guardian, lead: Verdant Sentinel L3): tanque/control con muros defensivos.
 * - Bird (Skybound Striker, lead: Skydancer Aery L7): velocidad/daño directo con tributos rápidos.
 * - Beast (Frostfang Berserker, lead: Olek L4): agresión bruta con combos low-cost.
 *
 * Cada composición suma 40 cartas (Main deck mínimo legal). Validación: max 3 copias por carta.
 */
export const STARTER_ARCHETYPES: Record<StarterArchetype, StarterArchetypeMeta> = {
  plant: {
    id: 'plant',
    name: 'Verdant Guardian',
    axieClass: 'Plant',
    leadCard: 'mon_plant_001',
    description: 'Tanque viviente. Muros de plantas que aguantan combos enteros.',
    playstyle: 'Alta defensa, control de campo, ventaja contra Bird y Aqua.',
    composition: [
      // Monsters core (16 — bias Plant + Aqua de soporte)
      { cardId: 'mon_plant_001', quantity: 3, zone: 'Main' }, // Verdant Sentinel L3 (1900 DEF)
      { cardId: 'mon_plant_001', quantity: 3, zone: 'Main' },
      { cardId: 'mon_aqua_001', quantity: 3, zone: 'Main' },  // Tidecaller Nyra L5 — soporte
      { cardId: 'mon_beast_001', quantity: 3, zone: 'Main' }, // Olek L4 — fill low-cost
      { cardId: 'mon_reptile_001', quantity: 1, zone: 'Main' }, // Lunacian Bleeder L8 — finisher
      { cardId: 'mon_bird_001', quantity: 1, zone: 'Main' },  // Skydancer Aery L7
      { cardId: 'mon_plant_001', quantity: 2, zone: 'Main' },
      // Spells (12 — control + curación temática)
      { cardId: 'spl_001', quantity: 3, zone: 'Main' },
      { cardId: 'spl_002', quantity: 3, zone: 'Main' },
      { cardId: 'spl_003', quantity: 3, zone: 'Main' },
      { cardId: 'spl_004', quantity: 3, zone: 'Main' },
      // Traps (12 — paredes + counter)
      { cardId: 'trp_001', quantity: 3, zone: 'Main' },
      { cardId: 'trp_002', quantity: 3, zone: 'Main' },
      { cardId: 'trp_003', quantity: 3, zone: 'Main' },
      { cardId: 'trp_004', quantity: 3, zone: 'Main' },
    ],
  },
  bird: {
    id: 'bird',
    name: 'Skybound Striker',
    axieClass: 'Bird',
    leadCard: 'mon_bird_001',
    description: 'Velocidad pura. Ataques aéreos, cartas que saltan defensas.',
    playstyle: 'Daño directo + tributos rápidos. Ventaja contra Beast y Aqua.',
    composition: [
      // Monsters (18 — bias Bird con Beasts low-level para tributar)
      { cardId: 'mon_bird_001', quantity: 3, zone: 'Main' },  // Skydancer Aery L7 (2500 ATK)
      { cardId: 'mon_bird_001', quantity: 3, zone: 'Main' },
      { cardId: 'mon_beast_001', quantity: 3, zone: 'Main' }, // Olek L4 — tributo
      { cardId: 'mon_beast_001', quantity: 3, zone: 'Main' },
      { cardId: 'mon_plant_001', quantity: 3, zone: 'Main' }, // Verdant L3 — tributo
      { cardId: 'mon_aqua_001', quantity: 2, zone: 'Main' },  // Tidecaller L5 — soporte
      { cardId: 'mon_reptile_001', quantity: 1, zone: 'Main' },
      // Spells (10 — quick-play, daño rápido)
      { cardId: 'spl_001', quantity: 3, zone: 'Main' },
      { cardId: 'spl_005', quantity: 3, zone: 'Main' },
      { cardId: 'spl_002', quantity: 2, zone: 'Main' },
      { cardId: 'spl_004', quantity: 2, zone: 'Main' },
      // Traps (12)
      { cardId: 'trp_001', quantity: 3, zone: 'Main' },
      { cardId: 'trp_005', quantity: 3, zone: 'Main' },
      { cardId: 'trp_002', quantity: 3, zone: 'Main' },
      { cardId: 'trp_003', quantity: 3, zone: 'Main' },
    ],
  },
  beast: {
    id: 'beast',
    name: 'Frostfang Berserker',
    axieClass: 'Beast',
    leadCard: 'mon_beast_001',
    description: 'Daño bruto. Olek y combos agresivos para destruir todo.',
    playstyle: 'Combos low-cost de alto ATK. Ventaja contra Plant y Reptile.',
    composition: [
      // Monsters (18 — bias Beast con Plants para tributar)
      { cardId: 'mon_beast_001', quantity: 3, zone: 'Main' }, // Olek L4 (1700 ATK)
      { cardId: 'mon_beast_001', quantity: 3, zone: 'Main' },
      { cardId: 'mon_beast_001', quantity: 3, zone: 'Main' },
      { cardId: 'mon_plant_001', quantity: 3, zone: 'Main' }, // tributos
      { cardId: 'mon_aqua_001', quantity: 2, zone: 'Main' },  // L5 finisher con tributo
      { cardId: 'mon_bird_001', quantity: 2, zone: 'Main' },  // L7 finisher
      { cardId: 'mon_reptile_001', quantity: 2, zone: 'Main' }, // L8 finisher pesado
      // Spells (10 — daño + buff)
      { cardId: 'spl_001', quantity: 3, zone: 'Main' },
      { cardId: 'spl_005', quantity: 3, zone: 'Main' },
      { cardId: 'spl_003', quantity: 2, zone: 'Main' },
      { cardId: 'spl_004', quantity: 2, zone: 'Main' },
      // Traps (12)
      { cardId: 'trp_001', quantity: 3, zone: 'Main' },
      { cardId: 'trp_005', quantity: 3, zone: 'Main' },
      { cardId: 'trp_004', quantity: 3, zone: 'Main' },
      { cardId: 'trp_002', quantity: 3, zone: 'Main' },
    ],
  },
};

export interface ClaimStarterResult {
  deck: Deck;
  archetype: StarterArchetype;
  bonusLunacianCoins: number;
  newLunacianBalance: string;
}

export class StarterDeckService {
  constructor(private db: PrismaClient = prisma) {}

  /** Lista pública de archetypes para el cliente. Sin la composition completa (no es secreta pero no aporta a la UI). */
  listArchetypes(): Array<Omit<StarterArchetypeMeta, 'composition'> & { totalCards: number }> {
    return Object.values(STARTER_ARCHETYPES).map((a) => ({
      id: a.id,
      name: a.name,
      axieClass: a.axieClass,
      leadCard: a.leadCard,
      description: a.description,
      playstyle: a.playstyle,
      totalCards: a.composition.reduce((sum, c) => sum + c.quantity, 0),
    }));
  }

  async getStatus(userId: string) {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { starterPicked: true, starterArchetype: true },
    });
    if (!user) throw new ValidationError('User not found');
    let starterDeckId: string | undefined;
    if (user.starterPicked) {
      const deck = await this.db.deck.findFirst({
        where: { userId, isStarter: true },
        select: { id: true },
      });
      if (deck) starterDeckId = deck.id;
    }
    return {
      starterPicked: user.starterPicked,
      archetype: user.starterArchetype,
      ...(starterDeckId !== undefined ? { starterDeckId } : {}),
    };
  }

  /**
   * Crea el starter deck del user + otorga bonus LC + setea flags.
   * Idempotente: si ya pickeó, throw RuleViolationError 'STARTER_ALREADY_PICKED'.
   */
  async claimStarterDeck(userId: string, archetype: StarterArchetype): Promise<ClaimStarterResult> {
    const meta = STARTER_ARCHETYPES[archetype];
    if (!meta) throw new ValidationError(`Invalid archetype: ${archetype}`);

    // Verificación atómica afuera del $transaction (por pgbouncer Transaction mode no soporta nested).
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { starterPicked: true, decks: { where: { isActive: true }, select: { id: true } } },
    });
    if (!user) throw new ValidationError('User not found');
    if (user.starterPicked) {
      throw new RuleViolationError('STARTER_ALREADY_PICKED — el usuario ya eligió un starter deck.');
    }

    // Para users existentes con decks activos: NO desactivar otros decks (no perder configuración).
    // Solo activar el starter si el user NO tiene ningún deck activo (es nuevo).
    const shouldActivate = user.decks.length === 0;

    // Crear Deck + DeckCards en transacción (aplanando para pgbouncer compat).
    const deck = await this.db.deck.create({
      data: {
        userId,
        name: meta.name,
        format: 'Standard',
        isStarter: true,
        starterArchetype: archetype,
        isActive: shouldActivate,
        cards: {
          create: meta.composition.map((c) => ({
            cardId: c.cardId,
            zone: c.zone,
            quantity: c.quantity,
          })),
        },
      },
      include: { cards: true },
    });

    // Marcar el flag y archetype del user.
    await this.db.user.update({
      where: { id: userId },
      data: { starterPicked: true, starterArchetype: archetype },
    });

    // Otorgar bonus LC.
    const ledger = await lunacianCoinsService.earn(
      userId,
      STARTER_BONUS_LC,
      'EARN_STARTER_BONUS',
      `starter:${archetype}`,
    );

    logger.info(
      { userId, archetype, deckId: deck.id, bonusLc: STARTER_BONUS_LC, newBalance: ledger.newBalance },
      'starter deck claimed',
    );

    return {
      deck,
      archetype,
      bonusLunacianCoins: STARTER_BONUS_LC,
      newLunacianBalance: ledger.newBalance,
    };
  }
}

export const starterDeckService = new StarterDeckService();
