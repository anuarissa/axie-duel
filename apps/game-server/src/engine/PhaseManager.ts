/**
 * PhaseManager: transiciones Draw → Standby → Main1 → Battle → Main2 → End → (siguiente turno).
 * Aplica los efectos automáticos de fase (draw automático en Draw Phase,
 * descarte forzado en End Phase si la mano supera 7).
 */

import {
  MAX_HAND_SIZE,
  TURN_DURATION_MS,
  shouldDrawInDrawPhase,
  nextPhase,
  mustDiscardAtEndPhase,
} from '@axie-duel/game-rules';
import { Phase } from '@axie-duel/shared-types';
import type { DuelStateSchema } from '../rooms/schema/DuelStateSchema.js';
import type { PlayerSchema } from '../rooms/schema/PlayerSchema.js';
import type { DeckManager } from './DeckManager.js';
import type { Logger } from 'pino';

export class PhaseManager {
  constructor(
    private state: DuelStateSchema,
    private deckManager: DeckManager,
    private log: Logger,
  ) {}

  /** Avanza a la siguiente fase aplicando los hooks de inicio/fin de fase. */
  advance(): Phase {
    const current = this.state.phase as Phase;
    this.onLeavePhase(current);

    let next = nextPhase(current);
    const isTurnChange = next === Phase.DRAW;
    if (isTurnChange) {
      // Cambio de turno completo.
      this.swapTurn();
    }

    this.state.phase = next;
    // El timer de 60s aplica al TURNO completo (todas las fases). NO resetear
    // en cada phase advance — solo en cambio de turno. Esto evita que el jugador
    // extienda su turno indefinidamente avanzando fases manualmente.
    if (isTurnChange) {
      this.state.turnDeadlineMs = Date.now() + TURN_DURATION_MS;
    }
    this.onEnterPhase(next);
    this.log.info({ phase: next, turn: this.state.turnNumber }, 'phase advanced');
    return next;
  }

  /** Salta directamente a End Phase (usado al final de Battle Phase manual). */
  jumpTo(target: Phase): void {
    this.onLeavePhase(this.state.phase as Phase);
    this.state.phase = target;
    this.onEnterPhase(target);
  }

  private onEnterPhase(phase: Phase): void {
    const active = this.state.players.get(this.state.activePlayerId);
    if (!active) return;
    switch (phase) {
      case Phase.DRAW:
        if (shouldDrawInDrawPhase(this.state.turnNumber, active.isFirstPlayer)) {
          const drawn = this.deckManager.draw(active, 1);
          if (drawn === 0) {
            // Deck-out → derrota.
            this.state.status = 'GAME_OVER';
            const winner = [...this.state.players.keys()].find((id) => id !== active.id) ?? '';
            this.state.winnerId = winner;
            this.state.winReason = 'DECK_OUT';
            this.log.info({ loser: active.id }, 'deck out - game over');
          }
        }
        break;
      case Phase.END: {
        const overflow = mustDiscardAtEndPhase(
          { handSize: active.hand.length } as never,
          MAX_HAND_SIZE,
        );
        if (overflow > 0) {
          // Auto-descarte de las primeras N cartas por simplicidad. Podríamos pedirle
          // al jugador qué descartar — TODO en Fase 1.
          for (let i = 0; i < overflow; i++) {
            const card = active.hand.shift();
            if (card) active.graveyard.push(card);
          }
          active.handSize = active.hand.length;
          this.log.info({ player: active.id, overflow }, 'forced discard at end phase');
        }
        // Reset flags por turno.
        active.hasNormalSummonedThisTurn = false;
        for (const z of active.monsterZones) {
          if (z.instanceId) {
            z.hasAttacked = false;
            z.positionChangedThisTurn = false;
          }
        }
        break;
      }
      default:
        break;
    }
  }

  private onLeavePhase(_phase: Phase): void {
    // Hooks de salida de fase (ej: limpiar buffs "until end of turn") — Fase 1.
  }

  private swapTurn(): void {
    const playerIds = [...this.state.players.keys()];
    const otherId = playerIds.find((id) => id !== this.state.activePlayerId);
    if (otherId) {
      this.state.activePlayerId = otherId;
      this.state.turnNumber += 1;
    }
  }
}
