/**
 * Integration tests del aura system:
 * - continuousAura (Tide Surge): +400 ATK / +200 DEF a Aquatic propios
 * - auraDef (Verdant Sentinel): +200 DEF a OTROS Plants propios mientras esté en DEF
 * - piercingDirect (Venomscale Stalker): permite ataque directo si oponente
 *   no tiene monsters con ATK >= 2000
 */

import { describe, expect, it } from 'vitest';
import pino from 'pino';
import { DuelStateSchema } from '../src/rooms/schema/DuelStateSchema.js';
import { GameEngine } from '../src/engine/GameEngine.js';
import { CardSchema } from '../src/rooms/schema/CardSchema.js';
import { registerTriggersForCard } from '../src/cards/triggered/registry.js';

const log = pino({ level: 'silent' });

function freshEngine(): { state: DuelStateSchema; engine: GameEngine } {
  const state = new DuelStateSchema();
  state.matchId = 'auras_test';
  state.mode = 'PvP_Casual';
  const engine = new GameEngine(state, log, 'auras_seed');
  engine.setupPlayer({
    id: 'p1',
    username: 'Alice',
    mainDeckCardIds: Array(40).fill('mon_aqua_001'),
    isFirstPlayer: true,
  });
  engine.setupPlayer({
    id: 'p2',
    username: 'Bob',
    mainDeckCardIds: Array(40).fill('mon_beast_001'),
    isFirstPlayer: false,
  });
  engine.startMatch();
  return { state, engine };
}

function placeMonster(
  state: DuelStateSchema,
  playerId: string,
  instanceId: string,
  cardId: string,
  position: 'ATK' | 'DEF' = 'ATK',
) {
  const player = state.players.get(playerId);
  if (!player) throw new Error('player');
  const slot = player.monsterZones.findIndex((z) => !z.instanceId);
  const c = new CardSchema();
  c.instanceId = instanceId;
  c.cardId = cardId;
  c.ownerId = playerId;
  c.position = position;
  player.monsterZones[slot] = c;
}

function placeSpellTrap(state: DuelStateSchema, playerId: string, instanceId: string, cardId: string) {
  const player = state.players.get(playerId);
  if (!player) throw new Error('player');
  const slot = player.spellTrapZones.findIndex((z) => !z.instanceId);
  const c = new CardSchema();
  c.instanceId = instanceId;
  c.cardId = cardId;
  c.ownerId = playerId;
  c.faceDown = false;
  player.spellTrapZones[slot] = c;
  return c;
}

describe('AuraRegistry — continuousAura (Tide Surge)', () => {
  it('aplica +400 ATK / +200 DEF a Aquatic propios cuando Tide Surge está activa', () => {
    const { state, engine } = freshEngine();

    // Place 1 Aquatic en p1, 1 Beast en p1 (no aplica), 1 Aquatic en p2 (no aplica).
    placeMonster(state, 'p1', 'p1_aqua', 'mon_aqua_001'); // atk 2100, def 1800
    placeMonster(state, 'p1', 'p1_beast', 'mon_beast_001'); // atk 1700, def 1200
    placeMonster(state, 'p2', 'p2_aqua', 'mon_aqua_001');

    // Sin Tide Surge, stats efectivos del p1_aqua = base.
    const aquaCard = engine.cards.getById('mon_aqua_001')!;
    if (aquaCard.type !== 'Monster') throw new Error('not monster');
    const p1Aqua = state.players.get('p1')!.monsterZones.find((c) => c.instanceId === 'p1_aqua')!;
    const beforeP1Aqua = engine.combat.effectiveStatsWithAuras(aquaCard, p1Aqua, 'p1');
    expect(beforeP1Aqua.atk).toBe(2100);
    expect(beforeP1Aqua.def).toBe(1800);

    // Activar Tide Surge en p1.
    const tideSurge = placeSpellTrap(state, 'p1', 'tide_1', 'spl_003');
    const tsDef = engine.cards.getById('spl_003')!;
    registerTriggersForCard(tsDef, {
      state,
      source: tideSurge,
      ownerId: 'p1',
      registry: engine.triggers,
      auras: engine.auras,
      log,
    });
    expect(engine.auras.countFor('tide_1')).toBe(1);

    // p1 Aqua: +400 ATK / +200 DEF.
    const afterP1Aqua = engine.combat.effectiveStatsWithAuras(aquaCard, p1Aqua, 'p1');
    expect(afterP1Aqua.atk).toBe(2500);
    expect(afterP1Aqua.def).toBe(2000);

    // p1 Beast: NO aplica (no es Aquatic).
    const beastCard = engine.cards.getById('mon_beast_001')!;
    if (beastCard.type !== 'Monster') throw new Error('not monster');
    const p1Beast = state.players.get('p1')!.monsterZones.find((c) => c.instanceId === 'p1_beast')!;
    const p1BeastStats = engine.combat.effectiveStatsWithAuras(beastCard, p1Beast, 'p1');
    expect(p1BeastStats.atk).toBe(1700);

    // p2 Aqua: NO aplica (no es propio del que activó).
    const p2Aqua = state.players.get('p2')!.monsterZones.find((c) => c.instanceId === 'p2_aqua')!;
    const p2AquaStats = engine.combat.effectiveStatsWithAuras(aquaCard, p2Aqua, 'p2');
    expect(p2AquaStats.atk).toBe(2100);
  });

  it('removiendo el source desregistra el aura', () => {
    const { state, engine } = freshEngine();
    const ts = placeSpellTrap(state, 'p1', 'ts1', 'spl_003');
    const tsDef = engine.cards.getById('spl_003')!;
    registerTriggersForCard(tsDef, { state, source: ts, ownerId: 'p1', registry: engine.triggers, auras: engine.auras, log });
    expect(engine.auras.countFor('ts1')).toBe(1);

    engine.auras.unregister('ts1');
    expect(engine.auras.countFor('ts1')).toBe(0);
  });
});

describe('AuraRegistry — auraDef (synthetic Verdant Sentinel)', () => {
  it('+200 DEF a otros Plants propios solo si Sentinel está en DEF', () => {
    const { state, engine } = freshEngine();

    // 2 Plants propios. Sentinel (mon_plant_001 / Olek L4 base 1700) en DEF + otro Plant.
    placeMonster(state, 'p1', 'sentinel', 'mon_plant_001', 'DEF');
    placeMonster(state, 'p1', 'other_plant', 'mon_plant_001', 'DEF');

    // Olek's catalog effect changed to onDeployHeal post-2026-05 lore expansion. We still
    // want to validate the auraDef factory + aurasApplicableTo integration, so we construct
    // a synthetic Verdant Sentinel def with the legacy auraDef effect.
    const sentinel = state.players.get('p1')!.monsterZones.find((c) => c.instanceId === 'sentinel')!;
    const syntheticSentinelDef = {
      id: 'mon_test_sentinel',
      name: 'Verdant Sentinel',
      type: 'Monster' as const,
      rarity: 'Common' as const,
      attribute: 'Plant' as const,
      monsterType: 'Plant' as const,
      level: 3,
      atk: 800,
      def: 1900,
      imageUrl: '',
      description: '+200 DEF to other Plants while in DEF.',
      isNFT: false,
      parts: [],
      effect: {
        kind: 'auraDef',
        spellSpeed: 1 as const,
        description: 'While in DEF, your other Plant Axies gain +200 DEF.',
        params: { defBonus: 200, scope: 'ownPlantsExceptSelf', requirePosition: 'DEF' },
      },
    };
    registerTriggersForCard(syntheticSentinelDef, {
      state,
      source: sentinel,
      ownerId: 'p1',
      registry: engine.triggers,
      auras: engine.auras,
      log,
    });

    // Other Plant: +200 DEF over its base def (mon_plant_001 base = 1700, so 1900).
    const plantCard = engine.cards.getById('mon_plant_001')!;
    if (plantCard.type !== 'Monster') throw new Error('not monster');
    const other = state.players.get('p1')!.monsterZones.find((c) => c.instanceId === 'other_plant')!;
    const otherStats = engine.combat.effectiveStatsWithAuras(plantCard, other, 'p1');
    expect(otherStats.def).toBe(plantCard.def + 200);

    // Sentinel mismo: excludeSelf=true, no aplica.
    const sentinelStats = engine.combat.effectiveStatsWithAuras(plantCard, sentinel, 'p1');
    expect(sentinelStats.def).toBe(plantCard.def);

    // Si Sentinel cambia a ATK, el aura se desactiva.
    sentinel.position = 'ATK';
    const afterATK = engine.combat.effectiveStatsWithAuras(plantCard, other, 'p1');
    expect(afterATK.def).toBe(plantCard.def);
  });
});

describe('ActionValidator — piercingDirect (Venomscale Stalker)', () => {
  it('permite DIRECT attack si oponente no tiene monsters con ATK >= 2000', () => {
    const { state, engine } = freshEngine();
    // Avanzar a p2 BATTLE.
    for (let i = 0; i < 6; i++) engine.handleEndPhase('p1');
    engine.handleEndPhase('p2'); // STANDBY
    engine.handleEndPhase('p2'); // MAIN_1
    engine.handleEndPhase('p2'); // BATTLE

    placeMonster(state, 'p2', 'venom', 'mon_reptile_001'); // piercingDirect, threshold 2000
    placeMonster(state, 'p1', 'low_def', 'mon_plant_001'); // atk 800 < 2000

    expect(() =>
      engine.handleDeclareAttack('p2', { attackerInstanceId: 'venom', targetInstanceId: 'DIRECT' }),
    ).not.toThrow();
  });

  it('bloquea DIRECT attack si oponente tiene monster con ATK >= threshold', () => {
    const { state, engine } = freshEngine();
    for (let i = 0; i < 6; i++) engine.handleEndPhase('p1');
    engine.handleEndPhase('p2');
    engine.handleEndPhase('p2');
    engine.handleEndPhase('p2');

    placeMonster(state, 'p2', 'venom2', 'mon_reptile_001');
    placeMonster(state, 'p1', 'big_atk', 'mon_aqua_001'); // atk 2100 >= 2000

    expect(() =>
      engine.handleDeclareAttack('p2', { attackerInstanceId: 'venom2', targetInstanceId: 'DIRECT' }),
    ).toThrow();
  });

  it('bloquea DIRECT attack normal (sin piercingDirect) si oponente tiene monsters', () => {
    const { state, engine } = freshEngine();
    for (let i = 0; i < 6; i++) engine.handleEndPhase('p1');
    engine.handleEndPhase('p2');
    engine.handleEndPhase('p2');
    engine.handleEndPhase('p2');

    placeMonster(state, 'p2', 'normal_atk', 'mon_aqua_001'); // sin piercing
    placeMonster(state, 'p1', 'blocker', 'mon_plant_001'); // atk 800

    expect(() =>
      engine.handleDeclareAttack('p2', { attackerInstanceId: 'normal_atk', targetInstanceId: 'DIRECT' }),
    ).toThrow();
  });
});
