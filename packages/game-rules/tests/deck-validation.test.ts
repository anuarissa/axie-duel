import { describe, expect, it } from 'vitest';
import { validateDeck, type DeckEntry } from '../src/deck-validation.js';

function entries(...rows: Array<[string, 'Main' | 'Extra' | 'Side', number]>): DeckEntry[] {
  return rows.map(([cardId, zone, quantity]) => ({ cardId, zone, quantity }));
}

describe('validateDeck', () => {
  it('accepts a valid 40-card main deck with no extra/side', () => {
    const deck = entries(
      ['mon_001', 'Main', 3],
      ['mon_002', 'Main', 3],
      ['mon_003', 'Main', 3],
      ['mon_004', 'Main', 3],
      ['mon_005', 'Main', 3],
      ['mon_006', 'Main', 3],
      ['mon_007', 'Main', 3],
      ['mon_008', 'Main', 3],
      ['mon_009', 'Main', 3],
      ['mon_010', 'Main', 3],
      ['mon_011', 'Main', 3],
      ['mon_012', 'Main', 3],
      ['mon_013', 'Main', 3],
      ['mon_014', 'Main', 1], // total = 13*3 + 1 = 40
    );
    const r = validateDeck(deck);
    expect(r.valid).toBe(true);
    expect(r.mainCount).toBe(40);
  });

  it('rejects main deck below 40', () => {
    const deck = entries(['mon_001', 'Main', 39]);
    // ojo: 39 copias de la misma carta también rompen MAX_COPIES, pero validamos error de tamaño.
    const r = validateDeck(deck);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('Main deck'))).toBe(true);
  });

  it('rejects main deck above 60', () => {
    const deck: DeckEntry[] = [];
    for (let i = 0; i < 21; i++) {
      deck.push({ cardId: `mon_${i}`, zone: 'Main', quantity: 3 });
    } // 63 cards
    const r = validateDeck(deck);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('Main deck'))).toBe(true);
  });

  it('rejects extra deck above 15', () => {
    const deck: DeckEntry[] = [];
    for (let i = 0; i < 14; i++) {
      deck.push({ cardId: `mon_${i}`, zone: 'Main', quantity: 3 });
    }
    deck.push({ cardId: 'extra_001', zone: 'Extra', quantity: 16 }); // overshoot + dup
    const r = validateDeck(deck);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('Extra deck'))).toBe(true);
  });

  it('rejects more than 3 copies of the same card across zones', () => {
    const deck = entries(
      ['ace_card', 'Main', 3],
      ['ace_card', 'Side', 1], // total = 4
      ...Array.from({ length: 13 }, (_, i): [string, 'Main' | 'Extra' | 'Side', number] => [
        `filler_${i}`,
        'Main',
        3,
      ]), // +39 = 42 main, valid count
    );
    const r = validateDeck(deck);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('ace_card'))).toBe(true);
  });

  it('accepts exactly 3 copies of the same card', () => {
    const deck = entries(
      ['ace_card', 'Main', 3],
      ...Array.from({ length: 13 }, (_, i): [string, 'Main' | 'Extra' | 'Side', number] => [
        `filler_${i}`,
        'Main',
        3,
      ]),
    ); // 3 + 39 = 42 main
    const r = validateDeck(deck);
    expect(r.valid).toBe(true);
    expect(r.mainCount).toBe(42);
  });

  it('rejects side deck above 15', () => {
    const deck: DeckEntry[] = [];
    for (let i = 0; i < 14; i++) {
      deck.push({ cardId: `mon_${i}`, zone: 'Main', quantity: 3 });
    }
    for (let i = 0; i < 6; i++) {
      deck.push({ cardId: `side_${i}`, zone: 'Side', quantity: 3 });
    } // 18 side
    const r = validateDeck(deck);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('Side deck'))).toBe(true);
  });
});
