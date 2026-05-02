/**
 * Sala PvE. El segundo "jugador" es un bot controlado por `PvEBot`.
 * Fase 0: esqueleto. Fase 4: behavior tree completo + dificultades.
 */

import { Room, type Client } from 'colyseus';
import { DuelStateSchema } from './schema/DuelStateSchema.js';
import { GameEngine } from '../engine/GameEngine.js';
import { PvEBot, type BotDifficulty } from '../ai/PvEBot.js';
import { gameLogger } from '../logger.js';
import type { Logger } from 'pino';

interface JoinOptions {
  username?: string;
  difficulty?: BotDifficulty;
}

export class PvERoom extends Room {
  override maxClients = 1;
  declare state: DuelStateSchema;
  private engine!: GameEngine;
  private bot!: PvEBot;
  private log!: Logger;

  override onCreate(): void {
    const initial = new DuelStateSchema();
    initial.matchId = this.roomId;
    initial.mode = 'PvE';
    this.setState(initial);

    this.log = gameLogger(this.roomId);
    this.engine = new GameEngine(this.state, this.log, `pve_${this.roomId}`);
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
}
