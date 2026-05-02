import { describe, expect, it } from 'vitest';
import { calculateElo, DEFAULT_K_FACTOR } from '../src/elo.js';

describe('calculateElo', () => {
  it('equal-rated players: winner +16, loser -16 (K=32)', () => {
    const r = calculateElo(1500, 1500, 'P1_WIN');
    expect(r.player1Delta).toBe(16);
    expect(r.player2Delta).toBe(-16);
    expect(r.player1NewElo).toBe(1516);
    expect(r.player2NewElo).toBe(1484);
  });

  it('underdog wins: bigger swing (low gana a high → +29 / -29 aprox)', () => {
    const r = calculateElo(1200, 1600, 'P1_WIN');
    // expected1 = 1 / (1 + 10^(400/400)) = 1 / 11 ≈ 0.091
    // delta1 = 32 * (1 - 0.091) ≈ 29.1
    expect(r.player1Delta).toBeGreaterThan(28);
    expect(r.player1Delta).toBeLessThan(30);
    expect(r.player2Delta).toBe(-r.player1Delta);
  });

  it('favorite wins: small swing', () => {
    const r = calculateElo(1600, 1200, 'P1_WIN');
    // expected1 ≈ 0.909, delta1 = 32 * 0.091 ≈ 2.9
    expect(r.player1Delta).toBeLessThan(4);
    expect(r.player1Delta).toBeGreaterThan(2);
  });

  it('draw: small player gets points, big player loses', () => {
    const r = calculateElo(1200, 1600, 'DRAW');
    // expected1 ≈ 0.091, actual1 = 0.5 → delta1 = 32 * 0.409 ≈ 13
    expect(r.player1Delta).toBeGreaterThan(12);
    expect(r.player2Delta).toBeLessThan(-12);
  });

  it('K-factor argument overrides default', () => {
    const k32 = calculateElo(1500, 1500, 'P1_WIN', 32);
    const k16 = calculateElo(1500, 1500, 'P1_WIN', 16);
    expect(k16.player1Delta).toBe(k32.player1Delta / 2);
  });

  it('zero floor: ELO never goes negative', () => {
    const r = calculateElo(10, 2000, 'P2_WIN', 100);
    expect(r.player1NewElo).toBeGreaterThanOrEqual(0);
  });

  it('default K is 32', () => {
    expect(DEFAULT_K_FACTOR).toBe(32);
  });
});
