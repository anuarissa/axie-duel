/**
 * Efecto: daño directo "burn" al oponente (sin pasar por monstruo).
 * Diferente de DamageEffect porque burn siempre es al oponente y a veces
 * es triggered (ej: "cuando destruyes un monster del oponente").
 *
 * params: { amount: number }
 *
 * Usado por: Lethal Strike (al destruir monster por battle, +1000 al oponente).
 * Los triggers se activarán desde el motor (Fase 1) — por ahora `addToChain`
 * lo maneja como activación inmediata.
 */

import type { EffectHandler } from './types.js';

export const burnEffect: EffectHandler = ({ state, activatorId, params }) => {
  const amount = typeof params.amount === 'number' ? params.amount : 0;
  if (amount <= 0) return { success: false, mutations: [], message: 'invalid burn amount' };

  const opponentId = [...state.players.keys()].find((id) => id !== activatorId);
  if (!opponentId) return { success: false, mutations: [], message: 'no opponent' };

  const opponent = state.players.get(opponentId);
  if (!opponent) return { success: false, mutations: [], message: 'opponent missing' };

  opponent.lifePoints = Math.max(0, opponent.lifePoints - amount);

  return {
    success: true,
    mutations: [`${opponentId}.lifePoints-=${amount}`],
    message: `Burn ${amount} to ${opponentId} (LP=${opponent.lifePoints})`,
  };
};
