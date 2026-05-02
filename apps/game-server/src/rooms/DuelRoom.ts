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

  override onDispose(): void {
    this.log.info('DuelRoom disposed');
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
