/**
 * Mapeo Axie -> carta Monster.
 * Convierte stats de un Axie real (HP/Speed/Skill/Morale) en ATK/DEF/Level
 * para usarlo como `MonsterCard` dentro del juego.
 *
 * El mapeo es DETERMINISTA — el mismo Axie siempre genera la misma carta,
 * lo cual es crítico para el balance: un usuario no puede "rerollear" stats.
 */

import type { Axie, MonsterCard, MonsterTypeAttribute } from '@axie-duel/shared-types';

const CLASS_TO_MONSTER_TYPE: Record<Axie['class'], MonsterTypeAttribute> = {
  Beast: 'Beast',
  Aquatic: 'Aqua',
  Plant: 'Plant',
  Bird: 'Beast',
  Bug: 'Insect',
  Reptile: 'Reptile',
  Dawn: 'Fairy',
  Dusk: 'Fiend',
  Mech: 'Machine',
};

/**
 * Heurística de nivel: 1 estrella por cada ~13 puntos de stat total.
 * Stats van ~25-58 por slot, total max ~232. Resulta en niveles 2-12.
 */
function statsToLevel(stats: Axie['stats']): number {
  const total = stats.hp + stats.speed + stats.skill + stats.morale;
  const lvl = Math.max(1, Math.min(12, Math.round(total / 19)));
  return lvl;
}

/** ATK = Skill * 30 + Morale * 25 (favorece daño ofensivo). */
function statsToAtk(stats: Axie['stats']): number {
  return Math.round(stats.skill * 30 + stats.morale * 25);
}

/** DEF = HP * 18 + Speed * 12 (favorece tanqueo). */
function statsToDef(stats: Axie['stats']): number {
  return Math.round(stats.hp * 18 + stats.speed * 12);
}

export interface AxieToMonsterOptions {
  /** Si la carta debe marcarse como NFT (true cuando viene de un Axie real con tokenId). */
  isNFT: boolean;
  /** Rareza heurística — Mystic si tiene specialGenes, sino Common/Rare por nivel. */
  rarityOverride?: MonsterCard['rarity'];
}

export function axieToMonsterCard(axie: Axie, opts: AxieToMonsterOptions): MonsterCard {
  const level = statsToLevel(axie.stats);
  const atk = statsToAtk(axie.stats);
  const def = statsToDef(axie.stats);
  const hasSpecial = axie.parts.some((p) => p.specialGenes && p.specialGenes !== '');
  const rarity: MonsterCard['rarity'] =
    opts.rarityOverride ?? (hasSpecial ? 'Mystic' : level >= 7 ? 'Epic' : level >= 5 ? 'Rare' : 'Common');

  return {
    id: `axie_${axie.id}`,
    name: axie.name || `Axie #${axie.id}`,
    type: 'Monster',
    rarity,
    imageUrl: axie.image,
    description: `Imported Axie ${axie.id}. Level ${level} ${axie.class}.`,
    isNFT: opts.isNFT,
    ...(opts.isNFT && axie.tokenId ? { tokenId: axie.tokenId } : {}),
    level,
    attribute: axie.class,
    monsterType: CLASS_TO_MONSTER_TYPE[axie.class],
    atk,
    def,
    parts: axie.parts,
    axie,
  };
}
