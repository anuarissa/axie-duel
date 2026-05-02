/**
 * Cálculo de combate Yu-Gi-Oh!. Función pura, sin side-effects.
 * Master prompt sección 4.6.
 */

import type { CardInstance, MonsterCard } from '@axie-duel/shared-types';

export interface CombatResult {
  /** instanceId de los monstruos destruidos (puede ser 0, 1 o 2). */
  destroyed: string[];
  /** LP perdidos por cada jugador, indexado por playerId. */
  damage: Record<string, number>;
  /** Si el ataque fue directo (no había monstruo defensor). */
  direct: boolean;
}

interface MonsterStats {
  atk: number;
  def: number;
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
 */
export function resolveCombat(
  attacker: CardInstance,
  attackerStats: MonsterStats,
  attackerOwnerId: string,
  defender: CardInstance | null,
  defenderStats: MonsterStats | null,
  defenderOwnerId: string,
): CombatResult {
  // Daño directo: no hay monstruo defensor.
  if (!defender || !defenderStats) {
    return {
      destroyed: [],
      damage: { [defenderOwnerId]: attackerStats.atk },
      direct: true,
    };
  }

  // Defensor en ATK (incluye boca arriba): comparar ATK vs ATK.
  if (defender.position === 'ATK') {
    if (attackerStats.atk > defenderStats.atk) {
      return {
        destroyed: [defender.instanceId],
        damage: { [defenderOwnerId]: attackerStats.atk - defenderStats.atk },
        direct: false,
      };
    }
    if (attackerStats.atk < defenderStats.atk) {
      return {
        destroyed: [attacker.instanceId],
        damage: { [attackerOwnerId]: defenderStats.atk - attackerStats.atk },
        direct: false,
      };
    }
    // Empate: ambos destruidos, sin daño.
    return {
      destroyed: [attacker.instanceId, defender.instanceId],
      damage: {},
      direct: false,
    };
  }

  // Defensor en DEF (boca arriba o boca abajo): comparar ATK vs DEF.
  // Boca abajo se voltea automáticamente al ser atacado (flip).
  if (attackerStats.atk > defenderStats.def) {
    // Atacante destruye defensor sin daño.
    return {
      destroyed: [defender.instanceId],
      damage: {},
      direct: false,
    };
  }
  if (attackerStats.atk < defenderStats.def) {
    // Atacante recibe el "daño en defensa" igual a la diferencia.
    return {
      destroyed: [],
      damage: { [attackerOwnerId]: defenderStats.def - attackerStats.atk },
      direct: false,
    };
  }
  // ATK == DEF: nada pasa.
  return { destroyed: [], damage: {}, direct: false };
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
