/**
 * Reglas formales del juego. Funciones puras que el `GameEngine` consume.
 * NO mantienen estado. NO escriben logs. Solo deciden si una situación es válida.
 */

import { Phase, type DuelSnapshot, type PlayerInDuel } from '@axie-duel/shared-types';
import { TRIBUTES_BY_LEVEL } from './constants.js';

/** Cuántos tributos requiere invocar un monstruo de cierto nivel. */
export function tributesRequired(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > 12) {
    throw new Error(`Invalid monster level ${level}: must be integer 1..12`);
  }
  return TRIBUTES_BY_LEVEL[level] ?? 2;
}

/** ¿En qué fases se puede activar Spell Speed 1 (ignición)? */
export function canActivateSpellSpeed1(phase: Phase, isActivePlayer: boolean): boolean {
  if (!isActivePlayer) return false;
  return phase === Phase.MAIN_1 || phase === Phase.MAIN_2;
}

/** Spell Speed 2 y 3 se pueden activar en cualquier fase y por cualquier jugador. */
export function canActivateSpellSpeed2or3(): boolean {
  return true;
}

/** ¿Se puede declarar ataque ahora? */
export function canDeclareAttack(
  phase: Phase,
  isActivePlayer: boolean,
  turnNumber: number,
  attackerHasAttacked: boolean,
  isFirstPlayer: boolean,
): boolean {
  if (!isActivePlayer) return false;
  if (phase !== Phase.BATTLE) return false;
  if (attackerHasAttacked) return false;
  // Regla Yu-Gi-Oh!: el primer jugador NO puede atacar en su turno 1.
  if (turnNumber === 1 && isFirstPlayer) return false;
  return true;
}

/** Validación: la mano de fin de turno no puede tener más de 7 cartas (descarte forzado). */
export function mustDiscardAtEndPhase(player: PlayerInDuel, maxHandSize: number): number {
  return Math.max(0, player.handSize - maxHandSize);
}

/** El primer jugador NO roba en su Draw Phase del turno 1. */
export function shouldDrawInDrawPhase(turnNumber: number, isFirstPlayer: boolean): boolean {
  if (turnNumber === 1 && isFirstPlayer) return false;
  return true;
}

export interface WinCheckResult {
  ended: boolean;
  winnerId?: string;
  reason?: 'LIFE_POINTS_ZERO' | 'DECK_OUT' | 'SURRENDER';
}

/** ¿La partida terminó y por qué? */
export function checkWinConditions(snapshot: DuelSnapshot): WinCheckResult {
  const entries = Object.entries(snapshot.players) as Array<[string, PlayerInDuel]>;
  for (const [playerId, player] of entries) {
    if (player.lifePoints <= 0) {
      const winner = Object.keys(snapshot.players).find((id) => id !== playerId);
      const result: WinCheckResult = { ended: true, reason: 'LIFE_POINTS_ZERO' };
      if (winner) result.winnerId = winner;
      return result;
    }
  }
  // Deck-out solo se valida cuando se intenta robar y deck está vacío.
  // Esa rama la chequea `DeckManager.draw()`.
  return { ended: false };
}

/** Siguiente fase en el ciclo del turno. */
export function nextPhase(current: Phase): Phase {
  switch (current) {
    case Phase.DRAW:
      return Phase.STANDBY;
    case Phase.STANDBY:
      return Phase.MAIN_1;
    case Phase.MAIN_1:
      return Phase.BATTLE;
    case Phase.BATTLE:
      return Phase.MAIN_2;
    case Phase.MAIN_2:
      return Phase.END;
    case Phase.END:
      return Phase.DRAW;
  }
}

/** ¿Esta fase admite cambiar posición de un monstruo? Solo Main 1 y Main 2. */
export function canChangePosition(phase: Phase, positionChangedThisTurn: boolean): boolean {
  if (positionChangedThisTurn) return false;
  return phase === Phase.MAIN_1 || phase === Phase.MAIN_2;
}
