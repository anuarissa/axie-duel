/**
 * Efecto: daño directo a un jugador.
 * params: { amount: number, target?: 'opponent' | 'activator' | 'targeted' }
 */

import type { EffectHandler } from './types.js';

export const damageEffect: EffectHandler = ({ state, activatorId, targets, params }) => {
  const amount = typeof params.amount === 'number' ? params.amount : 0;
  const target = (params.target as 'opponent' | 'activator' | 'targeted') ?? 'opponent';

  let targetPlayerId = '';
  if (target === 'activator') {
    targetPlayerId = activatorId;
  } else if (target === 'targeted') {
    targetPlayerId = targets[0] ?? '';
  } else {
    targetPlayerId = [...state.players.keys()].find((id) => id !== activatorId) ?? '';
  }

  const player = state.players.get(targetPlayerId);
  if (!player) {
    return { success: false, mutations: [], message: 'invalid target player' };
  }
  player.lifePoints = Math.max(0, player.lifePoints - amount);
  return {
    success: true,
    mutations: [`${targetPlayerId}.lifePoints-=${amount}`],
    message: `Dealt ${amount} damage to ${targetPlayerId} (LP=${player.lifePoints})`,
  };
};
