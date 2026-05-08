/**
 * Axie NFT → Card Stats: Deterministic Algorithm V1
 *
 * Input: Axie data from Ronin chain + Axie GraphQL Gateway
 * Output: AxieCardStats — unique playable card spec
 *
 * Determinístico: same Axie + same algorithm version → always same card.
 * No randomness. Audit-friendly. Server-signs the output for anti-cheat.
 *
 * Spec: docs/PARTS_ALGORITHM.md (lookup table + rationale).
 */

export type AxieClass =
  | 'Beast' | 'Aqua' | 'Plant' | 'Bird' | 'Reptile'
  | 'Bug' | 'Mech' | 'Dawn' | 'Dusk';

export type AxiePartType = 'eyes' | 'ears' | 'mouth' | 'horn' | 'back' | 'tail';

export interface AxiePart {
  type: AxiePartType;
  /** Lowercase part identifier, e.g. "puppy", "lagging", "snail-shell". */
  id: string;
  class: AxieClass | string;
  /** 1=common, 2=rare, 3=mystic. Default 1 if unknown. */
  rarityTier?: 1 | 2 | 3;
}

export interface AxieInput {
  tokenId: number | string;
  class: AxieClass;
  parts: AxiePart[];
  /** Unix ms. Used to derive level proxy. */
  birthDate?: number;
  /** Game-server level if known (overrides our level calc). */
  level?: number;
}

export type CardEffectKind =
  | 'auraSelfAtk' | 'auraAllyClassAtk' | 'auraAllyClassDef'
  | 'onAttackDraw' | 'onAttackPierce' | 'onAttackHeal'
  | 'onSummonBurn' | 'onDeathBurn' | 'onDeathDraw' | 'onDefendReflect'
  | 'passiveDefBonus' | 'passiveSoloAtk' | 'passiveTrapImmune'
  | 'sustainHeal';

export interface CardEffect {
  kind: CardEffectKind;
  description: string;
  amount?: number;
  chance?: number;
  classFilter?: AxieClass;
}

export type CardRarity = 'Common' | 'Rare' | 'Epic' | 'Legendary';

export interface AxieCardStats {
  cardId: string;
  name: string;
  classType: AxieClass;
  level: number;
  atk: number;
  def: number;
  burns: 0 | 1 | 2;
  effect?: CardEffect;
  rarity: CardRarity;
  /** Source Axie token ID for traceability. */
  sourceTokenId: string;
  /** Algorithm version used. Bumping invalidates cached cards. */
  algorithmVersion: 'v1';
}

// ─── Step 2: base stats per class ─────────────────────────────────────────

const CLASS_BASE_ATK: Record<AxieClass, number> = {
  Beast: 1700, Bug: 1500, Mech: 1900, Plant: 1100, Reptile: 1400,
  Dusk: 1300, Aqua: 1500, Bird: 1800, Dawn: 1600,
};

const CLASS_BASE_DEF: Record<AxieClass, number> = {
  Beast: 1200, Bug: 1100, Mech: 1400, Plant: 1900, Reptile: 1700,
  Dusk: 1500, Aqua: 1500, Bird: 900, Dawn: 1300,
};

// ─── Step 3: parts modifier table (V1 — covers ~30 common parts) ─────────

interface PartMod {
  atk: number;
  def: number;
  effect?: CardEffect;
}

const PARTS_MODIFIER_TABLE: Record<string, PartMod> = {
  // Beast parts
  'puppy':       { atk: 50, def: 30 },
  'pup':         { atk: 30, def: 20 },
  'axie-kiss':   { atk: 80, def: 0 },
  'furball':     { atk: 0,  def: 50, effect: { kind: 'onDeathBurn', description: 'On death: deal 300 damage to opponent LP', amount: 300 } },
  'cottontail':  { atk: 20, def: 20, effect: { kind: 'onDeathDraw', description: 'On death: draw 1 card', amount: 1 } },
  'ronin':       { atk: 100, def: 0, effect: { kind: 'onAttackPierce', description: 'On attack: 30% chance to pierce DEF', chance: 30 } },
  'imp':         { atk: 60, def: 0, effect: { kind: 'onSummonBurn', description: 'On summon: deal 200 damage to opponent LP', amount: 200 } },
  // Plant parts
  'little-branch': { atk: 40, def: 60 },
  'snail-shell':   { atk: -50, def: 200, effect: { kind: 'passiveDefBonus', description: 'Passive: +500 DEF when in DEF position', amount: 500 } },
  'hermit':        { atk: 0, def: 100, effect: { kind: 'onDefendReflect', description: 'On defend: reflect 30% damage', amount: 30 } },
  'rose-bud':      { atk: 30, def: 40 },
  'lotus':         { atk: 0, def: 50, effect: { kind: 'sustainHeal', description: 'Aura: heal 50 LP per turn', amount: 50 } },
  'leaf-bud':      { atk: 20, def: 60 },
  // Bug parts
  'shoebill':    { atk: 80, def: 20, effect: { kind: 'auraAllyClassAtk', description: '+200 ATK to all your Bug Axies', amount: 200, classFilter: 'Bug' } },
  'lagging':     { atk: 60, def: 0,  effect: { kind: 'onAttackDraw', description: 'On attack: 30% chance to draw 1 card', chance: 30 } },
  'thorny-cat':  { atk: 50, def: 30 },
  'antenna':     { atk: 30, def: 40 },
  // Aqua parts
  'tiny-turtle': { atk: 40, def: 60, effect: { kind: 'onAttackHeal', description: 'On attack: heal 100 LP', amount: 100 } },
  'risky-fish':  { atk: 70, def: 0  },
  'shrimp':      { atk: 50, def: 40 },
  // Bird parts
  'lips':        { atk: 60, def: 0,  effect: { kind: 'auraSelfAtk', description: 'Aura: +200 ATK to self', amount: 200 } },
  'feather-fan': { atk: 80, def: 10 },
  'eggshell':    { atk: 30, def: 50 },
  'nut-cracker': { atk: 90, def: 0  },
  // Reptile parts
  'tiny-fan':    { atk: 40, def: 60 },
  'mint':        { atk: 30, def: 40, effect: { kind: 'passiveTrapImmune', description: 'Passive: immune to enemy traps' } },
  'venom-bite':  { atk: 70, def: 30 },
  // Generic / cross-class fallbacks
  'zigzag':      { atk: 40, def: 30, effect: { kind: 'onAttackPierce', description: 'On attack: 20% chance to pierce DEF', chance: 20 } },
  'gas':         { atk: 30, def: 30, effect: { kind: 'passiveSoloAtk', description: 'Passive: +10% ATK if no other axie on field', amount: 10 } },
  'puppy-eye':   { atk: 30, def: 30 },
  'starry':      { atk: 50, def: 50 },
};

const DEFAULT_PART_MOD: PartMod = { atk: 30, def: 30 };

// ─── Helpers ───────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getPartMod(part: AxiePart): PartMod {
  const id = (part.id ?? '').toLowerCase().trim();
  return PARTS_MODIFIER_TABLE[id] ?? DEFAULT_PART_MOD;
}

// ─── Main algorithm ──────────────────────────────────────────────────────

export function partsToCard(input: AxieInput): AxieCardStats {
  const classType = input.class;
  const baseAtk = CLASS_BASE_ATK[classType] ?? 1500;
  const baseDef = CLASS_BASE_DEF[classType] ?? 1200;

  let atk = baseAtk;
  let def = baseDef;

  // Step 3: sum part modifiers with synergy bonus for same-class parts.
  let synergyParts = 0;
  let mappedEffects = 0;
  let primaryEffect: CardEffect | undefined;
  // Order of precedence for primary effect: horn > mouth > back > tail > eyes > ears.
  const effectPartPriority: AxiePartType[] = ['horn', 'mouth', 'back', 'tail', 'eyes', 'ears'];

  for (const part of input.parts) {
    const mod = getPartMod(part);
    const isSynergy = part.class === classType;
    if (isSynergy) synergyParts++;
    if (mod.effect) mappedEffects++;

    const synergyMult = isSynergy ? 1.2 : 1.0;
    atk += Math.round(mod.atk * synergyMult);
    def += Math.round(mod.def * synergyMult);
  }

  // Pick primary effect by part-type priority order.
  for (const partType of effectPartPriority) {
    const part = input.parts.find((p) => p.type === partType);
    if (!part) continue;
    const mod = getPartMod(part);
    if (mod.effect) {
      primaryEffect = mod.effect;
      break;
    }
  }

  // Step 4: clamp stats.
  atk = clamp(atk, 800, 2800);
  def = clamp(def, 600, 2400);

  // Step 5: level + burns.
  let level: number;
  if (typeof input.level === 'number') {
    level = clamp(input.level, 1, 8);
  } else {
    const ageMonths = input.birthDate
      ? (Date.now() - input.birthDate) / (30 * 24 * 60 * 60 * 1000)
      : 6;
    const rarityTier = Math.max(1, ...input.parts.map((p) => p.rarityTier ?? 1));
    level = clamp(Math.round(ageMonths / 6 + rarityTier), 1, 8);
  }
  const burns: 0 | 1 | 2 = level <= 4 ? 0 : level <= 6 ? 1 : 2;

  // Step 7: rarity classification.
  let rarity: CardRarity = 'Common';
  if (synergyParts >= 5 && mappedEffects >= 4) rarity = 'Legendary';
  else if (synergyParts >= 3 && mappedEffects >= 3) rarity = 'Epic';
  else if (synergyParts >= 1 && mappedEffects >= 1) rarity = 'Rare';

  const sourceTokenId = String(input.tokenId);

  const card: AxieCardStats = {
    cardId: `axie-${sourceTokenId}`,
    name: `${classType} Axie #${sourceTokenId}`,
    classType,
    level,
    atk,
    def,
    burns,
    rarity,
    sourceTokenId,
    algorithmVersion: 'v1',
  };
  if (primaryEffect) card.effect = primaryEffect;
  return card;
}

/**
 * Derives a stable color tint from token ID for visual variety.
 * Same tokenId always → same color. UI-only.
 */
export function tokenIdToHue(tokenId: number | string): number {
  const num = typeof tokenId === 'number' ? tokenId : parseInt(String(tokenId), 10);
  const hash = (num * 2654435761) % 360;
  return (hash + 360) % 360;
}
