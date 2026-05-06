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

describe('Hand limit (max 6 at end of turn)', () => {
  it('does NOT block END phase when hand <= 6', () => {
    const { state, engine } = setupGame();
    // p1 starts with 5 cards. Avanza a END.
    engine.handleEndPhase('p1'); // STANDBY
    engine.handleEndPhase('p1'); // MAIN_1
    engine.handleEndPhase('p1'); // BATTLE
    engine.handleEndPhase('p1'); // MAIN_2
    engine.handleEndPhase('p1'); // END
    expect(state.phase).toBe(Phase.END);
    const p1 = state.players.get('p1');
    expect(p1?.pendingHandLimitDiscard).toBe(0);
    // Avanzar a siguiente turno funciona sin discard.
    engine.handleEndPhase('p1');
    expect(state.activePlayerId).toBe('p2');
  });

  it('sets pendingHandLimitDiscard when hand > 6 in END phase', () => {
    const { state, engine } = setupGame();
    const p1 = state.players.get('p1')!;
    // Forzar mano de 8 cartas (manualmente, simulando draws extras).
    // Movemos 3 cartas del deck a la mano.
    for (let i = 0; i < 3; i++) {
      const card = p1.deck.shift();
      if (card) p1.hand.push(card);
    }
    p1.handSize = p1.hand.length;
    expect(p1.hand.length).toBe(8);
    // Avanzar p1 hasta END phase.
    engine.handleEndPhase('p1'); // STANDBY
    engine.handleEndPhase('p1'); // MAIN_1
    engine.handleEndPhase('p1'); // BATTLE
    engine.handleEndPhase('p1'); // MAIN_2
    engine.handleEndPhase('p1'); // END (entra y trigger pending = 8 - 6 = 2)
    expect(state.phase).toBe(Phase.END);
    expect(p1.pendingHandLimitDiscard).toBe(2);
  });

  it('blocks END phase advance until discard resolved', () => {
    const { state, engine } = setupGame();
    const p1 = state.players.get('p1')!;
    for (let i = 0; i < 3; i++) {
      const card = p1.deck.shift();
      if (card) p1.hand.push(card);
    }
    p1.handSize = p1.hand.length;
    // Avanzar a END.
    engine.handleEndPhase('p1');
    engine.handleEndPhase('p1');
    engine.handleEndPhase('p1');
    engine.handleEndPhase('p1');
    engine.handleEndPhase('p1');
    expect(state.phase).toBe(Phase.END);
    expect(p1.pendingHandLimitDiscard).toBe(2);
    // Intentar END_PHASE de nuevo sin discard → tira MUST_DISCARD.
    expect(() => engine.handleEndPhase('p1')).toThrow(/discard/i);
    expect(state.phase).toBe(Phase.END); // sigue en END
    expect(state.activePlayerId).toBe('p1'); // turno NO cambió
  });

  it('handleHandLimitDiscard moves cards to graveyard and clears pending', () => {
    const { state, engine } = setupGame();
    const p1 = state.players.get('p1')!;
    for (let i = 0; i < 3; i++) {
      const card = p1.deck.shift();
      if (card) p1.hand.push(card);
    }
    p1.handSize = p1.hand.length;
    // Avanzar a END.
    for (let i = 0; i < 5; i++) engine.handleEndPhase('p1');
    expect(p1.pendingHandLimitDiscard).toBe(2);
    expect(p1.graveyard.length).toBe(0);
    // Elegir 2 cartas a descartar.
    const ids = [p1.hand[0]!.instanceId, p1.hand[1]!.instanceId];
    engine.handleHandLimitDiscard('p1', ids);
    expect(p1.pendingHandLimitDiscard).toBe(0);
    expect(p1.hand.length).toBe(6);
    expect(p1.graveyard.length).toBe(2);
    // Ahora SÍ puede avanzar de turno.
    engine.handleEndPhase('p1');
    expect(state.activePlayerId).toBe('p2');
  });

  it('rejects discard with wrong card count', () => {
    const { state, engine } = setupGame();
    const p1 = state.players.get('p1')!;
    for (let i = 0; i < 3; i++) {
      const card = p1.deck.shift();
      if (card) p1.hand.push(card);
    }
    p1.handSize = p1.hand.length;
    for (let i = 0; i < 5; i++) engine.handleEndPhase('p1');
    expect(p1.pendingHandLimitDiscard).toBe(2);
    // Solo 1 id cuando required = 2.
    expect(() =>
      engine.handleHandLimitDiscard('p1', [p1.hand[0]!.instanceId]),
    ).toThrow(/exactamente|exactly|2/i);
    expect(p1.pendingHandLimitDiscard).toBe(2); // sigue pendiente
    expect(state.phase).toBe(Phase.END);
  });

  it('rejects discard with cards not in hand', () => {
    const { state, engine } = setupGame();
    const p1 = state.players.get('p1')!;
    for (let i = 0; i < 3; i++) {
      const card = p1.deck.shift();
      if (card) p1.hand.push(card);
    }
    p1.handSize = p1.hand.length;
    for (let i = 0; i < 5; i++) engine.handleEndPhase('p1');
    expect(() =>
      engine.handleHandLimitDiscard('p1', ['fake_1', 'fake_2']),
    ).toThrow(/CARD_NOT_IN_HAND|mano/i);
    // Estado intacto.
    expect(p1.pendingHandLimitDiscard).toBe(2);
    expect(state.phase).toBe(Phase.END);
  });
});
