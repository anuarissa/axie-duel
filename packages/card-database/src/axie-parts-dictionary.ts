/**
 * axie-parts-dictionary — Micro-efectos por parte de Axie.
 *
 * Concepto: cada parte del Axie (eyes/ears/mouth/horn/back/tail) tiene
 * un trigger lógico cuando el Axie es invocado o ataca. En la Fase 6
 * (NFT integration), este diccionario permite que cartas Axie reales
 * traigan sus efectos únicos según las partes que tengan equipadas.
 *
 * Por ahora (Fase 1-3) los efectos NO se aplican automáticamente — el
 * diccionario es la base de datos para la economía: se exponen en la
 * tienda como "estos efectos vienen con esta parte".
 *
 * Futuro: en `apps/game-server/src/cards/parts/` se implementan los
 * handlers que leen este diccionario y registran triggers en runtime.
 */

export type PartSlot = 'eyes' | 'ears' | 'mouth' | 'horn' | 'back' | 'tail';
export type PartTriggerWhen = 'onSummon' | 'onAttack' | 'onDestroyed' | 'onTurnStart' | 'passive';

export interface PartMicroEffect {
  /** ID de la parte oficial Axie (ej: "horn_004", "back_002"). */
  id: string;
  /** Nombre legible de la parte (ej: "Anemone", "Hermit"). */
  name: string;
  /** Slot al que pertenece. */
  slot: PartSlot;
  /** Clase Axie principal a la que pertenece esta parte. */
  axieClass: 'Beast' | 'Aquatic' | 'Plant' | 'Bird' | 'Reptile' | 'Bug' | 'Mech' | 'Dawn' | 'Dusk';
  /** Cuándo se dispara el efecto. */
  trigger: PartTriggerWhen;
  /**
   * Descripción legible del micro-efecto (mostrado en card preview + tienda).
   * Format: "Cuando este Axie [trigger]: [efecto]".
   */
  description: string;
  /**
   * Modificadores numéricos del efecto. El handler los lee.
   * Posibles keys: atkBonus, defBonus, drawAmount, healAmount, dmgAmount, debuffAtk, debuffDef.
   */
  effectParams: Record<string, number | string | boolean>;
  /** Tier del efecto: tier 1 = común y débil; tier 4 = legendario y fuerte. Para balance del marketplace. */
  tier: 1 | 2 | 3 | 4;
}

/**
 * Diccionario base de partes de Axie con sus micro-efectos.
 *
 * Naming: usamos los IDs y nombres reales de partes Axie cuando es posible
 * (ej: "Anemone", "Hermit", "Nut Cracker", "Risky Fish"). Esto facilita
 * el matching directo cuando llegue la integración NFT en Fase 6.
 */
export const axiePartsDictionary: Record<string, PartMicroEffect> = {
  // ── Beast parts ───────────────────────────────────────────────────────
  hermit_002: {
    id: 'back_002', name: 'Hermit', slot: 'back', axieClass: 'Beast',
    trigger: 'onSummon',
    description: 'When summoned, gain +200 ATK if you control no other Axies.',
    effectParams: { atkBonus: 200, condition: 'loneOnField' },
    tier: 1,
  },
  little_branch_002: {
    id: 'mouth_002', name: 'Little Branch', slot: 'mouth', axieClass: 'Beast',
    trigger: 'onAttack',
    description: 'On attack, deal +100 burn damage if target is Plant.',
    effectParams: { dmgAmount: 100, vsClass: 'Plant' },
    tier: 2,
  },
  imp_002: {
    id: 'horn_002', name: 'Imp', slot: 'horn', axieClass: 'Beast',
    trigger: 'onAttack',
    description: 'When attacking, gain +150 ATK if your LP < 50% (berserker).',
    effectParams: { atkBonus: 150, condition: 'lpBelowHalf' },
    tier: 3,
  },

  // ── Aquatic parts ─────────────────────────────────────────────────────
  anemone_004: {
    id: 'horn_004', name: 'Anemone', slot: 'horn', axieClass: 'Aquatic',
    trigger: 'onSummon',
    description: 'When summoned, draw 1 card.',
    effectParams: { drawAmount: 1 },
    tier: 2,
  },
  risky_fish_004: {
    id: 'mouth_004', name: 'Risky Fish', slot: 'mouth', axieClass: 'Aquatic',
    trigger: 'onAttack',
    description: 'On attack, deal +200 ATK but take 100 self-damage.',
    effectParams: { atkBonus: 200, selfDmg: 100 },
    tier: 3,
  },
  shrimp_004: {
    id: 'tail_004', name: 'Shrimp', slot: 'tail', axieClass: 'Aquatic',
    trigger: 'passive',
    description: 'Passive: +200 ATK while you have 2+ Aquatic Axies on field.',
    effectParams: { atkBonus: 200, condition: 'multiAqua' },
    tier: 2,
  },

  // ── Plant parts ───────────────────────────────────────────────────────
  cactus_006: {
    id: 'mouth_006', name: 'Cactus', slot: 'mouth', axieClass: 'Plant',
    trigger: 'onDestroyed',
    description: 'When destroyed, deal 300 damage to attacker.',
    effectParams: { dmgAmount: 300, target: 'attacker' },
    tier: 3,
  },
  pumpkin_006: {
    id: 'back_006', name: 'Pumpkin', slot: 'back', axieClass: 'Plant',
    trigger: 'onTurnStart',
    description: 'On your turn start, heal 200 LP.',
    effectParams: { healAmount: 200 },
    tier: 2,
  },
  carrot_006: {
    id: 'tail_006', name: 'Carrot', slot: 'tail', axieClass: 'Plant',
    trigger: 'passive',
    description: 'Passive: +400 DEF while in DEF position.',
    effectParams: { defBonus: 400, condition: 'inDefPosition' },
    tier: 2,
  },
  beech_006: {
    id: 'horn_006', name: 'Beech', slot: 'horn', axieClass: 'Plant',
    trigger: 'onSummon',
    description: 'When summoned, all your Plant Axies gain +100 DEF.',
    effectParams: { defBonus: 100, scope: 'ownPlants' },
    tier: 2,
  },

  // ── Bird parts ────────────────────────────────────────────────────────
  nut_cracker_008: {
    id: 'ears_008', name: 'Nut Cracker', slot: 'ears', axieClass: 'Bird',
    trigger: 'onAttack',
    description: 'Pierce: deal excess damage to opponent LP when destroying a defender.',
    effectParams: { piercing: true },
    tier: 4,
  },
  doubletalk_008: {
    id: 'mouth_008', name: 'Doubletalk', slot: 'mouth', axieClass: 'Bird',
    trigger: 'onSummon',
    description: 'When summoned, opponent shows top card of their deck.',
    effectParams: { reveal: 1 },
    tier: 1,
  },
  swallow_008: {
    id: 'tail_008', name: 'Swallow', slot: 'tail', axieClass: 'Bird',
    trigger: 'onAttack',
    description: 'After attacking, return to hand instead of remaining on field (hit-and-run).',
    effectParams: { returnToHand: true },
    tier: 4,
  },

  // ── Reptile parts ─────────────────────────────────────────────────────
  scaly_spear_010: {
    id: 'horn_010', name: 'Scaly Spear', slot: 'horn', axieClass: 'Reptile',
    trigger: 'onAttack',
    description: 'Apply Poison: target loses 100 LP at start of their next 2 turns.',
    effectParams: { poisonDmg: 100, poisonTurns: 2 },
    tier: 3,
  },
  toothless_bite_010: {
    id: 'mouth_010', name: 'Toothless Bite', slot: 'mouth', axieClass: 'Reptile',
    trigger: 'onAttack',
    description: 'Inflict -300 ATK debuff on target until end of turn.',
    effectParams: { debuffAtk: 300 },
    tier: 2,
  },
  indian_star_010: {
    id: 'back_010', name: 'Indian Star', slot: 'back', axieClass: 'Reptile',
    trigger: 'passive',
    description: 'Passive: cannot be destroyed by Spell effects.',
    effectParams: { spellImmune: true },
    tier: 4,
  },
};

/** Helper: lista todas las partes pertenecientes a una clase Axie. */
export function partsForClass(axieClass: PartMicroEffect['axieClass']): PartMicroEffect[] {
  return Object.values(axiePartsDictionary).filter((p) => p.axieClass === axieClass);
}

/** Helper: encuentra una parte por su ID oficial. */
export function findPartById(partId: string): PartMicroEffect | undefined {
  return Object.values(axiePartsDictionary).find((p) => p.id === partId);
}

/** Helper: lista partes filtradas por slot. */
export function partsBySlot(slot: PartSlot): PartMicroEffect[] {
  return Object.values(axiePartsDictionary).filter((p) => p.slot === slot);
}
