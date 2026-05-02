/**
 * Efecto: el jugador roba N cartas.
 * params: { amount: number, target?: 'activator' | 'opponent' }
 */

import type { EffectHandler } from './types.js';

export const drawEffect: EffectHandler = ({ state, activatorId, params }) => {
  const amount = typeof params.amount === 'number' ? params.amount : 1;
  const target = (params.target as 'activator' | 'opponent') ?? 'activator';
  const targetId =
    target === 'activator' ? activatorId : [...state.players.keys()].find((id) => id !== activatorId) ?? '';
  const player = state.players.get(targetId);
  if (!player) return { success: false, mutations: [], message: 'invalid player' };

  let drawn = 0;
  for (let i = 0; i < amount; i++) {
    const card = player.deck.shift();
    if (!card) break;
    player.hand.push(card);
    drawn++;
  }
  player.handSize = player.hand.length;
  return {
    success: drawn > 0,
    mutations: [`${targetId}.hand+=${drawn}`],
    message: `${targetId} drew ${drawn} card(s)`,
  };
};
