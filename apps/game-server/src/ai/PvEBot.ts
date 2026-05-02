/**
 * Bot de PvE (esqueleto Fase 0). Behavior tree real se implementa en Fase 4.
 * Por ahora: política greedy mínima — siempre intenta invocar el monstruo
 * de mayor ATK que pueda y pasa fase si no hay jugada.
 */

import type { GameEngine } from '../engine/GameEngine.js';
import { Phase } from '@axie-duel/shared-types';

export type BotDifficulty = 'Easy' | 'Normal' | 'Hard';

export class PvEBot {
  constructor(
    private engine: GameEngine,
    private playerId: string,
    private difficulty: BotDifficulty = 'Easy',
  ) {}

  /** Invocada por el Room cuando es turno del bot. */
  takeTurn(): void {
    // TODO Fase 4: implementar behavior tree con mini-max para Hard.
    const phase = (this.engine as unknown as { state: { phase: string } }).state.phase as Phase;
    if (phase === Phase.MAIN_1 || phase === Phase.MAIN_2) {
      // Fase 0: siempre pasar. Fase 4 ampliará.
    }
    try {
      this.engine.handleEndPhase(this.playerId);
    } catch {
      // ignore
    }
  }

  get difficultyLevel(): BotDifficulty {
    return this.difficulty;
  }
}
