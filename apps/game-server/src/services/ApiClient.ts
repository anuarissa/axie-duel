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
  /** Log determinista de eventos (de ReplayLogger.serialize()). */
  replayLog?: ReadonlyArray<unknown>;
}

export class ApiClient {
  async persistMatch(input: PersistMatchInput): Promise<{ matchId: string } | null> {
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
      const data = (await res.json()) as { matchId: string };
      return data;
    } catch (err) {
      logger.warn({ err }, 'persistMatch failed (network error)');
      return null;
    }
  }
}

export const apiClient = new ApiClient();
