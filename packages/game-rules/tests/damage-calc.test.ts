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

  describe('Class advantage (+15% ATK)', () => {
    it('Plant attacking Bird: +15% damage, defender destroyed even when ATK == ATK base', () => {
      const atk = makeInstance('a1', 'p1', 'ATK');
      const def = makeInstance('d1', 'p2', 'ATK');
      // Plant (Group A) > Bird (Group B): floor(1700 * 1.15) = 1954 (IEEE 754: 1.15 is 1.1499999...)
      const r = resolveCombat(
        atk, { atk: 1700, def: 0 }, 'p1',
        def, { atk: 1700, def: 0 }, 'p2',
        { attackerClass: 'Plant', defenderClass: 'Bird' },
      );
      expect(r.destroyed).toEqual(['d1']);
      expect(r.damage).toEqual({ p2: 254 }); // 1954 - 1700
      expect(r.direct).toBe(false);
      expect(r.advantageBonus).toBe(15);
      expect(r.matchup).toBe('advantage');
      expect(r.effectiveAtk).toBe(1954);
    });

    it('Bird attacking Plant: -15% disadvantage, attacker dies', () => {
      const atk = makeInstance('a1', 'p1', 'ATK');
      const def = makeInstance('d1', 'p2', 'ATK');
      // Bird (Group B) is beaten by Plant (Group A): floor(1700 * 0.85) = 1445
      const r = resolveCombat(
        atk, { atk: 1700, def: 0 }, 'p1',
        def, { atk: 1700, def: 0 }, 'p2',
        { attackerClass: 'Bird', defenderClass: 'Plant' },
      );
      expect(r.destroyed).toEqual(['a1']);
      expect(r.damage).toEqual({ p1: 255 }); // 1700 - 1445
      expect(r.advantageBonus).toBe(-15);
      expect(r.matchup).toBe('disadvantage');
      expect(r.effectiveAtk).toBe(1445);
    });

    it('Beast attacking Plant: +15% advantage (Group C beats Group A)', () => {
      const atk = makeInstance('a1', 'p1', 'ATK');
      const def = makeInstance('d1', 'p2', 'ATK');
      const r = resolveCombat(
        atk, { atk: 2000, def: 0 }, 'p1',
        def, { atk: 1500, def: 0 }, 'p2',
        { attackerClass: 'Beast', defenderClass: 'Plant' },
      );
      expect(r.destroyed).toEqual(['d1']);
      // 2000 * 1.15 = 2300 → 2300 - 1500 = 800
      expect(r.damage).toEqual({ p2: 800 });
      expect(r.advantageBonus).toBe(15);
      expect(r.matchup).toBe('advantage');
      expect(r.effectiveAtk).toBe(2300);
    });

    it('Beast vs Bug: same group (C), neutral', () => {
      const atk = makeInstance('a1', 'p1', 'ATK');
      const def = makeInstance('d1', 'p2', 'ATK');
      const r = resolveCombat(
        atk, { atk: 2000, def: 0 }, 'p1',
        def, { atk: 1500, def: 0 }, 'p2',
        { attackerClass: 'Beast', defenderClass: 'Bug' },
      );
      expect(r.advantageBonus).toBe(0);
      expect(r.matchup).toBe('neutral');
      expect(r.effectiveAtk).toBe(2000);
      expect(r.damage).toEqual({ p2: 500 });
    });

    it('Dusk attacking Dawn: +15% (A beats B)', () => {
      const atk = makeInstance('a1', 'p1', 'ATK');
      const def = makeInstance('d1', 'p2', 'ATK');
      const r = resolveCombat(
        atk, { atk: 1800, def: 0 }, 'p1',
        def, { atk: 1500, def: 0 }, 'p2',
        { attackerClass: 'Dusk', defenderClass: 'Dawn' },
      );
      expect(r.advantageBonus).toBe(15);
      expect(r.matchup).toBe('advantage');
      expect(r.effectiveAtk).toBe(2070); // floor(1800*1.15)
    });

    it('Mech attacking Plant: -15% (C is beaten by... wait C beats A — should be advantage)', () => {
      // Quick sanity: Mech is in Group C, Plant in Group A → C beats A → advantage.
      const atk = makeInstance('a1', 'p1', 'ATK');
      const def = makeInstance('d1', 'p2', 'ATK');
      const r = resolveCombat(
        atk, { atk: 2000, def: 0 }, 'p1',
        def, { atk: 1500, def: 0 }, 'p2',
        { attackerClass: 'Mech', defenderClass: 'Plant' },
      );
      expect(r.matchup).toBe('advantage');
    });

    it('Mech attacking Aqua: -15% disadvantage (C beaten by B)', () => {
      // Mech (C) → Aqua (B). C is beaten by B (BEATS[B]=C), so this is disadvantage.
      const atk = makeInstance('a1', 'p1', 'ATK');
      const def = makeInstance('d1', 'p2', 'ATK');
      const r = resolveCombat(
        atk, { atk: 1500, def: 0 }, 'p1',
        def, { atk: 1500, def: 0 }, 'p2',
        { attackerClass: 'Mech', defenderClass: 'Aqua' },
      );
      expect(r.matchup).toBe('disadvantage');
      expect(r.advantageBonus).toBe(-15);
      expect(r.effectiveAtk).toBe(1275); // floor(1500*0.85)
    });

    it('No options provided: backward compatible, neutral matchup', () => {
      const atk = makeInstance('a1', 'p1', 'ATK');
      const def = makeInstance('d1', 'p2', 'ATK');
      const r = resolveCombat(
        atk, { atk: 2000, def: 0 }, 'p1',
        def, { atk: 1500, def: 0 }, 'p2',
      );
      expect(r.advantageBonus).toBe(0);
      expect(r.matchup).toBe('neutral');
      expect(r.effectiveAtk).toBe(2000);
      expect(r.damage).toEqual({ p2: 500 });
    });

    it('Direct attack with advantage: +15% LP damage', () => {
      const atk = makeInstance('a1', 'p1', 'ATK');
      const r = resolveCombat(
        atk, { atk: 2000, def: 0 }, 'p1',
        null, null, 'p2',
        { attackerClass: 'Beast', defenderClass: 'Plant' },
      );
      expect(r.damage).toEqual({ p2: 2300 });
      expect(r.direct).toBe(true);
      expect(r.advantageBonus).toBe(15);
      expect(r.matchup).toBe('advantage');
    });

    it('Direct attack with disadvantage: -15% LP damage', () => {
      const atk = makeInstance('a1', 'p1', 'ATK');
      const r = resolveCombat(
        atk, { atk: 2000, def: 0 }, 'p1',
        null, null, 'p2',
        { attackerClass: 'Bird', defenderClass: 'Plant' },
      );
      expect(r.damage).toEqual({ p2: 1700 }); // floor(2000*0.85)
      expect(r.direct).toBe(true);
      expect(r.advantageBonus).toBe(-15);
      expect(r.matchup).toBe('disadvantage');
    });
  });
});
