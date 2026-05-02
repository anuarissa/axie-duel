import { describe, expect, it } from 'vitest';
import {
  generateSingleElimBracket,
  generateNextRound,
  nextPowerOfTwo,
  totalRounds,
  computeFinalRanks,
} from '../src/services/bracket.js';

describe('nextPowerOfTwo', () => {
  it('returns powers of 2 greater than or equal to n', () => {
    expect(nextPowerOfTwo(1)).toBe(1);
    expect(nextPowerOfTwo(2)).toBe(2);
    expect(nextPowerOfTwo(3)).toBe(4);
    expect(nextPowerOfTwo(5)).toBe(8);
    expect(nextPowerOfTwo(8)).toBe(8);
    expect(nextPowerOfTwo(9)).toBe(16);
  });
});

describe('totalRounds', () => {
  it('computes log2 rounds', () => {
    expect(totalRounds(2)).toBe(1);
    expect(totalRounds(4)).toBe(2);
    expect(totalRounds(8)).toBe(3);
    expect(totalRounds(16)).toBe(4);
  });
  it('rounds up for non-power-of-2', () => {
    expect(totalRounds(5)).toBe(3); // padded to 8
    expect(totalRounds(9)).toBe(4); // padded to 16
  });
});

describe('generateSingleElimBracket', () => {
  it('throws when fewer than 2 participants', () => {
    expect(() => generateSingleElimBracket([])).toThrow();
    expect(() => generateSingleElimBracket(['a'])).toThrow();
  });

  it('generates 1 match for 2 participants', () => {
    const matches = generateSingleElimBracket(['a', 'b']);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({ round: 1, bracketSlot: 0, player1Id: 'a', player2Id: 'b' });
  });

  it('generates 2 matches for 4 participants', () => {
    const matches = generateSingleElimBracket(['a', 'b', 'c', 'd']);
    expect(matches).toHaveLength(2);
    expect(matches[0]).toEqual({ round: 1, bracketSlot: 0, player1Id: 'a', player2Id: 'b' });
    expect(matches[1]).toEqual({ round: 1, bracketSlot: 1, player1Id: 'c', player2Id: 'd' });
  });

  it('pads with byes when participants are not power of 2 (3 → 4 slots)', () => {
    const matches = generateSingleElimBracket(['a', 'b', 'c']);
    // padded to size 4. matches: a vs b, c vs null (bye for c).
    expect(matches).toHaveLength(2);
    const cMatch = matches.find((m) => m.player1Id === 'c');
    expect(cMatch?.player2Id).toBeNull();
  });

  it('handles 5 participants (padded to 8)', () => {
    const matches = generateSingleElimBracket(['a', 'b', 'c', 'd', 'e']);
    // size=8 so 4 matches. 'e' vs null bye, plus 1 more bye-vs-bye that gets skipped.
    const real = matches.filter((m) => m.player2Id !== null);
    const byes = matches.filter((m) => m.player2Id === null);
    expect(real.length + byes.length).toBeLessThanOrEqual(4);
    expect(byes.some((m) => m.player1Id === 'e')).toBe(true);
  });
});

describe('generateNextRound', () => {
  it('pairs winners 0-1, 2-3, ...', () => {
    const next = generateNextRound(2, ['w1', 'w2', 'w3', 'w4']);
    expect(next).toEqual([
      { round: 2, bracketSlot: 0, player1Id: 'w1', player2Id: 'w2' },
      { round: 2, bracketSlot: 1, player1Id: 'w3', player2Id: 'w4' },
    ]);
  });
  it('returns empty when only one winner remains', () => {
    expect(generateNextRound(3, ['champ'])).toEqual([]);
  });
  it('handles odd winners with bye', () => {
    const next = generateNextRound(2, ['w1', 'w2', 'w3']);
    expect(next).toHaveLength(2);
    expect(next[1]?.player2Id).toBeNull();
  });
});

describe('computeFinalRanks', () => {
  it('ranks 4-player single-elim correctly', () => {
    // Round 1: a beats b, c beats d.
    // Round 2: a beats c → a champion (rank 1), c finalist (rank 2),
    // b and d eliminated round 1 → both rank 3.
    const matches = [
      { round: 1, player1Id: 'a', player2Id: 'b', winnerId: 'a' },
      { round: 1, player1Id: 'c', player2Id: 'd', winnerId: 'c' },
      { round: 2, player1Id: 'a', player2Id: 'c', winnerId: 'a' },
    ];
    const ranks = computeFinalRanks(matches);
    expect(ranks.get('a')).toBe(1);
    expect(ranks.get('c')).toBe(2);
    expect(ranks.get('b')).toBe(3);
    expect(ranks.get('d')).toBe(3);
  });

  it('ranks 8-player bracket', () => {
    const matches = [
      // QF
      { round: 1, player1Id: 'a', player2Id: 'b', winnerId: 'a' },
      { round: 1, player1Id: 'c', player2Id: 'd', winnerId: 'c' },
      { round: 1, player1Id: 'e', player2Id: 'f', winnerId: 'e' },
      { round: 1, player1Id: 'g', player2Id: 'h', winnerId: 'g' },
      // SF
      { round: 2, player1Id: 'a', player2Id: 'c', winnerId: 'a' },
      { round: 2, player1Id: 'e', player2Id: 'g', winnerId: 'e' },
      // Final
      { round: 3, player1Id: 'a', player2Id: 'e', winnerId: 'a' },
    ];
    const ranks = computeFinalRanks(matches);
    expect(ranks.get('a')).toBe(1);
    expect(ranks.get('e')).toBe(2);
    // SF losers
    expect(ranks.get('c')).toBe(3);
    expect(ranks.get('g')).toBe(3);
    // QF losers
    expect(ranks.get('b')).toBe(5);
    expect(ranks.get('d')).toBe(5);
    expect(ranks.get('f')).toBe(5);
    expect(ranks.get('h')).toBe(5);
  });

  it('returns empty when no matches', () => {
    expect(computeFinalRanks([]).size).toBe(0);
  });
});
