/**
 * Sala PvP. Authoritative server: el cliente solo envía intenciones,
 * el servidor las valida y muta el estado vía GameEngine.
 *
 * Mensajes del protocolo: ver `events.types.ts` en shared-types.
 */

import { Room, type Client } from 'colyseus';
import { DuelStateSchema } from './schema/DuelStateSchema.js';
import { GameEngine } from '../engine/GameEngine.js';
import { InvalidActionError } from '../engine/ActionValidator.js';
import { gameLogger } from '../logger.js';
import { apiClient } from '../services/ApiClient.js';
import type { Logger } from 'pino';

interface JoinOptions {
  username?: string;
  /** cardIds del Main Deck que el cliente trae. En Fase 0 aceptamos cualquier lista; Fase 2 valida con DB. */
  mainDeckCardIds?: string[];
  extraDeckCardIds?: string[];
  mode?: 'PvP_Casual' | 'PvP_Ranked' | 'PvP_RankedNFT';
}

export class DuelRoom extends Room {
  override maxClients = 2;
  declare state: DuelStateSchema;
  private engine!: GameEngine;
  private log!: Logger;
  private startedAt = 0;
  private persisted = false;

  override onCreate(options: { mode?: string }): void {
    const initial = new DuelStateSchema();
    initial.matchId = this.roomId;
    initial.mode = options.mode ?? 'PvP_Casual';
    this.setState(initial);

    this.log = gameLogger(this.roomId);
    this.engine = new GameEngine(this.state, this.log, `seed_${this.roomId}`);

    this.onMessage('NORMAL_SUMMON', (client, raw) => this.safeAction(client, () => this.engine.handleNormalSummon(client.sessionId, raw)));
    this.onMessage('DECLARE_ATTACK', (client, raw) => this.safeAction(client, () => this.engine.handleDeclareAttack(client.sessionId, raw)));
    this.onMessage('ACTIVATE_EFFECT', (client, raw) => this.safeAction(client, () => this.engine.handleActivateEffect(client.sessionId, raw)));
    this.onMessage('SET_CARD', (client, raw: unknown) => this.safeAction(client, () => {
      const id = (raw as { cardInstanceId?: string })?.cardInstanceId;
      if (!id) throw new InvalidActionError('CARD_NOT_IN_HAND', 'cardInstanceId required');
      this.engine.handleSetCard(client.sessionId, id);
    }));
    this.onMessage('END_PHASE', (client) => this.safeAction(client, () => this.engine.handleEndPhase(client.sessionId)));
    this.onMessage('SURRENDER', (client) => {
      const winner = [...this.state.players.keys()].find((id) => id !== client.sessionId);
      this.state.status = 'GAME_OVER';
      if (winner) this.state.winnerId = winner;
      this.state.winReason = 'SURRENDER';
    });

    this.log.info('DuelRoom created');
  }

  override async onJoin(client: Client, options: JoinOptions = {}): Promise<void> {
    const isFirst = this.state.players.size === 0;
    this.engine.setupPlayer({
      id: client.sessionId,
      username: options.username ?? `player_${client.sessionId.slice(0, 6)}`,
      mainDeckCardIds: options.mainDeckCardIds ?? this.dummyDeck(),
      ...(options.extraDeckCardIds ? { extraDeckCardIds: options.extraDeckCardIds } : {}),
      isFirstPlayer: isFirst,
    });
    this.log.info({ player: client.sessionId, isFirst }, 'player joined');

    if (this.state.players.size === 2) {
      this.engine.startMatch();
      this.startedAt = Date.now();
    }
  }

  override onLeave(client: Client): void {
    // Fase 0: derrota inmediata. Fase 3 implementará reconnect token + 60s grace.
    if (this.state.status !== 'GAME_OVER') {
      const winner = [...this.state.players.keys()].find((id) => id !== client.sessionId);
      if (winner) this.state.winnerId = winner;
      this.state.status = 'GAME_OVER';
      this.state.winReason = 'DISCONNECT_TIMEOUT';
    }
    this.log.info({ player: client.sessionId }, 'player left');
  }

  override async onDispose(): Promise<void> {
    await this.persistMatchIfNeeded();
    this.log.info('DuelRoom disposed');
  }

  /**
   * Persiste el Match en Postgres vía /internal/matches del API.
   * Idempotente — `this.persisted` previene doble-call si onLeave + onDispose disparan.
   */
  private async persistMatchIfNeeded(): Promise<void> {
    if (this.persisted) return;
    if (this.state.status !== 'GAME_OVER' && this.state.players.size < 2) {
      // Sala se descartó sin haberse iniciado → no hay match que persistir.
      return;
    }
    this.persisted = true;
    const playerIds = [...this.state.players.keys()];
    const player1Id = playerIds[0] ?? '';
    const player2Id = playerIds[1] ?? null;
    const winnerId = this.state.winnerId || null;
    const duration = this.startedAt ? Math.round((Date.now() - this.startedAt) / 1000) : 0;
    // Final entry del replay: GAME_OVER.
    this.engine.replay.log('GAME_OVER', winnerId ?? undefined, {
      reason: this.state.winReason,
    });
    const result = await apiClient.persistMatch({
      player1Id,
      player2Id,
      winnerId,
      mode: this.state.mode as 'PvE' | 'PvP_Casual' | 'PvP_Ranked' | 'PvP_RankedNFT',
      duration,
      turnsPlayed: this.state.turnNumber,
      ...(this.state.winReason ? { reason: this.state.winReason } : {}),
      replayLog: this.engine.replay.serialize(),
    });
    if (result) {
      this.log.info(
        { matchId: result.matchId, replayEntries: this.engine.replay.size() },
        'match persisted to API',
      );
    }
  }

  private safeAction(client: Client, fn: () => void): void {
    try {
      fn();
    } catch (err) {
      if (err instanceof InvalidActionError) {
        client.send('ERROR', { code: err.code, message: err.message });
        return;
      }
      this.log.error({ err }, 'unhandled action error');
      client.send('ERROR', { code: 'INTERNAL_ERROR', message: 'Internal error' });
    }
  }

  /** Mazo dummy de 40 cartas para testing. Fase 2 lo reemplaza por el deck real del usuario. */
  private dummyDeck(): string[] {
    const ids: string[] = [];
    const monsters = ['mon_beast_001', 'mon_aqua_001', 'mon_plant_001'];
    const spells = ['spl_001', 'spl_002', 'spl_003'];
    const traps = ['trp_001', 'trp_002'];
    for (const id of monsters) ids.push(id, id, id);
    for (const id of spells) ids.push(id, id, id);
    for (const id of traps) ids.push(id, id, id);
    while (ids.length < 40) ids.push('mon_beast_001');
    return ids.slice(0, 40);
  }
}
