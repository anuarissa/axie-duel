/**
 * Integration test del flujo triggered effects:
 * - SET de una Trap (negateAttack o atkDebuff).
 * - Oponente declara ataque.
 * - Trap se dispara automáticamente, modifica el outcome del attack.
 * - Trap va a graveyard, handler desregistrado.
 */

import { describe, expect, it } from 'vitest';
import pino from 'pino';
import { DuelStateSchema } from '../src/rooms/schema/DuelStateSchema.js';
import { GameEngine } from '../src/engine/GameEngine.js';
import { CardSchema } from '../src/rooms/schema/CardSchema.js';
import { registerTriggersForCard } from '../src/cards/triggered/registry.js';

const log = pino({ level: 'silent' });

function setupGameAtBattle(): { state: DuelStateSchema; engine: GameEngine } {
  const state = new DuelStateSchema();
  state.matchId = 'trig_test';
  state.mode = 'PvP_Casual';
  const engine = new GameEngine(state, log, 'trig_seed');
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
  // Avanzar hasta turno 2 (BATTLE de p2) para que pueda atacar.
  for (let i = 0; i < 6; i++) engine.handleEndPhase('p1'); // p1 termina turno 1
  // Ahora es turno de p2, advance hasta BATTLE.
  engine.handleEndPhase('p2'); // STANDBY
  engine.handleEndPhase('p2'); // MAIN_1
  engine.handleEndPhase('p2'); // BATTLE
  return { state, engine };
}

/** Helper: pone manualmente un monster en zona del jugador sin pasar por handleNormalSummon. */
function placeMonster(state: DuelStateSchema, playerId: string, instanceId: string, cardId: string, position: 'ATK' | 'DEF' = 'ATK') {
  const player = state.players.get(playerId);
  if (!player) throw new Error('player not found');
  const slot = player.monsterZones.findIndex((z) => !z.instanceId);
  if (slot === -1) throw new Error('no free zone');
  const c = new CardSchema();
  c.instanceId = instanceId;
  c.cardId = cardId;
  c.ownerId = playerId;
  c.position = position;
  c.faceDown = false;
  player.monsterZones[slot] = c;
}

/** Helper: pone una carta en la mano del jugador. */
function giveHand(state: DuelStateSchema, playerId: string, cardId: string, instanceId: string) {
  const player = state.players.get(playerId);
  if (!player) throw new Error('player not found');
  const c = new CardSchema();
  c.instanceId = instanceId;
  c.cardId = cardId;
  c.ownerId = playerId;
  player.hand.push(c);
  player.handSize = player.hand.length;
}

describe('Triggered effects integration', () => {
  it('handleSetCard moves trap to spell/trap zone face-down + registers trigger', () => {
    const state = new DuelStateSchema();
    const engine = new GameEngine(state, log, 'set_test');
    engine.setupPlayer({
      id: 'p1',
      username: 'A',
      mainDeckCardIds: Array(40).fill('mon_beast_001'),
      isFirstPlayer: true,
    });
    engine.setupPlayer({
      id: 'p2',
      username: 'B',
      mainDeckCardIds: Array(40).fill('mon_aqua_001'),
      isFirstPlayer: false,
    });
    engine.startMatch();
    // Avanzar a MAIN_1 de p1.
    engine.handleEndPhase('p1'); // STANDBY
    engine.handleEndPhase('p1'); // MAIN_1

    giveHand(state, 'p1', 'trp_002', 'trap_set_1'); // Mirror Web (negateAttack)
    engine.handleSetCard('p1', 'trap_set_1');

    const p1 = state.players.get('p1')!;
    const inZone = p1.spellTrapZones.find((c) => c.instanceId === 'trap_set_1');
    expect(inZone).toBeDefined();
    expect(inZone?.faceDown).toBe(true);
    expect(engine.triggers.countFor('trap_set_1')).toBe(1);
  });

  it('negateAttack (Mirror Web) cancels opponent attack + auto-graveyards', () => {
    const { state, engine } = setupGameAtBattle();
    // p1 setea Mirror Web durante su turno 1 — no podemos retroactivar, así que
    // simulamos: damos directamente la trap en zone con trigger registrado.
    giveHand(state, 'p1', 'trp_002', 'mirror_web');
    // Para SET necesitaríamos que p1 esté en MAIN_1. Pero estamos en BATTLE de p2.
    // Hack para test: ponemos directo en zona + registramos trigger manualmente
    // via la API pública.
    const p1 = state.players.get('p1')!;
    const trap = p1.hand.find((c) => c.instanceId === 'mirror_web')!;
    p1.hand = p1.hand.filter((c) => c.instanceId !== 'mirror_web') as never;
    p1.handSize = p1.hand.length;
    trap.faceDown = true;
    p1.spellTrapZones[0] = trap;

    // Registrar trigger manualmente (lo que haría handleSetCard).
    const def = engine.cards.getById('trp_002')!;
    void engine; // ensure
    registerTriggersForCard(def, {
      state,
      source: trap,
      ownerId: 'p1',
      registry: engine.triggers,
      log,
    });
    expect(engine.triggers.countFor('mirror_web')).toBe(1);

    // p2 ataca directo (no hay monsters en p1). Sin trap, daño=ATK del atacante.
    placeMonster(state, 'p2', 'p2_atk', 'mon_aqua_001');
    const p1LpBefore = state.players.get('p1')!.lifePoints;

    engine.handleDeclareAttack('p2', { attackerInstanceId: 'p2_atk', targetInstanceId: 'DIRECT' });

    // Trap debe haberse disparado: p1 LP no cambia.
    expect(state.players.get('p1')!.lifePoints).toBe(p1LpBefore);
    // Trap movida a graveyard.
    expect(p1.graveyard.some((c) => c.instanceId === 'mirror_web')).toBe(true);
    // Trigger desregistrado.
    expect(engine.triggers.countFor('mirror_web')).toBe(0);
  });

  it('atkDebuff (Poison Backlash) reduces attacker ATK by 800 + auto-graveyards', () => {
    const { state, engine } = setupGameAtBattle();
    const p1 = state.players.get('p1')!;
    giveHand(state, 'p1', 'trp_001', 'poison_backlash');
    const trap = p1.hand.find((c) => c.instanceId === 'poison_backlash')!;
    p1.hand = p1.hand.filter((c) => c.instanceId !== 'poison_backlash') as never;
    p1.handSize = p1.hand.length;
    trap.faceDown = true;
    p1.spellTrapZones[0] = trap;
    const def = engine.cards.getById('trp_001')!;
    registerTriggersForCard(def, {
      state,
      source: trap,
      ownerId: 'p1',
      registry: engine.triggers,
      log,
    });

    // p2 ataca directo con Aqua (atk=2100). Sin trap: p1 perdería 2100 LP.
    // Con Poison Backlash: -800 ATK → daño = 2100 - 800 = 1300 LP.
    placeMonster(state, 'p2', 'p2_atk', 'mon_aqua_001'); // mon_aqua_001 atk=2100
    const p1LpBefore = state.players.get('p1')!.lifePoints;

    engine.handleDeclareAttack('p2', { attackerInstanceId: 'p2_atk', targetInstanceId: 'DIRECT' });

    expect(state.players.get('p1')!.lifePoints).toBe(p1LpBefore - 1300);
    expect(p1.graveyard.some((c) => c.instanceId === 'poison_backlash')).toBe(true);
    expect(engine.triggers.countFor('poison_backlash')).toBe(0);
  });

  it('triggers do NOT fire when own player attacks (only opponent ataques)', () => {
    const { state, engine } = setupGameAtBattle();
    const p2 = state.players.get('p2')!;
    giveHand(state, 'p2', 'trp_002', 'p2_mirror');
    const trap = p2.hand.find((c) => c.instanceId === 'p2_mirror')!;
    p2.hand = p2.hand.filter((c) => c.instanceId !== 'p2_mirror') as never;
    p2.handSize = p2.hand.length;
    trap.faceDown = true;
    p2.spellTrapZones[0] = trap;
    const def = engine.cards.getById('trp_002')!;
    registerTriggersForCard(def, {
      state,
      source: trap,
      ownerId: 'p2',
      registry: engine.triggers,
      log,
    });

    // p2 ataca a sí mismo no tiene sentido — pero verifico que SU propia trap
    // no se dispare contra SU propio ataque.
    placeMonster(state, 'p2', 'p2_atk', 'mon_aqua_001');
    engine.handleDeclareAttack('p2', { attackerInstanceId: 'p2_atk', targetInstanceId: 'DIRECT' });

    // Trap NO se disparó: sigue en spell/trap zone.
    expect(p2.spellTrapZones.some((c) => c.instanceId === 'p2_mirror')).toBe(true);
    expect(engine.triggers.countFor('p2_mirror')).toBe(1);
  });
});
