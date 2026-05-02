import { describe, expect, it } from 'vitest';
import { resolveCombat } from '../src/damage-calc.js';
import type { CardInstance } from '@axie-duel/shared-types';

function makeInstance(
  instanceId: string,
  ownerId: string,
  position: 'ATK' | 'DEF' | 'DEF_FACEDOWN',
): CardInstance {
  return {
    instanceId,
    cardId: 'test',
    ownerId,
    position,
    faceDown: position === 'DEF_FACEDOWN',
    atkMod: 0,
    defMod: 0,
    counters: {},
    hasAttacked: false,
    positionChangedThisTurn: false,
  };
}

describe('resolveCombat', () => {
  describe('ATK vs ATK', () => {
    it('attacker stronger: defender destroyed, defender player loses ATK diff', () => {
      const atk = makeInstance('a1', 'p1', 'ATK');
      const def = makeInstance('d1', 'p2', 'ATK');
      const r = resolveCombat(atk, { atk: 2000, def: 0 }, 'p1', def, { atk: 1500, def: 0 }, 'p2');
      expect(r.destroyed).toEqual(['d1']);
      expect(r.damage).toEqual({ p2: 500 });
      expect(r.direct).toBe(false);
    });

    it('defender stronger: attacker destroyed, attacker player takes diff', () => {
      const atk = makeInstance('a1', 'p1', 'ATK');
      const def = makeInstance('d1', 'p2', 'ATK');
      const r = resolveCombat(atk, { atk: 1500, def: 0 }, 'p1', def, { atk: 2000, def: 0 }, 'p2');
      expect(r.destroyed).toEqual(['a1']);
      expect(r.damage).toEqual({ p1: 500 });
    });

    it('tie: both destroyed, no damage', () => {
      const atk = makeInstance('a1', 'p1', 'ATK');
      const def = makeInstance('d1', 'p2', 'ATK');
      const r = resolveCombat(atk, { atk: 1500, def: 0 }, 'p1', def, { atk: 1500, def: 0 }, 'p2');
      expect(r.destroyed.sort()).toEqual(['a1', 'd1']);
      expect(r.damage).toEqual({});
    });
  });

  describe('ATK vs DEF (face-up)', () => {
    it('ATK > DEF: defender destroyed, no damage', () => {
      const atk = makeInstance('a1', 'p1', 'ATK');
      const def = makeInstance('d1', 'p2', 'DEF');
      const r = resolveCombat(atk, { atk: 2000, def: 0 }, 'p1', def, { atk: 1000, def: 1500 }, 'p2');
      expect(r.destroyed).toEqual(['d1']);
      expect(r.damage).toEqual({});
    });

    it('ATK < DEF: attacker takes diff, no destruction', () => {
      const atk = makeInstance('a1', 'p1', 'ATK');
      const def = makeInstance('d1', 'p2', 'DEF');
      const r = resolveCombat(atk, { atk: 1500, def: 0 }, 'p1', def, { atk: 1000, def: 2000 }, 'p2');
      expect(r.destroyed).toEqual([]);
      expect(r.damage).toEqual({ p1: 500 });
    });

    it('ATK == DEF: nothing happens', () => {
      const atk = makeInstance('a1', 'p1', 'ATK');
      const def = makeInstance('d1', 'p2', 'DEF');
      const r = resolveCombat(atk, { atk: 1500, def: 0 }, 'p1', def, { atk: 1000, def: 1500 }, 'p2');
      expect(r.destroyed).toEqual([]);
      expect(r.damage).toEqual({});
    });
  });

  describe('ATK vs DEF (face-down)', () => {
    it('treats face-down DEF same as face-up DEF after flip', () => {
      const atk = makeInstance('a1', 'p1', 'ATK');
      const def = makeInstance('d1', 'p2', 'DEF_FACEDOWN');
      const r = resolveCombat(atk, { atk: 2000, def: 0 }, 'p1', def, { atk: 0, def: 1500 }, 'p2');
      expect(r.destroyed).toEqual(['d1']);
      expect(r.damage).toEqual({});
    });
  });

  describe('Direct attack', () => {
    it('no defender: full ATK as direct damage', () => {
      const atk = makeInstance('a1', 'p1', 'ATK');
      const r = resolveCombat(atk, { atk: 1800, def: 0 }, 'p1', null, null, 'p2');
      expect(r.destroyed).toEqual([]);
      expect(r.damage).toEqual({ p2: 1800 });
      expect(r.direct).toBe(true);
    });
  });
});
