/**
 * Efecto: aplica un atkBonus / defBonus al source (la propia carta) si la condición se cumple.
 * params: {
 *   atkBonus?: number,
 *   defBonus?: number,
 *   condition?: 'always' | 'loneOnField',
 * }
 *
 * Ejemplo de uso: Olek the Frost Fang (mon_beast_001) — +200 ATK si controla solo este monster.
 */

import type { EffectHandler } from './types.js';

export const buffEffect: EffectHandler = ({ state, source, activatorId, params }) => {
  const atkBonus = typeof params.atkBonus === 'number' ? params.atkBonus : 0;
  const defBonus = typeof params.defBonus === 'number' ? params.defBonus : 0;
  const condition = (params.condition as string) ?? 'always';

  const player = state.players.get(activatorId);
  if (!player) {
    return { success: false, mutations: [], message: 'invalid player' };
  }

  if (condition === 'loneOnField') {
    const monstersOnField = player.monsterZones.filter((c) => c.instanceId).length;
    if (monstersOnField !== 1) {
      return {
        success: false,
        mutations: [],
        message: `loneOnField condition not met (${monstersOnField} monsters on field)`,
      };
    }
  }

  source.atkMod += atkBonus;
  source.defMod += defBonus;

  return {
    success: true,
    mutations: [`${source.instanceId}.atkMod+=${atkBonus}`, `${source.instanceId}.defMod+=${defBonus}`],
    message: `Buff applied: +${atkBonus} ATK / +${defBonus} DEF on ${source.instanceId}`,
  };
};
