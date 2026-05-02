/**
 * Eventos de protocolo cliente <-> servidor.
 * El servidor es authoritative — el cliente solo manda intenciones, NUNCA estado.
 */

import type { Phase, ChainLink, DuelSnapshot, ZoneId, SummonMethod, WinReason } from './duel.types.js';
import type { MonsterPosition, SpellSpeed } from './card.types.js';

// ───────────────────────────────────────────────────────────────────────
//  Cliente → Servidor
// ───────────────────────────────────────────────────────────────────────

export type ClientEvent =
  | { type: 'PLAY_CARD'; cardInstanceId: string; targetZone: ZoneId }
  | { type: 'SET_CARD'; cardInstanceId: string; targetZone: ZoneId }
  | {
      type: 'NORMAL_SUMMON';
      cardInstanceId: string;
      tributes?: string[];
      position: MonsterPosition;
    }
  | { type: 'SPECIAL_SUMMON'; cardInstanceId: string; method: SummonMethod }
  | { type: 'ACTIVATE_EFFECT'; cardInstanceId: string; targets?: string[] }
  | { type: 'DECLARE_ATTACK'; attackerInstanceId: string; targetInstanceId: string | 'DIRECT' }
  | { type: 'CHAIN_RESPONSE'; cardInstanceId?: string; targets?: string[] }
  | { type: 'CHANGE_POSITION'; cardInstanceId: string }
  | { type: 'END_PHASE' }
  | { type: 'MULLIGAN'; keep: boolean }
  | { type: 'SURRENDER' };

export type ClientEventType = ClientEvent['type'];

// ───────────────────────────────────────────────────────────────────────
//  Servidor → Cliente
// ───────────────────────────────────────────────────────────────────────

export type ServerEvent =
  | { type: 'STATE_SNAPSHOT'; snapshot: DuelSnapshot }
  | {
      type: 'CHAIN_OPENED';
      spellSpeed: SpellSpeed;
      respondingPlayerId: string;
      deadlineMs: number;
    }
  | { type: 'EFFECT_RESOLVED'; chainLink: ChainLink }
  | { type: 'PHASE_CHANGED'; newPhase: Phase }
  | { type: 'TURN_CHANGED'; activePlayerId: string; turnNumber: number }
  | { type: 'DAMAGE_DEALT'; targetPlayerId: string; amount: number; remainingLP: number }
  | { type: 'CARD_DRAWN'; playerId: string; cardInstanceId?: string }
  | { type: 'GAME_OVER'; winnerId: string; reason: WinReason }
  | { type: 'ERROR'; code: ServerErrorCode; message: string };

export type ServerEventType = ServerEvent['type'];

export type ServerErrorCode =
  | 'INVALID_ACTION'
  | 'NOT_YOUR_TURN'
  | 'WRONG_PHASE'
  | 'INSUFFICIENT_TRIBUTES'
  | 'ALREADY_NORMAL_SUMMONED'
  | 'CARD_NOT_IN_HAND'
  | 'TARGET_INVALID'
  | 'CHAIN_TIMEOUT'
  | 'AUTH_REQUIRED'
  | 'INTERNAL_ERROR';
