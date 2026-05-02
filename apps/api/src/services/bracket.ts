/**
 * Generador de brackets simples. Fase 0: single-elimination con seeds aleatorios y byes
 * para participantes que no son potencia de 2.
 *
 * Fase 3 sumará Swiss y double-elim.
 */

export interface BracketMatch {
  round: number;
  bracketSlot: number;
  player1Id: string;
  /** null = bye automático, gana player1. */
  player2Id: string | null;
}

/**
 * Genera la primera ronda y deja huecos para rounds posteriores.
 * Asume `participants` ya barajados (el caller decide el shuffle determinista).
 *
 * Si participants.length no es potencia de 2, rellena con `null` (byes) hasta la próxima.
 */
export function generateSingleElimBracket(participantIds: string[]): BracketMatch[] {
  if (participantIds.length < 2) {
    throw new Error('single-elim needs at least 2 participants');
  }
  const targetSize = nextPowerOfTwo(participantIds.length);
  const padded: Array<string | null> = [...participantIds];
  while (padded.length < targetSize) padded.push(null);

  const matches: BracketMatch[] = [];
  for (let i = 0; i < targetSize; i += 2) {
    const p1 = padded[i];
    const p2 = padded[i + 1] ?? null;
    if (!p1) continue; // bye-vs-bye, no se materializa el match
    matches.push({
      round: 1,
      bracketSlot: i / 2,
      player1Id: p1,
      player2Id: p2,
    });
  }
  return matches;
}

/**
 * Dado los winners de la ronda N, genera los matches de la ronda N+1.
 * `winners` viene ordenado por bracketSlot ascendente.
 */
export function generateNextRound(round: number, winners: string[]): BracketMatch[] {
  if (winners.length < 2) return [];
  const matches: BracketMatch[] = [];
  for (let i = 0; i < winners.length; i += 2) {
    const p1 = winners[i];
    const p2 = winners[i + 1];
    if (!p1) continue;
    matches.push({
      round,
      bracketSlot: i / 2,
      player1Id: p1,
      player2Id: p2 ?? null,
    });
  }
  return matches;
}

export function nextPowerOfTwo(n: number): number {
  if (n < 1) return 1;
  return 2 ** Math.ceil(Math.log2(n));
}

/** Helper: cuántas rondas tiene un single-elim de N jugadores. */
export function totalRounds(participantCount: number): number {
  return Math.ceil(Math.log2(Math.max(2, nextPowerOfTwo(participantCount))));
}

/**
 * Calcula el rank final de cada jugador en single-elim.
 * - Ganador del último match → rank 1.
 * - Perdedor del último match → rank 2.
 * - Perdedores de la semifinal → rank 3 (compartido).
 * - Perdedores de cuartos → rank 5 (compartido).
 * - etc.
 */
export function computeFinalRanks(
  matches: Array<{ round: number; player1Id: string; player2Id: string | null; winnerId: string | null }>,
): Map<string, number> {
  const ranks = new Map<string, number>();
  if (matches.length === 0) return ranks;
  const maxRound = Math.max(...matches.map((m) => m.round));

  // Final
  const final = matches.find((m) => m.round === maxRound);
  if (final?.winnerId) {
    ranks.set(final.winnerId, 1);
    const loser = final.winnerId === final.player1Id ? final.player2Id : final.player1Id;
    if (loser) ranks.set(loser, 2);
  }

  // Rondas anteriores: rank = 2^(maxRound - round) + 1
  for (let r = maxRound - 1; r >= 1; r--) {
    const rank = 2 ** (maxRound - r) + 1;
    const roundMatches = matches.filter((m) => m.round === r);
    for (const m of roundMatches) {
      if (!m.winnerId) continue;
      const loser = m.winnerId === m.player1Id ? m.player2Id : m.player1Id;
      if (loser && !ranks.has(loser)) ranks.set(loser, rank);
    }
  }
  return ranks;
}
