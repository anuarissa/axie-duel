/**
 * Efecto: aplica buff persistente a un monstruo target del propio jugador.
 * Usado por cartas de Equip Spell (ej: Lunacian Blessing).
 * params: {
 *   atkBonus?: number,
 *   defBonus?: number,
 *   trapDestructionImmunity?: boolean,  // setea counter en el target
 * }
 *
 * El target debe ser un monstruo en zonas del jugador activador.
 */

import type { EffectHandler } from './types.js';

export const equipEffect: EffectHandler = ({ state, activatorId, targets, params }) => {
  const atkBonus = typeof params.atkBonus === 'number' ? params.atkBonus : 0;
  const defBonus = typeof params.defBonus === 'number' ? params.defBonus : 0;
  const immunity = !!params.trapDestructionImmunity;

  const player = state.players.get(activatorId);
  if (!player) return { success: false, mutations: [], message: 'invalid player' };

  const targetId = targets[0];
  if (!targetId) return { success: false, mutations: [], message: 'equip requires 1 target' };

  const target = player.monsterZones.find((c) => c.instanceId === targetId);
  if (!target) return { success: false, mutations: [], message: 'target not on own field' };

  target.atkMod += atkBonus;
  target.defMod += defBonus;
  if (immunity) target.counters.set('trapDestructionImmune', 1);

  return {
    success: true,
    mutations: [
      `${targetId}.atkMod+=${atkBonus}`,
      `${targetId}.defMod+=${defBonus}`,
      ...(immunity ? [`${targetId}.counters.trapDestructionImmune=1`] : []),
    ],
    message: `Equipped ${targetId}: +${atkBonus} ATK / +${defBonus} DEF${immunity ? ' + trap immunity' : ''}`,
  };
};
