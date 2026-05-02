/**
 * Cálculo ELO estándar (Arpad Elo) con K-factor configurable.
 * Función pura — sin DB, sin side-effects. El servicio que la consume
 * aplica los deltas en una transacción.
 *
 * Default K=32 (igual a Yu-Gi-Oh! Master Duel y similares). Se puede bajar a 16
 * para players de alto rating en Fase 3 (escalado por elo).
 */

export const DEFAULT_K_FACTOR = 32;

export interface EloChange {
  player1NewElo: number;
  player2NewElo: number;
  player1Delta: number;
  player2Delta: number;
}

export type EloOutcome = 'P1_WIN' | 'P2_WIN' | 'DRAW';

/**
 * Calcula nuevo ELO para ambos jugadores tras un match.
 * - actualScore = 1 (gana), 0.5 (empate), 0 (pierde)
 * - expectedScore = 1 / (1 + 10^((opponentElo - myElo) / 400))
 * - newElo = oldElo + K * (actualScore - expectedScore)
 */
export function calculateElo(
  player1Elo: number,
  player2Elo: number,
  outcome: EloOutcome,
  kFactor = DEFAULT_K_FACTOR,
): EloChange {
  const expected1 = 1 / (1 + 10 ** ((player2Elo - player1Elo) / 400));
  const expected2 = 1 - expected1;
  const actual1 = outcome === 'P1_WIN' ? 1 : outcome === 'DRAW' ? 0.5 : 0;
  const actual2 = 1 - actual1;
  const delta1 = Math.round(kFactor * (actual1 - expected1));
  const delta2 = Math.round(kFactor * (actual2 - expected2));
  return {
    player1NewElo: Math.max(0, player1Elo + delta1),
    player2NewElo: Math.max(0, player2Elo + delta2),
    player1Delta: delta1,
    player2Delta: delta2,
  };
}
