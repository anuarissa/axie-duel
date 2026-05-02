import { describe, expect, it } from 'vitest';
import {
  tributesRequired,
  canActivateSpellSpeed1,
  canActivateSpellSpeed2or3,
  canDeclareAttack,
  mustDiscardAtEndPhase,
  shouldDrawInDrawPhase,
  checkWinConditions,
  nextPhase,
  canChangePosition,
} from '../src/rules.js';
import { Phase, type DuelSnapshot, type PlayerInDuel } from '@axie-duel/shared-types';

describe('tributesRequired', () => {
  it('returns 0 for levels 1-4', () => {
    [1, 2, 3, 4].forEach((l) => expect(tributesRequired(l)).toBe(0));
  });
  it('returns 1 for levels 5-6', () => {
    expect(tributesRequired(5)).toBe(1);
    expect(tributesRequired(6)).toBe(1);
  });
  it('returns 2 for levels 7-12', () => {
    [7, 8, 9, 10, 11, 12].forEach((l) => expect(tributesRequired(l)).toBe(2));
  });
  it('throws on invalid input', () => {
    expect(() => tributesRequired(0)).toThrow();
    expect(() => tributesRequired(13)).toThrow();
    expect(() => tributesRequired(2.5)).toThrow();
  });
});

describe('Spell Speed activation', () => {
  it('Speed 1: only active player in Main 1/2', () => {
    expect(canActivateSpellSpeed1(Phase.MAIN_1, true)).toBe(true);
    expect(canActivateSpellSpeed1(Phase.MAIN_2, true)).toBe(true);
    expect(canActivateSpellSpeed1(Phase.BATTLE, true)).toBe(false);
    expect(canActivateSpellSpeed1(Phase.MAIN_1, false)).toBe(false);
  });
  it('Speed 2/3: any time, any player', () => {
    expect(canActivateSpellSpeed2or3()).toBe(true);
  });
});

describe('canDeclareAttack', () => {
  it('blocks first player turn 1', () => {
    expect(canDeclareAttack(Phase.BATTLE, true, 1, false, true)).toBe(false);
  });
  it('allows non-first player turn 1', () => {
    expect(canDeclareAttack(Phase.BATTLE, true, 1, false, false)).toBe(true);
  });
  it('blocks if not active player', () => {
    expect(canDeclareAttack(Phase.BATTLE, false, 2, false, false)).toBe(false);
  });
  it('blocks outside Battle Phase', () => {
    expect(canDeclareAttack(Phase.MAIN_1, true, 2, false, false)).toBe(false);
  });
  it('blocks if attacker already attacked', () => {
    expect(canDeclareAttack(Phase.BATTLE, true, 2, true, false)).toBe(false);
  });
  it('allows in normal conditions', () => {
    expect(canDeclareAttack(Phase.BATTLE, true, 2, false, false)).toBe(true);
  });
});

describe('mustDiscardAtEndPhase', () => {
  const player = { handSize: 9 } as PlayerInDuel;
  it('returns 0 if hand <= max', () => {
    expect(mustDiscardAtEndPhase({ handSize: 7 } as PlayerInDuel, 7)).toBe(0);
    expect(mustDiscardAtEndPhase({ handSize: 5 } as PlayerInDuel, 7)).toBe(0);
  });
  it('returns overflow when above max', () => {
    expect(mustDiscardAtEndPhase(player, 7)).toBe(2);
  });
});

describe('shouldDrawInDrawPhase', () => {
  it('first player turn 1: no draw', () => {
    expect(shouldDrawInDrawPhase(1, true)).toBe(false);
  });
  it('first player turn 2+: draws', () => {
    expect(shouldDrawInDrawPhase(2, true)).toBe(true);
  });
  it('second player always draws', () => {
    expect(shouldDrawInDrawPhase(1, false)).toBe(true);
    expect(shouldDrawInDrawPhase(5, false)).toBe(true);
  });
});

describe('checkWinConditions', () => {
  function makeSnapshot(p1LP: number, p2LP: number): DuelSnapshot {
    return {
      matchId: 'm',
      status: 'IN_PROGRESS' as never,
      mode: 'PvP_Casual',
      phase: Phase.MAIN_1,
      turnNumber: 1,
      activePlayerId: 'p1',
      players: {
        p1: { id: 'p1', username: 'A', lifePoints: p1LP } as PlayerInDuel,
        p2: { id: 'p2', username: 'B', lifePoints: p2LP } as PlayerInDuel,
      },
      chain: [],
      turnDeadlineMs: 0,
    };
  }
  it('returns ended:false when both alive', () => {
    expect(checkWinConditions(makeSnapshot(8000, 8000)).ended).toBe(false);
  });
  it('detects p1 LP zero -> p2 wins', () => {
    const r = checkWinConditions(makeSnapshot(0, 5000));
    expect(r.ended).toBe(true);
    expect(r.winnerId).toBe('p2');
    expect(r.reason).toBe('LIFE_POINTS_ZERO');
  });
});

describe('nextPhase', () => {
  it('cycles through all phases', () => {
    expect(nextPhase(Phase.DRAW)).toBe(Phase.STANDBY);
    expect(nextPhase(Phase.STANDBY)).toBe(Phase.MAIN_1);
    expect(nextPhase(Phase.MAIN_1)).toBe(Phase.BATTLE);
    expect(nextPhase(Phase.BATTLE)).toBe(Phase.MAIN_2);
    expect(nextPhase(Phase.MAIN_2)).toBe(Phase.END);
    expect(nextPhase(Phase.END)).toBe(Phase.DRAW);
  });
});

describe('canChangePosition', () => {
  it('only in Main phases and not changed yet', () => {
    expect(canChangePosition(Phase.MAIN_1, false)).toBe(true);
    expect(canChangePosition(Phase.MAIN_2, false)).toBe(true);
    expect(canChangePosition(Phase.BATTLE, false)).toBe(false);
    expect(canChangePosition(Phase.MAIN_1, true)).toBe(false);
  });
});
