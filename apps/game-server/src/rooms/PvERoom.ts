/**
 * Sala PvE. El segundo "jugador" es un bot controlado por `PvEBot`.
 *
 * Flujo: el cliente actúa normalmente con END_PHASE/NORMAL_SUMMON/etc.
 * Cuando el cliente termina su turno, state.activePlayerId pasa a 'BOT' →
 * onMessage END_PHASE detecta el cambio y schedula `bot.takeTurn()`
 * con un pequeño delay (300ms) para que el cliente vea el cambio de turno.
 */

import { Room, type Client } from 'colyseus';
import { DuelStateSchema } from './schema/DuelStateSchema.js';
import { GameEngine } from '../engine/GameEngine.js';
import { InvalidActionError } from '../engine/ActionValidator.js';
import { PvEBot, type BotDifficulty } from '../ai/PvEBot.js';
import { gameLogger } from '../logger.js';
import type { Logger } from 'pino';

interface JoinOptions {
  username?: string;
  difficulty?: BotDifficulty;
}

const BOT_TURN_DELAY_MS = 300;

export class PvERoom extends Room {
  override maxClients = 1;
  declare state: DuelStateSchema;
  private engine!: GameEngine;
  private bot!: PvEBot;
  private log!: Logger;

  override onCreate(options: { difficulty?: BotDifficulty } = {}): void {
    const initial = new DuelStateSchema();
    initial.matchId = this.roomId;
    initial.mode = 'PvE';
    this.setState(initial);
    this.log = gameLogger(this.roomId);
    this.engine = new GameEngine(this.state, this.log, `pve_${this.roomId}`);

    this.onMessage('NORMAL_SUMMON', (client, raw) => this.safeAction(client, () => this.engine.handleNormalSummon(client.sessionId, raw)));
    this.onMessage('DECLARE_ATTACK', (client, raw) => this.safeAction(client, () => this.engine.handleDeclareAttack(client.sessionId, raw)));
    this.onMessage('ACTIVATE_EFFECT', (client, raw) => this.safeAction(client, () => this.engine.handleActivateEffect(client.sessionId, raw)));
    this.onMessage('SET_CARD', (client, raw: unknown) => this.safeAction(client, () => {
      const id = (raw as { cardInstanceId?: string })?.cardInstanceId;
      if (!id) throw new InvalidActionError('CARD_NOT_IN_HAND', 'cardInstanceId required');
      this.engine.handleSetCard(client.sessionId, id);
    }));
    this.onMessage('END_PHASE', (client) => {
      this.safeAction(client, () => this.engine.handleEndPhase(client.sessionId));
      // Si es turno del bot ahora, ejecutarlo después de un pequeño delay.
      this.maybeRunBot();
    });
    this.onMessage('SURRENDER', () => {
      this.state.status = 'GAME_OVER';
      this.state.winnerId = 'BOT';
      this.state.winReason = 'SURRENDER';
    });
  }

  override async onJoin(client: Client, options: JoinOptions = {}): Promise<void> {
    this.engine.setupPlayer({
      id: client.sessionId,
      username: options.username ?? 'You',
      mainDeckCardIds: Array(40).fill('mon_beast_001'),
      isFirstPlayer: true,
    });
    this.engine.setupPlayer({
      id: 'BOT',
      username: 'BotOpponent',
      mainDeckCardIds: Array(40).fill('mon_aqua_001'),
      isFirstPlayer: false,
    });
    this.bot = new PvEBot(this.engine, 'BOT', options.difficulty ?? 'Easy');
    this.engine.startMatch();
  }

  override onDispose(): void {
    this.log.info('PvERoom disposed');
  }

  private maybeRunBot(): void {
    if (this.state.activePlayerId !== 'BOT') return;
    if (this.state.status !== 'IN_PROGRESS') return;
    setTimeout(() => {
      try {
        this.bot.takeTurn();
      } catch (err) {
        this.log.error({ err }, 'bot turn crashed');
      }
    }, BOT_TURN_DELAY_MS);
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
}
