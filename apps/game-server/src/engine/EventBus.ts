/**
 * Event bus simple para triggered effects.
 * El GameEngine emite eventos en momentos clave (onSummon, onAttackDeclare,
 * onBattleResolve, onTurnStart, onPhaseChange). Los effect handlers triggered
 * (ej: "cuando un monster es invocado, gana +300 ATK") se suscriben.
 *
 * NO es un EventEmitter de Node — es síncrono y tipado para que el flujo del
 * engine sea predecible y los efectos se resuelvan en orden de registración.
 */

import type { CardSchema } from '../rooms/schema/CardSchema.js';
import type { CombatOutcome } from './CombatSystem.js';
import type { Phase } from '@axie-duel/shared-types';

export interface OnSummonEvent {
  type: 'onSummon';
  ownerId: string;
  monster: CardSchema;
  /** 'normal' (incluye tribute) | 'special' | 'flip' */
  method: 'normal' | 'special' | 'flip';
}

export interface OnAttackDeclareEvent {
  type: 'onAttackDeclare';
  attackerOwnerId: string;
  attacker: CardSchema;
  /** instanceId del defensor o 'DIRECT'. */
  targetInstanceId: string | 'DIRECT';
  /** Mutable: si un handler set `cancelled=true`, el motor cancela el ataque. */
  cancelled: boolean;
  /** Mutable: penalización ATK temporal aplicada por traps tipo Poison Backlash. */
  attackerAtkPenalty: number;
}

export interface OnBattleResolveEvent {
  type: 'onBattleResolve';
  attackerOwnerId: string;
  defenderOwnerId: string;
  attacker: CardSchema;
  defender: CardSchema | null;
  outcome: CombatOutcome;
}

export interface OnTurnStartEvent {
  type: 'onTurnStart';
  activePlayerId: string;
  turnNumber: number;
}

export interface OnPhaseChangeEvent {
  type: 'onPhaseChange';
  fromPhase: Phase;
  toPhase: Phase;
  activePlayerId: string;
}

export interface OnSpellActivatedEvent {
  type: 'onSpellActivated';
  ownerId: string;
  source: CardSchema;
  /** Mutable: counter trap puede setear true para negar la spell. */
  cancelled: boolean;
}

export interface OnDeathEvent {
  type: 'onDeath';
  deceased: CardSchema;
  deceasedOwnerId: string;
  /** El monster que mató al deceased (si fue por combat). */
  killer?: CardSchema;
  killerOwnerId?: string;
  /** 'battle' = murió en combate. 'effect' = murió por un efecto de carta. */
  cause: 'battle' | 'effect';
}

export type EngineEvent =
  | OnSummonEvent
  | OnAttackDeclareEvent
  | OnBattleResolveEvent
  | OnTurnStartEvent
  | OnPhaseChangeEvent
  | OnSpellActivatedEvent
  | OnDeathEvent;

export type EngineEventType = EngineEvent['type'];

export type EventHandler<T extends EngineEvent = EngineEvent> = (event: T) => void;

export class EventBus {
  private handlers: Map<EngineEventType, Array<EventHandler<EngineEvent>>> = new Map();

  on<T extends EngineEvent>(type: T['type'], handler: EventHandler<T>): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler as EventHandler<EngineEvent>);
    this.handlers.set(type, list);
  }

  off(type: EngineEventType, handler: EventHandler<EngineEvent>): void {
    const list = this.handlers.get(type);
    if (!list) return;
    const idx = list.indexOf(handler);
    if (idx !== -1) list.splice(idx, 1);
  }

  emit<T extends EngineEvent>(event: T): void {
    const list = this.handlers.get(event.type);
    if (!list) return;
    for (const h of list) h(event);
  }

  clear(): void {
    this.handlers.clear();
  }
}
