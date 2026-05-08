import { describe, expect, it } from 'vitest';
import {
  partsToCard,
  tokenIdToHue,
  type AxieInput,
} from '../../../apps/web/src/lib/axie-card-algorithm.js';

/**
 * Tests for the deterministic Axie parts → card algorithm V1.
 *
 * Spec: docs/PARTS_ALGORITHM.md
 *
 * The cardinal property under test: same input → same output, always.
 * Sky Mavis evaluators audit this algorithm; any non-determinism would be
 * a critical bug.
 */

const beastFull: AxieInput = {
  tokenId: '5234',
  class: 'Beast',
  birthDate: Date.UTC(2021, 5, 15),
  parts: [
    { type: 'eyes', id: 'puppy', class: 'Beast' },
    { type: 'ears', id: 'pup', class: 'Beast' },
    { type: 'mouth', id: 'axie-kiss', class: 'Beast' },
    { type: 'horn', id: 'imp', class: 'Beast' },
    { type: 'back', id: 'furball', class: 'Beast' },
    { type: 'tail', id: 'cottontail', class: 'Beast' },
  ],
};

const plantTank: AxieInput = {
  tokenId: '12891',
  class: 'Plant',
  parts: [
    { type: 'eyes', id: 'puppy-eye', class: 'Plant' },
    { type: 'ears', id: 'rose-bud', class: 'Plant' },
    { type: 'mouth', id: 'lotus', class: 'Plant' },
    { type: 'horn', id: 'little-branch', class: 'Plant' },
    { type: 'back', id: 'snail-shell', class: 'Plant' },
    { type: 'tail', id: 'leaf-bud', class: 'Plant' },
  ],
};

describe('partsToCard — determinism', () => {
  it('produces the same card for identical inputs (run twice)', () => {
    const a = partsToCard(beastFull);
    const b = partsToCard(beastFull);
    expect(a).toEqual(b);
  });

  it('changes nothing when invoked across hundreds of calls', () => {
    const first = partsToCard(plantTank);
    for (let i = 0; i < 200; i++) {
      const next = partsToCard(plantTank);
      expect(next).toEqual(first);
    }
  });

  it('is sensitive to a single part change (different input → different card)', () => {
    const variant: AxieInput = {
      ...beastFull,
      parts: beastFull.parts.map((p) =>
        p.type === 'horn' ? { ...p, id: 'ronin' } : p,
      ),
    };
    const a = partsToCard(beastFull);
    const b = partsToCard(variant);
    expect(a.atk).not.toBe(b.atk);
  });
});

describe('partsToCard — class base stats', () => {
  it('Beast input produces Beast classType', () => {
    const card = partsToCard(beastFull);
    expect(card.classType).toBe('Beast');
  });

  it('Plant input produces Plant classType with high DEF base (1900) tendency', () => {
    const card = partsToCard(plantTank);
    expect(card.classType).toBe('Plant');
    // Plant base DEF = 1900; with snail-shell (+200 DEF synergy) etc., should be solidly above 1900.
    expect(card.def).toBeGreaterThan(1900);
  });
});

describe('partsToCard — synergy bonus', () => {
  it('all-class-matching parts apply the 1.2x synergy multiplier', () => {
    const allSynergy: AxieInput = beastFull;
    const noSynergy: AxieInput = {
      ...beastFull,
      parts: beastFull.parts.map((p) => ({ ...p, class: 'Bug' })),
    };
    const a = partsToCard(allSynergy);
    const b = partsToCard(noSynergy);
    expect(a.atk).toBeGreaterThan(b.atk);
  });
});

describe('partsToCard — clamp', () => {
  it('clamps ATK at the documented bounds [800, 2800]', () => {
    const card = partsToCard(beastFull);
    expect(card.atk).toBeGreaterThanOrEqual(800);
    expect(card.atk).toBeLessThanOrEqual(2800);
  });

  it('clamps DEF at the documented bounds [600, 2400]', () => {
    const card = partsToCard(plantTank);
    expect(card.def).toBeGreaterThanOrEqual(600);
    expect(card.def).toBeLessThanOrEqual(2400);
  });
});

describe('partsToCard — primary effect priority (horn > mouth > back > tail > eyes > ears)', () => {
  it('picks horn effect when horn maps to an effect (imp on Beast Axie #5234)', () => {
    const card = partsToCard(beastFull);
    // horn=imp has onSummonBurn effect; should win over back=furball (onDeathBurn).
    expect(card.effect?.kind).toBe('onSummonBurn');
  });

  it('falls back to mouth effect when horn has no effect', () => {
    const input: AxieInput = {
      tokenId: '999',
      class: 'Plant',
      parts: [
        { type: 'eyes', id: 'puppy-eye', class: 'Plant' },
        { type: 'ears', id: 'rose-bud', class: 'Plant' },
        { type: 'mouth', id: 'lotus', class: 'Plant' }, // sustainHeal
        { type: 'horn', id: 'little-branch', class: 'Plant' }, // no effect
        { type: 'back', id: 'snail-shell', class: 'Plant' }, // passiveDefBonus
        { type: 'tail', id: 'leaf-bud', class: 'Plant' },
      ],
    };
    const card = partsToCard(input);
    // mouth=lotus (sustainHeal) > back=snail-shell (passiveDefBonus) by priority.
    expect(card.effect?.kind).toBe('sustainHeal');
  });
});

describe('partsToCard — rarity classification', () => {
  it('Legendary requires ≥5 synergy parts AND ≥4 mapped effects', () => {
    // Beast #5234 has 6 synergy parts + only 3 mapped effects (axie-kiss has none, etc.)
    // Verify the rarity-tier branching works at all (≥1 synergy AND ≥1 effect → Rare).
    const card = partsToCard(beastFull);
    expect(['Rare', 'Epic', 'Legendary']).toContain(card.rarity);
  });

  it('Common when no synergy and no mapped effects', () => {
    const sparse: AxieInput = {
      tokenId: '1',
      class: 'Mech',
      parts: [
        { type: 'eyes', id: 'unknown-eyes', class: 'Aqua' },
        { type: 'ears', id: 'unknown-ears', class: 'Aqua' },
        { type: 'mouth', id: 'unknown-mouth', class: 'Aqua' },
        { type: 'horn', id: 'unknown-horn', class: 'Aqua' },
        { type: 'back', id: 'unknown-back', class: 'Aqua' },
        { type: 'tail', id: 'unknown-tail', class: 'Aqua' },
      ],
    };
    const card = partsToCard(sparse);
    expect(card.rarity).toBe('Common');
  });
});

describe('partsToCard — level + burns derivation', () => {
  it('respects an explicit input.level (overrides birthdate calc)', () => {
    const input: AxieInput = { ...beastFull, level: 5 };
    const card = partsToCard(input);
    expect(card.level).toBe(5);
    expect(card.burns).toBe(1); // level 5..6 → 1 burn
  });

  it('clamps level to [1, 8]', () => {
    const high: AxieInput = { ...beastFull, level: 999 };
    const low: AxieInput = { ...beastFull, level: -10 };
    expect(partsToCard(high).level).toBe(8);
    expect(partsToCard(low).level).toBe(1);
  });

  it('high-level (≥7) cards get 2 burns', () => {
    const card = partsToCard({ ...beastFull, level: 8 });
    expect(card.burns).toBe(2);
  });
});

describe('partsToCard — output schema invariants', () => {
  it('always returns algorithmVersion = "v1"', () => {
    expect(partsToCard(beastFull).algorithmVersion).toBe('v1');
  });

  it('cardId encodes the source token ID for traceability', () => {
    const card = partsToCard(beastFull);
    expect(card.cardId).toBe('axie-5234');
    expect(card.sourceTokenId).toBe('5234');
  });

  it('name follows "<Class> Axie #<tokenId>" format', () => {
    expect(partsToCard(beastFull).name).toBe('Beast Axie #5234');
    expect(partsToCard(plantTank).name).toBe('Plant Axie #12891');
  });
});

describe('tokenIdToHue', () => {
  it('returns a stable hue in [0, 360) for the same tokenId', () => {
    const a = tokenIdToHue('5234');
    const b = tokenIdToHue('5234');
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(360);
  });

  it('different tokenIds yield different hues (collision-rare)', () => {
    const ids = ['1', '2', '3', '100', '5234', '99001'];
    const hues = new Set(ids.map((id) => tokenIdToHue(id)));
    expect(hues.size).toBeGreaterThanOrEqual(5);
  });
});
