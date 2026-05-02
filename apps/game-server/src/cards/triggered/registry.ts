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
import type { Logger } from 'pino';

export interface TriggerContext {
  state: DuelStateSchema;
  source: CardSchema;
  ownerId: string;
  registry: TriggerRegistry;
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
    if (event.attackerOwnerId === ownerId) return; // solo dispara contra ataques del oponente
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
    if (event.attackerOwnerId === ownerId) return;
    event.attackerAtkPenalty += penalty;
    log.info({ trap: source.instanceId, penalty }, 'atkDebuff triggered');
    moveToGraveyard(state, source, ownerId);
    registry.unregisterAll(source.instanceId);
  });
};

const TRIGGER_FACTORIES: Record<string, TriggerFactory> = {
  negateAttack: negateAttackFactory,
  atkDebuff: atkDebuffFactory,
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
