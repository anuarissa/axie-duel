/**
 * Cálculo de combate Yu-Gi-Oh!. Función pura, sin side-effects.
 * Master prompt sección 4.6.
 */

import type { CardInstance, MonsterCard } from '@axie-duel/shared-types';
import {
  CLASS_ADVANTAGE_MULTIPLIER,
  CLASS_DISADVANTAGE_MULTIPLIER,
  classMatchup,
  type AxieClass,
  type ClassMatchup,
} from './constants.js';

export interface CombatResult {
  /** instanceId de los monstruos destruidos (puede ser 0, 1 o 2). */
  destroyed: string[];
  /** LP perdidos por cada jugador, indexado por playerId. */
  damage: Record<string, number>;
  /** Si el ataque fue directo (no había monstruo defensor). */
  direct: boolean;
  /** Signed % aplicado al ATK base: +15 (advantage), -15 (disadvantage), 0 (neutral). */
  advantageBonus: number;
  /** ATK efectivo finalmente usado (post-multiplier). Útil para UI. */
  effectiveAtk: number;
  /** Matchup type for client VFX (floating text color). */
  matchup: ClassMatchup;
}

interface MonsterStats {
  atk: number;
  def: number;
}

export interface ResolveCombatOptions {
  /** Clase Axie del atacante. Si presente y attackerOwnerId tiene ventaja → +15% ATK. */
  attackerClass?: AxieClass;
  defenderClass?: AxieClass;
}

/**
 * Resuelve un combate entre atacante y defensor.
 *
 * @param attacker - Instancia del atacante (siempre en posición ATK).
 * @param attackerStats - ATK/DEF efectivos del atacante (incluyendo modificadores).
 * @param attackerOwnerId - playerId del dueño del atacante.
 * @param defender - Instancia del defensor, o null si es ataque directo.
 * @param defenderStats - ATK/DEF efectivos del defensor.
 * @param defenderOwnerId - playerId del dueño del defensor (== oponente).
 * @param options - Class advantage opcional (si attacker tiene class advantage sobre defender, +15% ATK).
 */
export function resolveCombat(
  attacker: CardInstance,
  attackerStats: MonsterStats,
  attackerOwnerId: string,
  defender: CardInstance | null,
  defenderStats: MonsterStats | null,
  defenderOwnerId: string,
  options: ResolveCombatOptions = {},
): CombatResult {
  // Class triangle modifier: ±15% on attacker ATK.
  let advantageBonus = 0;
  let matchup: ClassMatchup = 'neutral';
  let effectiveAtk = attackerStats.atk;
  if (options.attackerClass && options.defenderClass) {
    matchup = classMatchup(options.attackerClass, options.defenderClass);
    if (matchup === 'advantage') {
      effectiveAtk = Math.floor(attackerStats.atk * CLASS_ADVANTAGE_MULTIPLIER);
      advantageBonus = 15;
    } else if (matchup === 'disadvantage') {
      effectiveAtk = Math.floor(attackerStats.atk * CLASS_DISADVANTAGE_MULTIPLIER);
      advantageBonus = -15;
    }
  }

  if (!defender || !defenderStats) {
    return {
      destroyed: [],
      damage: { [defenderOwnerId]: effectiveAtk },
      direct: true,
      advantageBonus,
      effectiveAtk,
      matchup,
    };
  }

  if (defender.position === 'ATK') {
    if (effectiveAtk > defenderStats.atk) {
      return {
        destroyed: [defender.instanceId],
        damage: { [defenderOwnerId]: effectiveAtk - defenderStats.atk },
        direct: false,
        advantageBonus,
        effectiveAtk,
        matchup,
      };
    }
    if (effectiveAtk < defenderStats.atk) {
      return {
        destroyed: [attacker.instanceId],
        damage: { [attackerOwnerId]: defenderStats.atk - effectiveAtk },
        direct: false,
        advantageBonus,
        effectiveAtk,
        matchup,
      };
    }
    return {
      destroyed: [attacker.instanceId, defender.instanceId],
      damage: {},
      direct: false,
      advantageBonus,
      effectiveAtk,
      matchup,
    };
  }

  if (effectiveAtk > defenderStats.def) {
    return {
      destroyed: [defender.instanceId],
      damage: {},
      direct: false,
      advantageBonus,
      effectiveAtk,
      matchup,
    };
  }
  if (effectiveAtk < defenderStats.def) {
    return {
      destroyed: [],
      damage: { [attackerOwnerId]: defenderStats.def - effectiveAtk },
      direct: false,
      advantageBonus,
      effectiveAtk,
      matchup,
    };
  }
  return { destroyed: [], damage: {}, direct: false, advantageBonus, effectiveAtk, matchup };
}

/**
 * Helper: resuelve los stats efectivos de una instancia (carta base + modificadores).
 */
export function effectiveStats(card: MonsterCard, instance: CardInstance): MonsterStats {
  return {
    atk: Math.max(0, card.atk + instance.atkMod),
    def: Math.max(0, card.def + instance.defMod),
  };
}
