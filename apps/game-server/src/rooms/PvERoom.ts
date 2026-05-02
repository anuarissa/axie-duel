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
import type { OnBattleResolveEvent, OnSpellActivatedEvent } from '../engine/EventBus.js';
import type { Logger } from 'pino';

interface JoinOptions {
  username?: string;
  difficulty?: BotDifficulty;
  /** Si presente, el game-server hace fetch a /internal/decks/:id en api para obtener
   * la composición real del deck activo del jugador. Si no, usa VARIED_PLAYER_DECK fallback. */
  deckId?: string;
}

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? '';

/**
 * Fetch deck cards desde el api (server-to-server). Aplana DeckCard.quantity en lista de cardIds.
 * Si falla (timeout, 404, etc), retorna null y el caller usa fallback.
 */
async function fetchDeckCards(deckId: string, log: Logger): Promise<string[] | null> {
  try {
    const r = await fetch(`${API_BASE_URL}/internal/decks/${deckId}`, {
      headers: { 'X-Internal-Token': INTERNAL_TOKEN },
    });
    if (!r.ok) {
      log.warn({ deckId, status: r.status }, 'fetchDeckCards: non-OK response');
      return null;
    }
    const body = (await r.json()) as { mainCardIds?: string[] };
    if (!Array.isArray(body.mainCardIds) || body.mainCardIds.length === 0) {
      log.warn({ deckId }, 'fetchDeckCards: empty mainCardIds');
      return null;
    }
    return body.mainCardIds;
  } catch (err) {
    log.warn({ err, deckId }, 'fetchDeckCards: failed');
    return null;
  }
}

const BOT_TURN_DELAY_MS = 300;

// Deck de 40 cartas con variedad: bias a low-level monsters (la UI no soporta tribute aún),
// más spells y traps para mostrar las 3 categorías. Total = 40.
const VARIED_PLAYER_DECK: string[] = [
  // Monsters low-level (jugables sin tribute) — 12
  ...Array<string>(6).fill('mon_beast_001'),   // Olek (L4, 1700/1200)
  ...Array<string>(6).fill('mon_plant_001'),   // (L3)
  // Monsters mid/high — 6 (requieren tribute, para mostrar variedad)
  ...Array<string>(3).fill('mon_aqua_001'),    // (L5)
  ...Array<string>(2).fill('mon_bird_001'),    // (L7)
  ...Array<string>(1).fill('mon_reptile_001'), // (L8)
  // Spells — 10
  ...Array<string>(2).fill('spl_001'),
  ...Array<string>(2).fill('spl_002'),
  ...Array<string>(2).fill('spl_003'),
  ...Array<string>(2).fill('spl_004'),
  ...Array<string>(2).fill('spl_005'),
  // Traps — 12
  ...Array<string>(3).fill('trp_001'),
  ...Array<string>(3).fill('trp_002'),
  ...Array<string>(2).fill('trp_003'),
  ...Array<string>(2).fill('trp_004'),
  ...Array<string>(2).fill('trp_005'),
];

const VARIED_BOT_DECK: string[] = [
  // Bot deck similar pero con shuffle distinto — el server ya hace shuffle por seed.
  ...Array<string>(8).fill('mon_aqua_001'),
  ...Array<string>(6).fill('mon_beast_001'),
  ...Array<string>(4).fill('mon_plant_001'),
  ...Array<string>(2).fill('mon_bird_001'),
  ...Array<string>(2).fill('spl_001'),
  ...Array<string>(2).fill('spl_002'),
  ...Array<string>(2).fill('spl_003'),
  ...Array<string>(2).fill('spl_004'),
  ...Array<string>(2).fill('spl_005'),
  ...Array<string>(2).fill('trp_001'),
  ...Array<string>(2).fill('trp_002'),
  ...Array<string>(2).fill('trp_003'),
  ...Array<string>(2).fill('trp_004'),
  ...Array<string>(2).fill('trp_005'),
];

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
    this.onMessage('CHANGE_POSITION', (client, raw) => this.safeAction(client, () => this.engine.handleChangePosition(client.sessionId, raw)));
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

    // Broadcast del resultado de cada combate (cubre ataques del jugador Y del bot).
    const cardDb = this.engine.cards;
    this.engine.events.on<OnBattleResolveEvent>('onBattleResolve', (e) => {
      const attackerDef = cardDb.getById(e.attacker.cardId);
      const defenderDef = e.defender ? cardDb.getById(e.defender.cardId) : null;
      this.broadcast('COMBAT_RESULT', {
        attackerOwnerId: e.attackerOwnerId,
        defenderOwnerId: e.defenderOwnerId,
        attackerInstanceId: e.attacker.instanceId,
        defenderInstanceId: e.defender?.instanceId,
        attackerName: attackerDef?.name ?? e.attacker.cardId,
        defenderName: defenderDef?.name,
        direct: e.outcome.direct,
        attackerDestroyed: e.outcome.attackerDestroyed,
        defenderDestroyed: e.outcome.defenderDestroyed,
        damageToAttackerOwner: e.outcome.damageToAttackerOwner,
        damageToDefenderOwner: e.outcome.damageToDefenderOwner,
        advantageBonus: e.outcome.advantageBonus,
        effectiveAtk: e.outcome.effectiveAtk,
        attackerClass: e.outcome.attackerClass,
        defenderClass: e.outcome.defenderClass,
      });
    });

    // También broadcast cuando un Spell o Trap se activa, para feedback visual.
    this.engine.events.on<OnSpellActivatedEvent>('onSpellActivated', (e) => {
      const def = cardDb.getById(e.source.cardId);
      this.broadcast('CARD_ACTIVATED', {
        ownerId: e.ownerId,
        cardName: def?.name ?? e.source.cardId,
        kind: 'Spell',
        cancelled: e.cancelled,
      });
    });
  }

  override async onJoin(client: Client, options: JoinOptions = {}): Promise<void> {
    // Intentar usar el deck del usuario si pasó deckId.
    let playerDeck = VARIED_PLAYER_DECK;
    if (options.deckId) {
      const fetched = await fetchDeckCards(options.deckId, this.log);
      if (fetched) {
        playerDeck = fetched;
        this.log.info({ deckId: options.deckId, cardCount: fetched.length }, 'using player active deck');
      } else {
        this.log.info({ deckId: options.deckId }, 'deck fetch failed, using fallback VARIED_PLAYER_DECK');
      }
    }

    this.engine.setupPlayer({
      id: client.sessionId,
      username: options.username ?? 'You',
      mainDeckCardIds: playerDeck,
      isFirstPlayer: true,
    });
    this.engine.setupPlayer({
      id: 'BOT',
      username: 'BotOpponent',
      mainDeckCardIds: VARIED_BOT_DECK,
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
