/**
 * Cliente HTTP del API REST. Llamadas service-to-service autenticadas con
 * INTERNAL_SERVICE_TOKEN compartido. Usado por DuelRoom/PvERoom para persistir
 * matches al GAME_OVER.
 *
 * Errores se loggean pero NO crashean el room — la partida ya terminó, no
 * queremos que un fallo de red devuelva un 500 al cliente que ya cerró su WS.
 */

import { config } from '../config.js';
import { logger } from '../logger.js';

export interface PersistMatchInput {
  player1Id: string;
  player2Id: string | null;
  winnerId: string | null;
  mode: 'PvE' | 'PvP_Casual' | 'PvP_Ranked' | 'PvP_RankedNFT';
  duration: number;
  turnsPlayed: number;
  reason?: string;
  /** Solo PvE — para que api aplique reward multiplier por difficulty. */
  botDifficulty?: 'Easy' | 'Normal' | 'Hard';
  /** Log determinista de eventos (de ReplayLogger.serialize()). */
  replayLog?: ReadonlyArray<unknown>;
}

export interface MatchRewardSummary {
  outcome: 'WIN' | 'LOSS' | 'DRAW';
  dustEarned: number;
  dustNewBalance: string;
  xpEarned: number;
  xpNewTotal: number;
  oldLevel: number;
  newLevel: number;
  leveledUp: boolean;
}

export interface PersistMatchResult {
  matchId: string;
  eloDeltas?: { player1: number; player2: number } | null;
  /** Map de userId → reward summary. Vacío para BOT players. */
  rewardsByUserId?: Record<string, MatchRewardSummary>;
}

export class ApiClient {
  async persistMatch(input: PersistMatchInput): Promise<PersistMatchResult | null> {
    const url = `${config.API_BASE_URL}/internal/matches`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': config.INTERNAL_SERVICE_TOKEN,
        },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        logger.warn({ status: res.status, body: text }, 'persistMatch failed (non-2xx)');
        return null;
      }
      const data = (await res.json()) as PersistMatchResult;
      return data;
    } catch (err) {
      logger.warn({ err }, 'persistMatch failed (network error)');
      return null;
    }
  }
}

export const apiClient = new ApiClient();
