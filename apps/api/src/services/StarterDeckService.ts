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
  /** Emoji principal del archetype (Plant=🌿, Bird=🐦, Beast=🐺). */
  emoji: string;
  /** Emojis secundarios que representan combos/sinergias del deck. */
  vibeEmojis: string[];
  /** Tagline corta en español para mostrar en cards de showcase. */
  tagline: string;
  /** Frases tácticas: 3-4 highlights del deck. */
  highlights: string[];
  /** Strong vs / weak vs (clases). Para mostrar el triángulo de ventaja. */
  strongVs: string[];
  weakVs: string[];
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
  // ── PLANT — Verdant Guardian (Olek + Puffy) ────────────────────────────
  // Lore: tanque/sustento. Olek y Puffy curan al hero al desplegarse (+500 LP cada uno).
  // Counterplay: rota Plants en defensa, Aqua de apoyo. Vulnerable a Bug.
  plant: {
    id: 'plant',
    name: 'Verdant Guardian',
    axieClass: 'Plant',
    leadCard: 'mon_plant_001',
    emoji: '🌿',
    vibeEmojis: ['🌿', '🌱', '💚', '🛡️'],
    tagline: 'Cura, resiste, vence.',
    description:
      'El bosque despierta. Olek y Puffy regeneran tu vida al desplegarse — cada deploy es un escudo viviente.',
    playstyle:
      'Sustain agresivo: cada Plant que invocás te cura +500 LP. Ventaja de clase vs Bird y Aqua.',
    highlights: [
      'Heal +500 LP por cada Olek/Puffy desplegado (onDeploy)',
      'Tide Surge buffea tus Aqua de soporte (+400 ATK/+200 DEF)',
      'Webbed Roots bloquea cambios de posición enemigos',
      'Lunacian Heal Quick-Play: +800 LP de emergencia',
    ],
    strongVs: ['Bird', 'Aquatic'],
    weakVs: ['Bug', 'Beast'],
    composition: [
      // ── Monsters (20) — bias Plant + Aqua soporte + Reptile finisher ──
      { cardId: 'mon_plant_001', quantity: 3, zone: 'Main' }, // Olek L4 onDeployHeal
      { cardId: 'mon_plant_002', quantity: 3, zone: 'Main' }, // Puffy L5 onDeployHeal
      { cardId: 'mon_chim_001', quantity: 3, zone: 'Main' },  // Plant chimera L1 fodder
      { cardId: 'mon_aqua_001', quantity: 3, zone: 'Main' },  // Tidecaller L5 draw
      { cardId: 'mon_chim_004', quantity: 3, zone: 'Main' },  // Aqua chimera L2 fodder
      { cardId: 'mon_chim_006', quantity: 3, zone: 'Main' },  // Reptile chimera L2 fodder
      { cardId: 'mon_reptile_002', quantity: 2, zone: 'Main' }, // Terminator L6 onDeath debuff
      // ── Spells (10) ──
      { cardId: 'spl_002', quantity: 3, zone: 'Main' }, // Verdant Renewal: tributo Plant + draw 2
      { cardId: 'spl_006', quantity: 3, zone: 'Main' }, // Lunacian Heal: +800 LP
      { cardId: 'spl_003', quantity: 2, zone: 'Main' }, // Tide Surge: aura Aqua
      { cardId: 'spl_005', quantity: 2, zone: 'Main' }, // Lunacian Blessing: equip +500 ATK
      // ── Traps (10) ──
      { cardId: 'trp_004', quantity: 3, zone: 'Main' }, // Webbed Roots: lock pos Plant-themed
      { cardId: 'trp_002', quantity: 3, zone: 'Main' }, // Mirror Web: negateAttack
      { cardId: 'trp_001', quantity: 3, zone: 'Main' }, // Poison Backlash: -800 ATK
      { cardId: 'trp_005', quantity: 1, zone: 'Main' }, // Lethal Strike: burn 1000
    ],
  },

  // ── BIRD — Skybound Striker (Backdoor Bird + Nut Cracker) ─────────────
  // Lore: velocidad y daño quirúrgico. Backdoor Bird inflige 400 al morir, Nut Cracker
  // destruye spell/trap al desplegarse. Ataque aéreo + control de oponente.
  bird: {
    id: 'bird',
    name: 'Skybound Striker',
    axieClass: 'Bird',
    leadCard: 'mon_bird_001',
    emoji: '🐦',
    vibeEmojis: ['🐦', '⚡', '🌪️', '💨'],
    tagline: 'Velocidad letal desde el cielo.',
    description:
      'Un solo golpe basta. Backdoor Bird daña al morir, Nut Cracker rompe defensas al llegar. Ofensiva pura.',
    playstyle:
      'Daño directo, demolición de defensas, sacrificios calculados. Ventaja vs Beast y Aqua.',
    highlights: [
      'Backdoor Bird: 400 daño directo al ser destruida',
      'Nut Cracker onDeploy: destruye 1 Spell/Trap enemigo random',
      'Sky Mavis Field: +300 ATK a cada Axie que invoques',
      'Lethal Strike trap: 1000 burn al destruir un Axie',
    ],
    strongVs: ['Beast', 'Aquatic'],
    weakVs: ['Plant', 'Reptile'],
    composition: [
      // ── Monsters (20) ──
      { cardId: 'mon_bird_001', quantity: 3, zone: 'Main' }, // Backdoor Bird L3 onDeath direct dmg
      { cardId: 'mon_bird_002', quantity: 3, zone: 'Main' }, // Nut Cracker L4 onDeploy destroy ST
      { cardId: 'mon_chim_005', quantity: 3, zone: 'Main' }, // Bird chimera L2 fodder
      { cardId: 'mon_chim_002', quantity: 3, zone: 'Main' }, // Beast chimera L1 — anti-Aqua
      { cardId: 'mon_chim_004', quantity: 3, zone: 'Main' }, // Aqua chimera L2 fodder
      { cardId: 'mon_aqua_001', quantity: 2, zone: 'Main' }, // Tidecaller L5 draw
      { cardId: 'mon_reptile_001', quantity: 2, zone: 'Main' }, // Venomscale L8 finisher
      { cardId: 'mon_reptile_002', quantity: 1, zone: 'Main' }, // Terminator L6 onDeath debuff
      // ── Spells (10) ──
      { cardId: 'spl_004', quantity: 3, zone: 'Main' }, // Sky Mavis Field +300 ATK on summon
      { cardId: 'spl_005', quantity: 3, zone: 'Main' }, // Lunacian Blessing equip +500 ATK
      { cardId: 'spl_006', quantity: 2, zone: 'Main' }, // Lunacian Heal
      { cardId: 'spl_002', quantity: 2, zone: 'Main' }, // Verdant Renewal draw
      // ── Traps (10) ──
      { cardId: 'trp_005', quantity: 3, zone: 'Main' }, // Lethal Strike burn 1000
      { cardId: 'trp_001', quantity: 3, zone: 'Main' }, // Poison Backlash
      { cardId: 'trp_003', quantity: 2, zone: 'Main' }, // Counterstrike: negate spell
      { cardId: 'trp_002', quantity: 2, zone: 'Main' }, // Mirror Web: negateAttack
    ],
  },

  // ── BEAST — Frostfang Berserker (Buba + Venom + Ronin) ────────────────
  // Lore: agresión. Buba/Venom ganan +300 ATK con otro Beast en field (beastSwarm).
  // Ronin Beast destruye spell/trap al deploy. Combos low-cost ATK.
  beast: {
    id: 'beast',
    name: 'Frostfang Berserker',
    axieClass: 'Beast',
    leadCard: 'mon_beast_001',
    emoji: '🐺',
    vibeEmojis: ['🐺', '🔥', '⚔️', '🦷'],
    tagline: 'Pack de cazadores. Sin prisioneros.',
    description:
      'La manada caza junta. Buba, Venom y Ronin se buffean entre sí — cada Beast extra es +300 ATK.',
    playstyle:
      'Combos agresivos low-cost. Sinergia Beast+Beast. Ventaja vs Plant y Reptile.',
    highlights: [
      'Buba/Venom beastSwarm: +300 ATK si controlás otro Beast',
      'Ronin onDeploy: destruye 1 Spell/Trap enemigo',
      'Single Combat (Beast req): bloquea matchup hasta end of turn',
      'Plant chimera fodder + Lunacian Blessing combo: +500 ATK equip',
    ],
    strongVs: ['Plant', 'Reptile'],
    weakVs: ['Bug', 'Bird'],
    composition: [
      // ── Monsters (20) ──
      { cardId: 'mon_beast_001', quantity: 3, zone: 'Main' }, // Buba L4 beastSwarm
      { cardId: 'mon_beast_002', quantity: 3, zone: 'Main' }, // Venom L5 beastSwarm
      { cardId: 'mon_beast_003', quantity: 2, zone: 'Main' }, // Ronin L6 onDeploy destroy ST
      { cardId: 'mon_chim_002', quantity: 3, zone: 'Main' }, // Beast chimera L1 fodder + sinergia
      { cardId: 'mon_chim_001', quantity: 3, zone: 'Main' }, // Plant chimera L1 — sacrificable
      { cardId: 'mon_plant_001', quantity: 3, zone: 'Main' }, // Olek L4 sustain
      { cardId: 'mon_reptile_001', quantity: 2, zone: 'Main' }, // Venomscale L8 finisher
      { cardId: 'mon_aqua_001', quantity: 1, zone: 'Main' }, // Tidecaller L5 draw
      // ── Spells (10) ──
      { cardId: 'spl_001', quantity: 3, zone: 'Main' }, // Single Combat (req Beast — perfect!)
      { cardId: 'spl_005', quantity: 3, zone: 'Main' }, // Lunacian Blessing +500 ATK
      { cardId: 'spl_006', quantity: 2, zone: 'Main' }, // Lunacian Heal
      { cardId: 'spl_002', quantity: 2, zone: 'Main' }, // Verdant Renewal: sacrifica Plant draw 2
      // ── Traps (10) ──
      { cardId: 'trp_005', quantity: 3, zone: 'Main' }, // Lethal Strike burn 1000
      { cardId: 'trp_001', quantity: 3, zone: 'Main' }, // Poison Backlash
      { cardId: 'trp_003', quantity: 2, zone: 'Main' }, // Counterstrike
      { cardId: 'trp_002', quantity: 2, zone: 'Main' }, // Mirror Web
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

  /** In-memory cache de previews enriched. Compositions son estáticas + datos de Card cambian
   *  raramente (sólo en re-seed). TTL 10min evita N queries al DB cada vez que un user abre /store. */
  private previewCache: { value: unknown; expiresAt: number } | null = null;
  private readonly PREVIEW_CACHE_TTL_MS = 10 * 60 * 1000;

  /** Lista pública de archetypes para el cliente. Sin la composition completa (no es secreta pero no aporta a la UI). */
  listArchetypes(): Array<Omit<StarterArchetypeMeta, 'composition'> & { totalCards: number }> {
    return Object.values(STARTER_ARCHETYPES).map((a) => ({
      id: a.id,
      name: a.name,
      axieClass: a.axieClass,
      leadCard: a.leadCard,
      emoji: a.emoji,
      vibeEmojis: a.vibeEmojis,
      tagline: a.tagline,
      description: a.description,
      playstyle: a.playstyle,
      highlights: a.highlights,
      strongVs: a.strongVs,
      weakVs: a.weakVs,
      totalCards: a.composition.reduce((sum, c) => sum + c.quantity, 0),
    }));
  }

  /**
   * Preview detallado de un archetype: incluye composition enriquecida con datos de cada Card
   * (name, type, attribute, level, atk, def, rarity, imageUrl) para que el cliente pueda
   * renderizar la lista de cartas del deck sin hacer N round-trips a /cards.
   */
  async previewArchetype(archetype: StarterArchetype) {
    const meta = STARTER_ARCHETYPES[archetype];
    if (!meta) throw new ValidationError(`Invalid archetype: ${archetype}`);

    // Aggregate quantities per cardId (composition puede tener múltiples entries del mismo cardId).
    const aggregated = new Map<string, number>();
    for (const c of meta.composition) {
      aggregated.set(c.cardId, (aggregated.get(c.cardId) ?? 0) + c.quantity);
    }

    const cardIds = [...aggregated.keys()];
    const cards = await this.db.card.findMany({
      where: { id: { in: cardIds } },
      select: {
        id: true, name: true, type: true, subType: true, rarity: true,
        attribute: true, level: true, atk: true, def: true,
        description: true, imageUrl: true,
      },
    });
    const byId = new Map(cards.map((c) => [c.id, c]));

    const enriched = [...aggregated.entries()]
      .map(([cardId, quantity]) => {
        const card = byId.get(cardId);
        return card ? { quantity, card } : null;
      })
      .filter((e): e is { quantity: number; card: NonNullable<ReturnType<typeof byId.get>> } => e !== null)
      .sort((a, b) => {
        const typeOrder: Record<string, number> = { Monster: 0, Spell: 1, Trap: 2 };
        const ta = typeOrder[a.card.type] ?? 9;
        const tb = typeOrder[b.card.type] ?? 9;
        if (ta !== tb) return ta - tb;
        return (b.card.level ?? 0) - (a.card.level ?? 0);
      });

    const totalCards = meta.composition.reduce((sum, c) => sum + c.quantity, 0);
    const monsters = enriched.filter((e) => e.card.type === 'Monster').reduce((s, e) => s + e.quantity, 0);
    const spells = enriched.filter((e) => e.card.type === 'Spell').reduce((s, e) => s + e.quantity, 0);
    const traps = enriched.filter((e) => e.card.type === 'Trap').reduce((s, e) => s + e.quantity, 0);

    return {
      id: meta.id,
      name: meta.name,
      axieClass: meta.axieClass,
      emoji: meta.emoji,
      vibeEmojis: meta.vibeEmojis,
      tagline: meta.tagline,
      description: meta.description,
      playstyle: meta.playstyle,
      highlights: meta.highlights,
      strongVs: meta.strongVs,
      weakVs: meta.weakVs,
      leadCard: meta.leadCard,
      totalCards,
      monsters,
      spells,
      traps,
      cards: enriched,
    };
  }

  /**
   * Preview de los 3 archetypes en UN solo llamado (1 query a DB en lugar de 3).
   * Cacheado in-memory por 10min para que /store cargue al instante en visitas posteriores.
   * Antes el cliente hacía 3 fetches paralelos a /starter/preview/:archetype + 1 a /starter/status,
   * lo que tardaba 500ms-2s. Ahora 1 fetch + cache.
   */
  async previewAllArchetypes() {
    const now = Date.now();
    if (this.previewCache && this.previewCache.expiresAt > now) {
      return this.previewCache.value;
    }
    // Aggregate todos los cardIds de los 3 archetypes en un solo Set.
    const allCardIds = new Set<string>();
    for (const meta of Object.values(STARTER_ARCHETYPES)) {
      for (const c of meta.composition) allCardIds.add(c.cardId);
    }
    const cards = await this.db.card.findMany({
      where: { id: { in: [...allCardIds] } },
      select: {
        id: true, name: true, type: true, subType: true, rarity: true,
        attribute: true, level: true, atk: true, def: true,
        description: true, imageUrl: true,
      },
    });
    const byId = new Map(cards.map((c) => [c.id, c]));

    const previews = Object.values(STARTER_ARCHETYPES).map((meta) => {
      const aggregated = new Map<string, number>();
      for (const c of meta.composition) {
        aggregated.set(c.cardId, (aggregated.get(c.cardId) ?? 0) + c.quantity);
      }
      const enriched = [...aggregated.entries()]
        .map(([cardId, quantity]) => {
          const card = byId.get(cardId);
          return card ? { quantity, card } : null;
        })
        .filter((e): e is { quantity: number; card: NonNullable<ReturnType<typeof byId.get>> } => e !== null)
        .sort((a, b) => {
          const typeOrder: Record<string, number> = { Monster: 0, Spell: 1, Trap: 2 };
          const ta = typeOrder[a.card.type] ?? 9;
          const tb = typeOrder[b.card.type] ?? 9;
          if (ta !== tb) return ta - tb;
          return (b.card.level ?? 0) - (a.card.level ?? 0);
        });
      const totalCards = meta.composition.reduce((sum, c) => sum + c.quantity, 0);
      const monsters = enriched.filter((e) => e.card.type === 'Monster').reduce((s, e) => s + e.quantity, 0);
      const spells = enriched.filter((e) => e.card.type === 'Spell').reduce((s, e) => s + e.quantity, 0);
      const traps = enriched.filter((e) => e.card.type === 'Trap').reduce((s, e) => s + e.quantity, 0);
      return {
        id: meta.id,
        name: meta.name,
        axieClass: meta.axieClass,
        emoji: meta.emoji,
        vibeEmojis: meta.vibeEmojis,
        tagline: meta.tagline,
        description: meta.description,
        playstyle: meta.playstyle,
        highlights: meta.highlights,
        strongVs: meta.strongVs,
        weakVs: meta.weakVs,
        leadCard: meta.leadCard,
        totalCards,
        monsters,
        spells,
        traps,
        cards: enriched,
      };
    });

    this.previewCache = { value: previews, expiresAt: now + this.PREVIEW_CACHE_TTL_MS };
    return previews;
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
