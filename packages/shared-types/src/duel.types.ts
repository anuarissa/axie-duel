/**
 * Tipos del estado de duelo. Espejan los Colyseus Schemas en
 * `apps/game-server/src/rooms/schema/`, pero sin la dependencia de Colyseus
 * (para que el cliente y los packages compartan el shape sin tirar de Colyseus runtime).
 */

import type { PlayerInDuel } from './player.types.js';
import type { CardInstance, SpellSpeed } from './card.types.js';

export enum Phase {
  DRAW = 'DRAW',
  STANDBY = 'STANDBY',
  MAIN_1 = 'MAIN_1',
  BATTLE = 'BATTLE',
  MAIN_2 = 'MAIN_2',
  END = 'END',
}

export enum DuelStatus {
  WAITING_PLAYERS = 'WAITING_PLAYERS',
  MULLIGAN = 'MULLIGAN',
  IN_PROGRESS = 'IN_PROGRESS',
  CHAIN_RESOLUTION = 'CHAIN_RESOLUTION',
  GAME_OVER = 'GAME_OVER',
}

export type DuelMode = 'PvE' | 'PvP_Casual' | 'PvP_Ranked' | 'PvP_RankedNFT';

export type WinReason =
  | 'LIFE_POINTS_ZERO'
  | 'DECK_OUT'
  | 'SPECIAL_CARD_CONDITION'
  | 'SURRENDER'
  | 'DISCONNECT_TIMEOUT';

export interface ChainLink {
  /** Posición en la cadena (1 = primero en activarse). */
  index: number;
  playerId: string;
  cardInstanceId: string;
  spellSpeed: SpellSpeed;
  targets: string[];
  resolvedAt?: number;
  result?: EffectResult;
}

export interface EffectResult {
  success: boolean;
  /** Cambios de estado aplicados. Útil para replay y logs. */
  mutations: string[];
  /** Mensaje legible. */
  message?: string;
}

export interface DuelSnapshot {
  matchId: string;
  status: DuelStatus;
  mode: DuelMode;
  phase: Phase;
  turnNumber: number;
  activePlayerId: string;
  players: Record<string, PlayerInDuel>;
  /** Cadena en resolución, vacío si nadie activó nada. */
  chain: ChainLink[];
  /** ms restantes del turno actual. */
  turnDeadlineMs: number;
  /** ms hasta que se cierre la ventana de respuesta de cadena. */
  chainResponseDeadlineMs?: number;
  winnerId?: string;
  winReason?: WinReason;
}

/**
 * Mapeo de zona en el campo. Lo usa el `ActionValidator` para resolver
 * a qué array tocar cuando el cliente manda un evento `PLAY_CARD`.
 */
export type ZoneId =
  | { kind: 'MONSTER'; index: 0 | 1 | 2 | 3 | 4 }
  | { kind: 'SPELL_TRAP'; index: 0 | 1 | 2 | 3 | 4 }
  | { kind: 'FIELD' }
  | { kind: 'HAND' }
  | { kind: 'GRAVEYARD' }
  | { kind: 'BANISHED' }
  | { kind: 'DECK' }
  | { kind: 'EXTRA_DECK' };

export type SummonMethod = 'NORMAL' | 'TRIBUTE' | 'SPECIAL' | 'FUSION' | 'RITUAL';

export interface DuelConfig {
  initialLifePoints: number;
  startingHandSize: number;
  maxHandSize: number;
  turnDurationMs: number;
  /** ms de banco extra que se acumulan al pasar turnos rápidos. */
  bankBudgetMs: number;
  chainResponseWindowMs: number;
}
