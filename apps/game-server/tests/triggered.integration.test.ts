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

    // Flip trap face-up (simula que el user respondió YES al TRAP_RESPONSE_PROMPT).
    trap.faceDown = false;
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

    // Flip trap face-up (simula activación user-driven via TRAP_RESPONSE_PROMPT).
    trap.faceDown = false;
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

/**
 * fieldTrigger (Sky Mavis Field — spl_004): mientras esté en zona, cada Axie summoneado
 * por el OWNER recibe +300 ATK. Filtro por ownership: el oponente no recibe el bonus.
 */
describe('fieldTrigger (Sky Mavis Field — spl_004)', () => {
  it('aplica +300 ATK al monster summoneado por el owner', () => {
    const state = new DuelStateSchema();
    const engine = new GameEngine(state, log, 'field_test');
    engine.setupPlayer({
      id: 'p1', username: 'A',
      mainDeckCardIds: Array(40).fill('mon_beast_001'),
      isFirstPlayer: true,
    });
    engine.setupPlayer({
      id: 'p2', username: 'B',
      mainDeckCardIds: Array(40).fill('mon_aqua_001'),
      isFirstPlayer: false,
    });
    engine.startMatch();

    // Activar Sky Mavis Field para p1 manualmente (como si la activara).
    giveHand(state, 'p1', 'spl_004', 'p1_field');
    // Avanzar p1 a MAIN_1 para poder activar.
    engine.handleEndPhase('p1'); // STANDBY
    engine.handleEndPhase('p1'); // MAIN_1
    engine.handleActivateEffect('p1', { cardInstanceId: 'p1_field', targets: [] });

    // Verificar trigger registrado.
    expect(engine.triggers.countFor('p1_field')).toBe(1);

    // Summonear Buba (mon_beast_001) — atk base 1700.
    giveHand(state, 'p1', 'mon_beast_001', 'p1_buba');
    engine.handleNormalSummon('p1', { cardInstanceId: 'p1_buba', tributes: [], position: 'ATK' });

    const p1 = state.players.get('p1')!;
    const buba = p1.monsterZones.find((c) => c.instanceId === 'p1_buba')!;
    expect(buba.atkMod).toBe(300); // Sky Mavis Field aplicó +300 directamente al schema.
  });

  it('NO aplica al oponente del owner', () => {
    const state = new DuelStateSchema();
    const engine = new GameEngine(state, log, 'field_test_2');
    engine.setupPlayer({
      id: 'p1', username: 'A',
      mainDeckCardIds: Array(40).fill('mon_beast_001'),
      isFirstPlayer: true,
    });
    engine.setupPlayer({
      id: 'p2', username: 'B',
      mainDeckCardIds: Array(40).fill('mon_aqua_001'),
      isFirstPlayer: false,
    });
    engine.startMatch();

    // p1 activa Sky Mavis Field.
    giveHand(state, 'p1', 'spl_004', 'p1_field');
    engine.handleEndPhase('p1'); // STANDBY
    engine.handleEndPhase('p1'); // MAIN_1
    engine.handleActivateEffect('p1', { cardInstanceId: 'p1_field', targets: [] });

    // Avanzar al turno de p2 (advance hasta que activePlayerId cambie + estemos en MAIN_1).
    while (state.activePlayerId === 'p1') engine.handleEndPhase('p1');
    while (state.phase !== 'MAIN_1') engine.handleEndPhase('p2');

    giveHand(state, 'p2', 'mon_chim_002', 'p2_chim');
    engine.handleNormalSummon('p2', { cardInstanceId: 'p2_chim', tributes: [], position: 'ATK' });

    const p2 = state.players.get('p2')!;
    const chim = p2.monsterZones.find((c) => c.instanceId === 'p2_chim')!;
    expect(chim.atkMod).toBe(0); // Sky Mavis Field NO afectó al oponente.
  });

  it('recomputeAuraSnapshots marca affectedByAura=true después del trigger', () => {
    const state = new DuelStateSchema();
    const engine = new GameEngine(state, log, 'field_test_3');
    engine.setupPlayer({
      id: 'p1', username: 'A',
      mainDeckCardIds: Array(40).fill('mon_beast_001'),
      isFirstPlayer: true,
    });
    engine.setupPlayer({
      id: 'p2', username: 'B',
      mainDeckCardIds: Array(40).fill('mon_aqua_001'),
      isFirstPlayer: false,
    });
    engine.startMatch();

    giveHand(state, 'p1', 'spl_004', 'p1_field');
    engine.handleEndPhase('p1'); // STANDBY
    engine.handleEndPhase('p1'); // MAIN_1
    engine.handleActivateEffect('p1', { cardInstanceId: 'p1_field', targets: [] });

    giveHand(state, 'p1', 'mon_beast_001', 'p1_buba');
    engine.handleNormalSummon('p1', { cardInstanceId: 'p1_buba', tributes: [], position: 'ATK' });

    const buba = state.players.get('p1')!.monsterZones.find((c) => c.instanceId === 'p1_buba')!;
    // handleNormalSummon ya invoca recomputeAuraSnapshots al final.
    // Buba tiene atkMod=300 (de Sky Mavis Field) → affectedByAura debe ser true.
    expect(buba.affectedByAura).toBe(true);
  });
});

/**
 * Continuous aura visibility: Tide Surge (continuousAura) NO mutates atkMod, pero el cliente
 * debe poder ver el bonus vía auraAtkBonus / auraDefBonus después de recomputeAuraSnapshots.
 */
describe('continuousAura snapshot (Tide Surge — spl_003)', () => {
  it('expone auraAtkBonus=+400 y auraDefBonus=+200 a Aqua propios después de activación', () => {
    const state = new DuelStateSchema();
    const engine = new GameEngine(state, log, 'aura_snap_test');
    engine.setupPlayer({
      id: 'p1', username: 'A',
      mainDeckCardIds: Array(40).fill('mon_aqua_001'),
      isFirstPlayer: true,
    });
    engine.setupPlayer({
      id: 'p2', username: 'B',
      mainDeckCardIds: Array(40).fill('mon_beast_001'),
      isFirstPlayer: false,
    });
    engine.startMatch();

    // Place Aqua manualmente + give Tide Surge.
    placeMonster(state, 'p1', 'p1_aqua', 'mon_aqua_001');
    giveHand(state, 'p1', 'spl_003', 'p1_tide');
    engine.handleEndPhase('p1'); // STANDBY
    engine.handleEndPhase('p1'); // MAIN_1
    engine.handleActivateEffect('p1', { cardInstanceId: 'p1_tide', targets: [] });

    const aqua = state.players.get('p1')!.monsterZones.find((c) => c.instanceId === 'p1_aqua')!;
    // handleActivateEffect ya invoca recomputeAuraSnapshots.
    expect(aqua.auraAtkBonus).toBe(400);
    expect(aqua.auraDefBonus).toBe(200);
    expect(aqua.affectedByAura).toBe(true);
  });
});

/**
 * burn (Lethal Strike — trp_005): cuando el atacante destruye al defender por combate,
 * el dueño puede activar la trampa. El effect handler `burn` ya existe en effectHandlers,
 * solo necesita ser invocado via handleActivateEffect tras la destrucción.
 *
 * Aquí probamos directamente el handler — el flujo de prompt (askPlayerTrapResponse) está
 * en PvERoom y se prueba manualmente. Estos tests garantizan que activar la trampa
 * post-destrucción aplica el daño correctamente.
 */
describe('burn (Lethal Strike — trp_005)', () => {
  it('aplica 1000 damage al oponente cuando se activa', () => {
    const state = new DuelStateSchema();
    const engine = new GameEngine(state, log, 'burn_test');
    engine.setupPlayer({
      id: 'p1', username: 'A',
      mainDeckCardIds: Array(40).fill('mon_beast_001'),
      isFirstPlayer: true,
    });
    engine.setupPlayer({
      id: 'p2', username: 'B',
      mainDeckCardIds: Array(40).fill('mon_aqua_001'),
      isFirstPlayer: false,
    });
    engine.startMatch();

    // SET Lethal Strike face-down en zona de p1.
    giveHand(state, 'p1', 'trp_005', 'p1_lethal');
    engine.handleEndPhase('p1'); // STANDBY
    engine.handleEndPhase('p1'); // MAIN_1
    engine.handleSetCard('p1', 'p1_lethal');

    const p1 = state.players.get('p1')!;
    const p2 = state.players.get('p2')!;
    const lethal = p1.spellTrapZones.find((c) => c.instanceId === 'p1_lethal')!;
    expect(lethal.faceDown).toBe(true);
    const initialP2LP = p2.lifePoints;

    // Activar la trampa (simulando que post-combate el user respondió al prompt).
    engine.handleActivateEffect('p1', { cardInstanceId: 'p1_lethal', targets: [] });

    expect(p2.lifePoints).toBe(initialP2LP - 1000);
    // La trampa después de activar debe ir al graveyard (one-shot).
    const lethalAfter = p1.spellTrapZones.find((c) => c.instanceId === 'p1_lethal');
    expect(lethalAfter).toBeUndefined();
    expect(p1.graveyard.some((c) => c.cardId === 'trp_005')).toBe(true);
  });
});

/**
 * Defensive faceDown preservation: monsters en DEF_FACEDOWN que sobreviven un ataque
 * MANTIENEN faceDown=true. Override del YGO clásico — la información sigue oculta.
 */
describe('CombatSystem — face-down DEF preservation', () => {
  it('DEF_FACEDOWN survivor mantiene faceDown=true tras sobrevivir un ataque', () => {
    const state = new DuelStateSchema();
    const engine = new GameEngine(state, log, 'fdef_test');
    engine.setupPlayer({
      id: 'p1', username: 'A',
      mainDeckCardIds: Array(40).fill('mon_plant_001'),
      isFirstPlayer: true,
    });
    engine.setupPlayer({
      id: 'p2', username: 'B',
      mainDeckCardIds: Array(40).fill('mon_chim_001'),
      isFirstPlayer: false,
    });
    engine.startMatch();

    // p1: Olek Plant L4 (atk 1100, DEF 1700) en DEF_FACEDOWN.
    placeMonster(state, 'p1', 'p1_olek', 'mon_plant_001', 'DEF');
    const olek = state.players.get('p1')!.monsterZones.find((c) => c.instanceId === 'p1_olek')!;
    olek.position = 'DEF_FACEDOWN';
    olek.faceDown = true;

    // p2: Lesser Chimera Plant L1 (atk 500) — atacará a Olek.
    placeMonster(state, 'p2', 'p2_chim', 'mon_chim_001');

    // Avanzar a turno de p2 BATTLE.
    while (state.activePlayerId === 'p1') engine.handleEndPhase('p1');
    while (state.phase !== 'BATTLE') engine.handleEndPhase('p2');

    // p2 ataca: 500 ATK vs 1700 DEF → defender sobrevive, attacker recibe daño.
    engine.handleDeclareAttack('p2', { attackerInstanceId: 'p2_chim', targetInstanceId: 'p1_olek' });

    const olekAfter = state.players.get('p1')!.monsterZones.find((c) => c.instanceId === 'p1_olek')!;
    expect(olekAfter.faceDown).toBe(true); // PERMANECE face-down post-attack
    expect(olekAfter.position).toBe('DEF_FACEDOWN');
  });
});
