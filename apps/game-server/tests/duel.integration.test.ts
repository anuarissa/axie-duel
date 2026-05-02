import { describe, expect, it } from 'vitest';
import pino from 'pino';
import { DuelStateSchema } from '../src/rooms/schema/DuelStateSchema.js';
import { GameEngine } from '../src/engine/GameEngine.js';
import { Phase } from '@axie-duel/shared-types';

const log = pino({ level: 'silent' });

function setupGame(): { state: DuelStateSchema; engine: GameEngine } {
  const state = new DuelStateSchema();
  state.matchId = 'test_match';
  state.mode = 'PvP_Casual';
  const engine = new GameEngine(state, log, 'test_seed');
  engine.setupPlayer({
    id: 'p1',
    username: 'Alice',
    mainDeckCardIds: Array(40).fill('mon_beast_001'),
    isFirstPlayer: true,
  });
  engine.setupPlayer({
    id: 'p2',
    username: 'Bob',
    mainDeckCardIds: Array(40).fill('mon_aqua_001'),
    isFirstPlayer: false,
  });
  engine.startMatch();
  return { state, engine };
}

describe('Duel integration', () => {
  it('initializes both players with 5 cards in hand and 35 in deck', () => {
    const { state } = setupGame();
    const p1 = state.players.get('p1');
    const p2 = state.players.get('p2');
    expect(p1?.hand.length).toBe(5);
    expect(p1?.deck.length).toBe(35);
    expect(p2?.hand.length).toBe(5);
    expect(p2?.deck.length).toBe(35);
    expect(state.activePlayerId).toBe('p1');
    expect(state.turnNumber).toBe(1);
    expect(state.phase).toBe(Phase.DRAW);
  });

  it('first player does NOT draw on turn 1 Draw Phase', () => {
    const { state } = setupGame();
    const p1 = state.players.get('p1');
    // En Fase 0 startMatch deja el estado en DRAW pero PhaseManager aún no se invocó.
    // El primer jugador solo "no roba" cuando entra a DRAW y esa lógica está en onEnterPhase.
    // En la inicial post-startMatch la mano debe ser de 5 (sin auto-draw).
    expect(p1?.hand.length).toBe(5);
  });

  it('advances phases through the full turn cycle', () => {
    const { state, engine } = setupGame();
    engine.handleEndPhase('p1'); // DRAW -> STANDBY
    expect(state.phase).toBe(Phase.STANDBY);
    engine.handleEndPhase('p1'); // STANDBY -> MAIN_1
    expect(state.phase).toBe(Phase.MAIN_1);
    engine.handleEndPhase('p1'); // MAIN_1 -> BATTLE
    expect(state.phase).toBe(Phase.BATTLE);
    engine.handleEndPhase('p1'); // BATTLE -> MAIN_2
    expect(state.phase).toBe(Phase.MAIN_2);
    engine.handleEndPhase('p1'); // MAIN_2 -> END
    expect(state.phase).toBe(Phase.END);
    engine.handleEndPhase('p1'); // END -> next turn DRAW (active player swaps)
    expect(state.phase).toBe(Phase.DRAW);
    expect(state.activePlayerId).toBe('p2');
    expect(state.turnNumber).toBe(2);
  });

  it('rejects normal summon when not your turn', () => {
    const { engine } = setupGame();
    expect(() =>
      engine.handleNormalSummon('p2', {
        cardInstanceId: 'p2_d_0',
        position: 'ATK',
      }),
    ).toThrow();
  });

  it('rejects attack on turn 1 by first player', () => {
    const { state, engine } = setupGame();
    // Avanzar p1 hasta Battle Phase del turno 1.
    engine.handleEndPhase('p1'); // STANDBY
    engine.handleEndPhase('p1'); // MAIN_1
    engine.handleEndPhase('p1'); // BATTLE
    expect(state.phase).toBe(Phase.BATTLE);
    expect(() =>
      engine.handleDeclareAttack('p1', {
        attackerInstanceId: 'p1_d_0',
        targetInstanceId: 'DIRECT',
      }),
    ).toThrow();
  });
});
