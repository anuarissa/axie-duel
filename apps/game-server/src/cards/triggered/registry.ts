/**
 * Registración automática de triggered handlers según `effect.kind` de la carta.
 *
 * Cuando una carta entra en juego (SET para Trap, ACTIVATE para Field Spell),
 * el GameEngine llama `registerTriggersForCard()` que mira el `effect.kind` y
 * engancha los handlers correspondientes al EventBus, trackeados por TriggerRegistry.
 *
 * Cuando la carta sale del juego (graveyard/banished), `unregisterAll(instanceId)`
 * limpia todos los handlers.
 *
 * Para agregar un nuevo triggered effect: implementá su factory aquí y agregalo
 * a `TRIGGER_FACTORIES`.
 */

import type { Card } from '@axie-duel/shared-types';
import type { CardSchema } from '../../rooms/schema/CardSchema.js';
import type { DuelStateSchema } from '../../rooms/schema/DuelStateSchema.js';
import type { TriggerRegistry } from '../../engine/TriggerRegistry.js';
import type { AuraRegistry, AuraScope } from '../../engine/AuraRegistry.js';
import type { Logger } from 'pino';

export interface TriggerContext {
  state: DuelStateSchema;
  source: CardSchema;
  ownerId: string;
  registry: TriggerRegistry;
  /** Optional — solo para auras pasivas (continuousAura, auraDef). */
  auras?: AuraRegistry;
  log: Logger;
}

export type TriggerFactory = (def: Card, ctx: TriggerContext) => void;

// ── Trigger factories ────────────────────────────────────────────────────

/**
 * negateAttack (Mirror Web): cuando el oponente declara ataque, lo cancela.
 * One-shot: tras dispararse, la trampa va al graveyard y se desuscribe.
 */
const negateAttackFactory: TriggerFactory = (_def, { state, source, ownerId, registry, log }) => {
  registry.register(source.instanceId, 'onAttackDeclare', (event) => {
    if (event.type !== 'onAttackDeclare') return;
    // BUG-FIX 2026-05-04: el trap solo dispara si fue ACTIVADO (face-up).
    // Si está face-down, el user pasó el prompt → no debe activarse.
    if (source.faceDown) return;
    if (event.attackerOwnerId === ownerId) return; // solo dispara contra ataques del oponente
    if (event.attacker.counters.get('trapImmune')) {
      log.info({ trap: source.instanceId, attacker: event.attacker.instanceId }, 'negateAttack skipped (trapImmune)');
      return;
    }
    event.cancelled = true;
    log.info({ trap: source.instanceId, attacker: event.attacker.instanceId }, 'negateAttack triggered');
    moveToGraveyard(state, source, ownerId);
    registry.unregisterAll(source.instanceId);
  });
};

/**
 * atkDebuff (Poison Backlash): cuando el oponente declara ataque, baja
 * `attackerAtkPenalty`. One-shot.
 */
const atkDebuffFactory: TriggerFactory = (def, { state, source, ownerId, registry, log }) => {
  const penalty = typeof def.effect?.params?.atkPenalty === 'number' ? def.effect.params.atkPenalty : 800;
  registry.register(source.instanceId, 'onAttackDeclare', (event) => {
    if (event.type !== 'onAttackDeclare') return;
    // BUG-FIX 2026-05-04: trap solo dispara si fue activado (face-up).
    if (source.faceDown) return;
    if (event.attackerOwnerId === ownerId) return;
    if (event.attacker.counters.get('trapImmune')) {
      log.info({ trap: source.instanceId, attacker: event.attacker.instanceId }, 'atkDebuff skipped (trapImmune)');
      return;
    }
    event.attackerAtkPenalty += penalty;
    log.info({ trap: source.instanceId, penalty }, 'atkDebuff triggered');
    moveToGraveyard(state, source, ownerId);
    registry.unregisterAll(source.instanceId);
  });
};

/**
 * negateAndDestroy (Lunacian Counterstrike — Counter Trap): cuando el oponente
 * ACTIVA una Spell, la negamos y la trap se destruye (one-shot).
 */
const negateAndDestroyFactory: TriggerFactory = (_def, { state, source, ownerId, registry, log }) => {
  registry.register(source.instanceId, 'onSpellActivated', (event) => {
    if (event.type !== 'onSpellActivated') return;
    // BUG-FIX 2026-05-04: trap solo dispara si fue activado (face-up).
    if (source.faceDown) return;
    if (event.ownerId === ownerId) return; // solo contra spells del oponente
    event.cancelled = true;
    log.info({ trap: source.instanceId, spell: event.source.instanceId }, 'negateAndDestroy triggered');
    moveToGraveyard(state, source, ownerId);
    registry.unregisterAll(source.instanceId);
  });
};

/**
 * fieldTrigger (Sky Mavis Field — Field Spell continuous): cada vez que el OWNER
 * de la field spell invoca un Axie monster propio, +atkBonus ATK al monster invocado.
 *
 * Filtra por ownership: el bonus solo aplica a invocaciones del dueño de la field
 * spell. Las invocaciones del oponente no reciben el bonus.
 *
 * NO es one-shot: queda activo mientras la field spell esté en zona.
 * Cleanup automático cuando se destruye via unregisterAll.
 */
const fieldTriggerFactory: TriggerFactory = (def, { source, ownerId, registry, log }) => {
  const atkBonus = typeof def.effect?.params?.atkBonus === 'number' ? def.effect.params.atkBonus : 300;
  registry.register(source.instanceId, 'onSummon', (event) => {
    if (event.type !== 'onSummon') return;
    if (event.ownerId !== ownerId) return; // solo own monsters
    event.monster.atkMod += atkBonus;
    log.info(
      { field: source.instanceId, target: event.monster.instanceId, atkBonus, ownerId },
      'fieldTrigger applied (own monster only)',
    );
  });
};

/**
 * continuousAura (Tide Surge — Continuous Spell): mientras esté en zona,
 * +400 ATK / +200 DEF a Aquatic propios. Auras se desactivan en `unregisterAll`.
 */
const continuousAuraFactory: TriggerFactory = (def, { source, ownerId, auras, log }) => {
  if (!auras) {
    log.warn({ source: source.instanceId }, 'continuousAura: AuraRegistry not provided');
    return;
  }
  const params = (def.effect?.params ?? {}) as Record<string, unknown>;
  const filter = (params.filter as string) ?? 'ownAquatic';
  const atkBonus = typeof params.atkBonus === 'number' ? params.atkBonus : 0;
  const defBonus = typeof params.defBonus === 'number' ? params.defBonus : 0;
  const scope = filterToScope(filter);
  auras.register({
    sourceInstanceId: source.instanceId,
    ownerId,
    scope,
    atkBonus,
    defBonus,
  });
  log.info({ source: source.instanceId, scope, atkBonus, defBonus }, 'continuousAura registered');
};

/**
 * auraDef (Verdant Sentinel): mientras esté en DEF, +200 DEF a OTROS Plants propios.
 * Aura state-based con requireSourcePosition='DEF' + excludeSelf.
 */
const auraDefFactory: TriggerFactory = (def, { source, ownerId, auras, log }) => {
  if (!auras) {
    log.warn({ source: source.instanceId }, 'auraDef: AuraRegistry not provided');
    return;
  }
  const params = (def.effect?.params ?? {}) as Record<string, unknown>;
  const scope = (params.scope as string) ?? 'ownPlantsExceptSelf';
  const requirePosition = (params.requirePosition as string) ?? 'DEF';
  const defBonus = typeof params.defBonus === 'number' ? params.defBonus : 200;
  const auraScope: AuraScope = scope.includes('Plant') ? 'ownPlant' : 'ownAll';
  auras.register({
    sourceInstanceId: source.instanceId,
    ownerId,
    scope: auraScope,
    atkBonus: 0,
    defBonus,
    excludeSelf: true,
    requireSourcePosition: requirePosition as 'ATK' | 'DEF' | 'DEF_FACEDOWN',
  });
  log.info({ source: source.instanceId, scope: auraScope, defBonus }, 'auraDef registered');
};

function filterToScope(filter: string): AuraScope {
  switch (filter) {
    case 'ownAquatic':
      return 'ownAquatic';
    case 'ownPlant':
      return 'ownPlant';
    case 'ownBeast':
      return 'ownBeast';
    case 'ownBird':
      return 'ownBird';
    case 'ownReptile':
      return 'ownReptile';
    case 'ownBug':
      return 'ownBug';
    case 'ownChimera':
      return 'ownChimera';
    default:
      return 'ownAll';
  }
}

// ── Nuevos factories (lore expansion 2026-05) ────────────────────────────

/**
 * onDeployHeal (Olek, Puffy): al invocar, restaurar `amount` LP al hero del dueño.
 * One-shot inmediato — se ejecuta al registrar (post-summon vía handleNormalSummon).
 */
const onDeployHealFactory: TriggerFactory = (def, { state, source, ownerId, log }) => {
  const amount = (def.effect?.params?.amount as number) ?? 500;
  const player = state.players.get(ownerId);
  if (!player) return;
  // Cap LP a 8000 (default initial). Si querés overheal, quitar el min().
  player.lifePoints = Math.min(8000, player.lifePoints + amount);
  log.info({ source: source.instanceId, amount, ownerId, newLP: player.lifePoints }, 'onDeployHeal triggered');
};

/**
 * beastSwarm (Buba, Venom): aura passive. +atkBonus al SOURCE (sí mismo) si el dueño
 * controla otra carta del mismo attribute (Beast).
 */
const beastSwarmFactory: TriggerFactory = (def, { source, ownerId, auras, log }) => {
  if (!auras) return;
  const atkBonus = (def.effect?.params?.atkBonus as number) ?? 300;
  auras.register({
    sourceInstanceId: source.instanceId,
    ownerId,
    scope: 'ownBeast',
    atkBonus,
    defBonus: 0,
    applyOnlyToSelf: true,
    requireFieldCondition: 'ownerHasOtherSameClass',
  });
  log.info({ source: source.instanceId, atkBonus }, 'beastSwarm registered');
};

/**
 * antiPlantDebuff (Ena, Tripp): aura passive. -atkPenalty a TODAS las Plant Axies del enemigo
 * mientras esta Bug esté en field.
 */
const antiPlantDebuffFactory: TriggerFactory = (def, { source, ownerId, auras, log }) => {
  if (!auras) return;
  const atkPenalty = (def.effect?.params?.atkPenalty as number) ?? 200;
  auras.register({
    sourceInstanceId: source.instanceId,
    ownerId,
    scope: 'enemyPlant',
    atkBonus: -atkPenalty,
    defBonus: 0,
  });
  log.info({ source: source.instanceId, atkPenalty }, 'antiPlantDebuff registered');
};

/**
 * onDeployDestroySpellTrap (Ronin Beast, Nut Cracker): one-shot al invocar, destruye
 * 1 random Spell/Trap del oponente (si tiene alguno en zona).
 */
const onDeployDestroySpellTrapFactory: TriggerFactory = (_def, { state, source, ownerId, log }) => {
  const opponent = [...state.players.entries()].find(([id]) => id !== ownerId)?.[1];
  if (!opponent) return;
  const occupiedSlots: Array<{ idx: number; card: typeof opponent.spellTrapZones[0] }> = [];
  opponent.spellTrapZones.forEach((c, idx) => {
    if (c.instanceId) occupiedSlots.push({ idx, card: c });
  });
  if (occupiedSlots.length === 0) {
    log.info({ source: source.instanceId }, 'onDeployDestroySpellTrap: no targets');
    return;
  }
  const target = occupiedSlots[Math.floor(Math.random() * occupiedSlots.length)]!;
  opponent.graveyard.push(target.card);
  const empty = new (target.card.constructor as { new (): typeof target.card })();
  empty.instanceId = '';
  opponent.spellTrapZones[target.idx] = empty;
  log.info({ source: source.instanceId, destroyed: target.card.instanceId }, 'onDeployDestroySpellTrap triggered');
};

/**
 * onDeathDirectDamage (Backdoor Bird): cuando ESTE monster muere por combat, deal `amount`
 * direct damage al oponente.
 */
const onDeathDirectDamageFactory: TriggerFactory = (def, { state, source, ownerId, registry, log }) => {
  const amount = (def.effect?.params?.amount as number) ?? 400;
  registry.register(source.instanceId, 'onDeath', (event) => {
    if (event.type !== 'onDeath') return;
    if (event.deceased.instanceId !== source.instanceId) return;
    const opponent = [...state.players.entries()].find(([id]) => id !== ownerId)?.[1];
    if (!opponent) return;
    opponent.lifePoints = Math.max(0, opponent.lifePoints - amount);
    log.info({ source: source.instanceId, amount, oppLP: opponent.lifePoints }, 'onDeathDirectDamage triggered');
  });
};

/**
 * onDeathPermanentDebuff (Terminator Reptile): cuando ESTE monster muere POR COMBAT,
 * el killer (attacker) pierde permanentemente `atkPenalty` ATK (atkMod no se resetea).
 */
const onDeathPermanentDebuffFactory: TriggerFactory = (def, { source, ownerId, registry, log }) => {
  const penalty = (def.effect?.params?.atkPenalty as number) ?? 500;
  registry.register(source.instanceId, 'onDeath', (event) => {
    if (event.type !== 'onDeath') return;
    if (event.deceased.instanceId !== source.instanceId) return;
    if (event.cause !== 'battle' || !event.killer) return;
    event.killer.atkMod -= penalty;
    log.info(
      { source: source.instanceId, killer: event.killer.instanceId, penalty, ownerId },
      'onDeathPermanentDebuff triggered',
    );
  });
};

// ── Lore expansion 2026-05 — Origins Axies ─────────────────────────────

/**
 * onDeployShield (Olek): al desplegar, gana +amount DEF permanente.
 * Implementación simple: defMod += amount (one-shot al registrar post-summon).
 */
const onDeployShieldFactory: TriggerFactory = (def, { source, log }) => {
  const amount = (def.effect?.params?.amount as number) ?? 200;
  source.defMod += amount;
  log.info({ source: source.instanceId, amount }, 'onDeployShield applied (+DEF self)');
};

/**
 * onDeployDraw (Ena, Tidecaller): al desplegar, dueño roba `amount` cartas.
 * One-shot al registrar.
 */
const onDeployDrawFactory: TriggerFactory = (def, { state, source, ownerId, log }) => {
  const amount = (def.effect?.params?.amount as number) ?? 1;
  const player = state.players.get(ownerId);
  if (!player) return;
  let drawn = 0;
  for (let i = 0; i < amount; i++) {
    const card = player.deck.shift();
    if (!card) break;
    player.hand.push(card);
    drawn++;
  }
  player.handSize = player.hand.length;
  log.info({ source: source.instanceId, requested: amount, drawn }, 'onDeployDraw applied');
};

/**
 * poisonDoT (Venom): mientras Venom esté en field, al final del turno DEL OPONENTE
 * el oponente pierde `amount` LP. Listener en onPhaseChange (toPhase===END).
 * Auto-skip si Venom no está en field (cleanup implícito por presence-check).
 */
const poisonDoTFactory: TriggerFactory = (def, { state, source, ownerId, registry, log }) => {
  const amount = (def.effect?.params?.amount as number) ?? 100;
  registry.register(source.instanceId, 'onPhaseChange', (event) => {
    if (event.type !== 'onPhaseChange') return;
    if (event.toPhase !== 'END') return;
    // Solo dispara al final del turno del OPONENTE de Venom.
    if (event.activePlayerId === ownerId) return;
    // Verificar que Venom siga en field (presence check).
    const owner = state.players.get(ownerId);
    if (!owner || !owner.monsterZones.some((m) => m.instanceId === source.instanceId)) {
      // Venom muerto o removido — auto-cleanup.
      registry.unregisterAll(source.instanceId);
      return;
    }
    const opponent = state.players.get(event.activePlayerId);
    if (!opponent) return;
    opponent.lifePoints = Math.max(0, opponent.lifePoints - amount);
    log.info(
      { source: source.instanceId, victim: event.activePlayerId, amount, oppLP: opponent.lifePoints },
      'poisonDoT applied',
    );
  });
};

/**
 * firstAttackBonus (Tripp): aura condicional. +atkBonus solo aplica a Tripp si
 * NINGUN otro monster del owner ha atacado este turno. Auto-revoca cuando otro
 * monster ataca (la aura se evalúa state-based en cada effectiveStatsWithAuras).
 *
 * El bonus es flat (190 = ~10% del ATK base 1900). El usuario quiere `+10% ATK
 * si ataca primero` — esta interpretación es: el aura está activa hasta que otro
 * ally ataque, después se desactiva hasta el próximo turno (cuando hasAttacked
 * resetea via onPhaseChange END).
 */
const firstAttackBonusFactory: TriggerFactory = (def, { source, ownerId, auras, log }) => {
  if (!auras) return;
  const atkBonus = (def.effect?.params?.atkBonus as number) ?? 190;
  auras.register({
    sourceInstanceId: source.instanceId,
    ownerId,
    scope: 'ownBug', // Tripp es Bug
    atkBonus,
    defBonus: 0,
    applyOnlyToSelf: true,
    requireFirstAttackOfTurn: true,
  });
  log.info({ source: source.instanceId, atkBonus }, 'firstAttackBonus aura registered');
};

/**
 * trapImmune (Skydancer Aery): mientras dure el "summon turn", el monster
 * no puede ser targeteado por trap effects. Implementado como counter en CardSchema.
 * Reset al cambio de turno (TODO Fase 2 — necesita onTurnStart hook para limpiar).
 *
 * Triggered handlers de traps (negateAttack, atkDebuff) chequean
 * `target.counters.get('trapImmune')` antes de aplicar.
 */
const trapImmuneFactory: TriggerFactory = (def, { source, log }) => {
  const duration = (def.effect?.params?.duration as string) ?? 'summonTurn';
  source.counters.set('trapImmune', 1);
  log.info({ source: source.instanceId, duration }, 'trapImmune flag set');
};

/**
 * lockPosition (Webbed Roots — Continuous Trap): mientras esté activa,
 * los monsters del oponente no pueden cambiar DEF→ATK.
 * Implementado como flag en CardSchema.counters del source — el ActionValidator
 * chequea con un loop sobre spell/trap zones del oponente al validar
 * change-position (TODO Fase 2 — handleChangePosition).
 */
const lockPositionFactory: TriggerFactory = (_def, { source, ownerId, log }) => {
  source.counters.set('lockOpponentDefToAtk', 1);
  log.info({ source: source.instanceId, ownerId }, 'lockPosition active (constraint flag set)');
};

/**
 * duelLock (Single Combat — Quick-Play Spell): hasta fin de turno,
 * solo el monster targeteado y tu Beast pueden atacar/ser atacados.
 *
 * Activable solo si controlás Beast. Setea flag en counters del source con
 * el targetInstanceId. ActionValidator.validateDeclareAttack chequea
 * el flag (TODO Fase 2 — necesita expand de validateDeclareAttack).
 *
 * Cleanup: hasta End Phase del turno actual (TODO Fase 2 — necesita
 * onPhaseChange handler para limpiar al llegar a END).
 */
const duelLockFactory: TriggerFactory = (_def, { source, ownerId, log }) => {
  source.counters.set('duelLockActive', 1);
  log.info({ source: source.instanceId, ownerId }, 'duelLock activated (constraint flag set)');
};

const TRIGGER_FACTORIES: Record<string, TriggerFactory> = {
  negateAttack: negateAttackFactory,
  atkDebuff: atkDebuffFactory,
  negateAndDestroy: negateAndDestroyFactory,
  fieldTrigger: fieldTriggerFactory,
  continuousAura: continuousAuraFactory,
  auraDef: auraDefFactory,
  trapImmune: trapImmuneFactory,
  lockPosition: lockPositionFactory,
  duelLock: duelLockFactory,
  // Lore expansion 2026-05
  onDeployHeal: onDeployHealFactory,
  beastSwarm: beastSwarmFactory,
  antiPlantDebuff: antiPlantDebuffFactory,
  onDeployDestroySpellTrap: onDeployDestroySpellTrapFactory,
  onDeathDirectDamage: onDeathDirectDamageFactory,
  onDeathPermanentDebuff: onDeathPermanentDebuffFactory,
  // Origins Axies (2026-05) — Olek shield, Ena/Tidecaller draw, Venom poison, Tripp speed
  onDeployShield: onDeployShieldFactory,
  onDeployDraw: onDeployDrawFactory,
  poisonDoT: poisonDoTFactory,
  firstAttackBonus: firstAttackBonusFactory,
};

/** Inspecciona la carta y registra triggers si los soporta. */
export function registerTriggersForCard(def: Card, ctx: TriggerContext): boolean {
  if (!def.effect) return false;
  const factory = TRIGGER_FACTORIES[def.effect.kind];
  if (!factory) return false;
  factory(def, ctx);
  return true;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function moveToGraveyard(state: DuelStateSchema, source: CardSchema, ownerId: string): void {
  const player = state.players.get(ownerId);
  if (!player) return;
  // Buscar en spell/trap zones primero (típico para traps), después en monster zones.
  for (const zones of [player.spellTrapZones, player.monsterZones]) {
    const idx = zones.findIndex((c) => c.instanceId === source.instanceId);
    if (idx !== -1) {
      const card = zones[idx]!;
      player.graveyard.push(card);
      const empty = new (card.constructor as { new (): typeof card })();
      empty.instanceId = '';
      zones[idx] = empty;
      return;
    }
  }
}
