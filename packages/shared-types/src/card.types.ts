/**
 * Tipos de cartas del juego. Estilo Yu-Gi-Oh! con 3 categorías:
 * Monster, Spell, Trap. Las MonsterCards mapean a Axies; las Spell/Trap
 * son las "Skill cards" inspiradas en Axie Infinity Origins.
 */

import type { Axie, AxieClass, AxiePart } from './axie.types.js';

export type CardType = 'Monster' | 'Spell' | 'Trap';

export type SpellSpeed = 1 | 2 | 3;

export type Rarity = 'Common' | 'Rare' | 'Epic' | 'Legendary' | 'Mystic';

export type MonsterPosition = 'ATK' | 'DEF' | 'DEF_FACEDOWN';

export type MonsterTypeAttribute =
  | 'Warrior'
  | 'Spellcaster'
  | 'Beast'
  | 'Dragon'
  | 'Fiend'
  | 'Aqua'
  | 'Insect'
  | 'Plant'
  | 'Reptile'
  | 'Machine'
  | 'Fairy';

export type SpellSubtype = 'Normal' | 'Continuous' | 'Quick-Play' | 'Equip' | 'Field' | 'Ritual';

export type TrapSubtype = 'Normal' | 'Continuous' | 'Counter';

/**
 * Efecto declarativo. La implementación vive en `apps/game-server/src/cards/effects/`.
 * El `kind` es el discriminador que usa `EffectResolver` para enrutar al handler.
 */
export interface CardEffect {
  /** ID estable del handler de efecto (ej: 'damage', 'draw', 'destroy'). */
  kind: string;
  /** Spell Speed del efecto: 1=ignición/normal, 2=quick/trampa normal, 3=counter trap. */
  spellSpeed: SpellSpeed;
  /** Texto humano-legible del efecto (lo que el jugador lee en la carta). */
  description: string;
  /** Parámetros específicos del handler (ej: {amount: 1000}). */
  params?: Record<string, unknown>;
  /** Condición de activación (free-form para que `EffectResolver` la evalúe). */
  condition?: string;
  /** Targets requeridos para la activación. */
  targeting?: TargetingRule;
}

export interface TargetingRule {
  count: number;
  zones: Array<'OWN_MONSTER' | 'OPP_MONSTER' | 'ANY_MONSTER' | 'OWN_GRAVE' | 'OPP_GRAVE' | 'OWN_HAND'>;
  optional?: boolean;
}

export interface BaseCard {
  /** ID estable de catálogo (ej: 'mon_beast_001'). NO confundir con instancia en partida. */
  id: string;
  name: string;
  type: CardType;
  rarity: Rarity;
  imageUrl: string;
  description: string;
  effect?: CardEffect;
  /** true si esta carta proviene de un NFT (mintada en Ronin). */
  isNFT: boolean;
  tokenId?: string;
}

export interface MonsterCard extends BaseCard {
  type: 'Monster';
  /** 1-12 estrellas. Mapeo desde stats del Axie original (ver `axie-parts-mapping`). */
  level: number;
  attribute: AxieClass;
  monsterType: MonsterTypeAttribute;
  atk: number;
  def: number;
  /** Las 6 partes del Axie (eyes, ears, mouth, horn, back, tail). */
  parts: AxiePart[];
  /** Referencia al Axie original que generó esta carta, si aplica. */
  axie?: Axie;
}

export interface SpellCard extends BaseCard {
  type: 'Spell';
  subtype: SpellSubtype;
}

export interface TrapCard extends BaseCard {
  type: 'Trap';
  subtype: TrapSubtype;
}

export type Card = MonsterCard | SpellCard | TrapCard;

/**
 * Instancia de una carta dentro de una partida. Es DIFERENTE a `Card`:
 * `Card` es la definición de catálogo (una sola), `CardInstance` es la copia
 * concreta sobre la mesa con su estado de turno (posición, contadores, etc.).
 */
export interface CardInstance {
  /** ID único de instancia para esta partida. */
  instanceId: string;
  /** Referencia a la definición en catálogo. */
  cardId: string;
  /** Dueño de la instancia (playerId). */
  ownerId: string;
  /** Si es Monster, posición; si es Spell/Trap, ATK no aplica. */
  position?: MonsterPosition;
  /** true si está boca abajo (Set). */
  faceDown: boolean;
  /** Modificadores acumulados durante el turno (efectos de equip, buffs, etc.). */
  atkMod: number;
  defMod: number;
  /** Contadores de efectos (ej: counters de Quick-Play). */
  counters: Record<string, number>;
  /** Si esta instancia ya atacó este turno (para limitar 1 ataque por monstruo). */
  hasAttacked: boolean;
  /** Si este monstruo cambió posición este turno (no puede volver a cambiar). */
  positionChangedThisTurn: boolean;
}
