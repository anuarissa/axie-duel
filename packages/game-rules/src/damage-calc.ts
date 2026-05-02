/**
 * Cálculo de combate Yu-Gi-Oh!. Función pura, sin side-effects.
 * Master prompt sección 4.6.
 */

import type { CardInstance, MonsterCard } from '@axie-duel/shared-types';
import { CLASS_ADVANTAGE_MULTIPLIER, hasClassAdvantage, type AxieClass } from './constants.js';

export interface CombatResult {
  /** instanceId de los monstruos destruidos (puede ser 0, 1 o 2). */
  destroyed: string[];
  /** LP perdidos por cada jugador, indexado por playerId. */
  damage: Record<string, number>;
  /** Si el ataque fue directo (no había monstruo defensor). */
  direct: boolean;
  /** % bonus aplicado al ATK por ventaja de clase (0 = sin ventaja, 15 = +15%). */
  advantageBonus: number;
  /** ATK efectivo finalmente usado (post-multiplier). Útil para UI. */
  effectiveAtk: number;
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
  // Aplicar ventaja de clase al ATK efectivo del atacante si corresponde.
  let advantageBonus = 0;
  let effectiveAtk = attackerStats.atk;
  if (options.attackerClass && options.defenderClass) {
    if (hasClassAdvantage(options.attackerClass, options.defenderClass)) {
      effectiveAtk = Math.floor(attackerStats.atk * CLASS_ADVANTAGE_MULTIPLIER);
      advantageBonus = 15;
    }
  }

  // Daño directo: no hay monstruo defensor.
  if (!defender || !defenderStats) {
    return {
      destroyed: [],
      damage: { [defenderOwnerId]: effectiveAtk },
      direct: true,
      advantageBonus,
      effectiveAtk,
    };
  }

  // Defensor en ATK (incluye boca arriba): comparar ATK vs ATK.
  if (defender.position === 'ATK') {
    if (effectiveAtk > defenderStats.atk) {
      return {
        destroyed: [defender.instanceId],
        damage: { [defenderOwnerId]: effectiveAtk - defenderStats.atk },
        direct: false,
        advantageBonus,
        effectiveAtk,
      };
    }
    if (effectiveAtk < defenderStats.atk) {
      return {
        destroyed: [attacker.instanceId],
        damage: { [attackerOwnerId]: defenderStats.atk - effectiveAtk },
        direct: false,
        advantageBonus,
        effectiveAtk,
      };
    }
    // Empate: ambos destruidos, sin daño.
    return {
      destroyed: [attacker.instanceId, defender.instanceId],
      damage: {},
      direct: false,
      advantageBonus,
      effectiveAtk,
    };
  }

  // Defensor en DEF (boca arriba o boca abajo): comparar ATK vs DEF.
  // Boca abajo se voltea automáticamente al ser atacado (flip).
  if (effectiveAtk > defenderStats.def) {
    // Atacante destruye defensor sin daño.
    return {
      destroyed: [defender.instanceId],
      damage: {},
      direct: false,
      advantageBonus,
      effectiveAtk,
    };
  }
  if (effectiveAtk < defenderStats.def) {
    // Atacante recibe el "daño en defensa" igual a la diferencia.
    return {
      destroyed: [],
      damage: { [attackerOwnerId]: defenderStats.def - effectiveAtk },
      direct: false,
      advantageBonus,
      effectiveAtk,
    };
  }
  // ATK == DEF: nada pasa.
  return { destroyed: [], damage: {}, direct: false, advantageBonus, effectiveAtk };
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
