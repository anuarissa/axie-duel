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
import { apiClient } from '../services/ApiClient.js';
import type { OnBattleResolveEvent, OnSpellActivatedEvent, OnSummonEvent } from '../engine/EventBus.js';
import type { Logger } from 'pino';

interface JoinOptions {
  username?: string;
  difficulty?: BotDifficulty;
  /** Si presente, el game-server hace fetch a /internal/decks/:id en api para obtener
   * la composición real del deck activo del jugador. Si no, usa VARIED_PLAYER_DECK fallback. */
  deckId?: string;
  /** Lista plana inline de cardIds (típicamente del localStorage `user_active_deck`).
   * Tiene PRIORIDAD sobre deckId — evita el HTTP round-trip al api cuando el cliente
   * ya tiene la composición del deck activo cacheada. */
  cardIds?: string[];
  /** 'normal' = bot pausa 1500ms entre acciones (legible). 'fast' = sin pausa (testing). */
  botSpeed?: 'normal' | 'fast';
  /** userId real del jugador (decoded del JWT cliente). Necesario para que api persista
   * el match en su cuenta y otorgue LC + quests + W/L counters. Si null → solo se persiste
   * con sessionId (test mode, sin rewards). */
  userId?: string;
  /** Resultado del RPS pre-match: 'me' = el jugador humano va primero. 'opponent' = bot. Default 'me'. */
  firstPlayer?: 'me' | 'opponent';
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

/**
 * Decks rebalanceados con la "Proporción de Oro TCG" para 40 cartas:
 *   - 18-20 monstruos L1-4   (jugables sin tribute → evita "bricking")
 *   - 6-8 monstruos L5-8     (juego tardío + targets para tribute)
 *   - 12-14 spells/traps     (interacción + counter-play)
 *
 * Card levels (referencia):
 *   mon_plant_001  L3 (no-tribute)
 *   mon_beast_001  L4 (no-tribute)
 *   mon_aqua_001   L5 (1 tribute)
 *   mon_bird_001   L7 (2 tributes)
 *   mon_reptile_001 L8 (2 tributes)
 */

// Deck del jugador por defecto (cuando no tiene deck activo): balanceado, defensivo.
const VARIED_PLAYER_DECK: string[] = [
  // 19 monsters L1-4 (jugables sin tribute)
  ...Array<string>(10).fill('mon_beast_001'),  // L4 (1700/1200) ×10
  ...Array<string>(9).fill('mon_plant_001'),   // L3 (800/1900) ×9
  // 7 monsters L5-8 (mid/late game)
  ...Array<string>(4).fill('mon_aqua_001'),    // L5 (2100/1800) ×4
  ...Array<string>(2).fill('mon_bird_001'),    // L7 (2500/1500) ×2
  ...Array<string>(1).fill('mon_reptile_001'), // L8 (2800/2400) ×1
  // 14 spells/traps (interacción)
  ...Array<string>(2).fill('spl_001'),
  ...Array<string>(1).fill('spl_002'),
  ...Array<string>(1).fill('spl_003'),
  ...Array<string>(1).fill('spl_004'),
  ...Array<string>(2).fill('spl_005'),
  ...Array<string>(2).fill('trp_001'),
  ...Array<string>(2).fill('trp_002'),
  ...Array<string>(1).fill('trp_003'),
  ...Array<string>(1).fill('trp_004'),
  ...Array<string>(1).fill('trp_005'),
];

// Bot Novato — mazo débil, mostly low-level, casi sin spells/traps.
// 22 monsters L1-4 + 4 monsters L5+ + 14 spells/traps básicos
const NOVATO_BOT_DECK: string[] = [
  ...Array<string>(12).fill('mon_beast_001'),  // L4
  ...Array<string>(10).fill('mon_plant_001'),  // L3
  ...Array<string>(3).fill('mon_aqua_001'),    // L5
  ...Array<string>(1).fill('mon_bird_001'),    // L7
  ...Array<string>(3).fill('spl_001'),
  ...Array<string>(2).fill('spl_005'),
  ...Array<string>(3).fill('trp_001'),
  ...Array<string>(3).fill('trp_002'),
  ...Array<string>(3).fill('trp_004'),
];

// Bot Avanzado — mazo balanceado golden ratio.
// 19 monsters L1-4 + 7 monsters L5+ + 14 spells/traps
const AVANZADO_BOT_DECK: string[] = [
  ...Array<string>(9).fill('mon_beast_001'),
  ...Array<string>(10).fill('mon_plant_001'),
  ...Array<string>(4).fill('mon_aqua_001'),
  ...Array<string>(2).fill('mon_bird_001'),
  ...Array<string>(1).fill('mon_reptile_001'),
  ...Array<string>(2).fill('spl_001'),
  ...Array<string>(2).fill('spl_003'),
  ...Array<string>(1).fill('spl_004'),
  ...Array<string>(2).fill('spl_005'),
  ...Array<string>(2).fill('trp_001'),
  ...Array<string>(2).fill('trp_002'),
  ...Array<string>(1).fill('trp_004'),
  ...Array<string>(2).fill('trp_005'),
];

// Bot Experto — mazo meta optimizado, foco en high-level vía tribute fodder.
// 18 monsters L1-4 (FODDER masivo para tributos) + 8 monsters L5+ + 14 spells/traps top-tier
const EXPERTO_BOT_DECK: string[] = [
  ...Array<string>(8).fill('mon_beast_001'),
  ...Array<string>(10).fill('mon_plant_001'),  // ALTA DEF — tribute fodder ideal
  ...Array<string>(4).fill('mon_aqua_001'),    // L5 con draw extra
  ...Array<string>(2).fill('mon_bird_001'),    // L7 alta ATK
  ...Array<string>(2).fill('mon_reptile_001'), // L8 piercing direct
  ...Array<string>(2).fill('spl_001'),         // duelLock
  ...Array<string>(1).fill('spl_002'),         // tribute draw
  ...Array<string>(2).fill('spl_003'),         // continuousAura
  ...Array<string>(1).fill('spl_004'),         // fieldTrigger
  ...Array<string>(2).fill('spl_005'),         // equip +500
  ...Array<string>(2).fill('trp_002'),         // negateAttack
  ...Array<string>(2).fill('trp_003'),         // counter trap
  ...Array<string>(2).fill('trp_005'),         // burn 1000
];

const BOT_DECKS: Record<BotDifficulty, string[]> = {
  Easy:   NOVATO_BOT_DECK,
  Normal: AVANZADO_BOT_DECK,
  Hard:   EXPERTO_BOT_DECK,
};

/** Helper para imprimir composición de un deck — útil al loadear. */
function logDeckComposition(label: string, deck: string[], cardLookup: (id: string) => { type?: string; level?: number | null } | undefined, log: Logger): void {
  const counts = { lowMon: 0, highMon: 0, spell: 0, trap: 0, unknown: 0 };
  for (const id of deck) {
    const c = cardLookup(id);
    if (!c) { counts.unknown++; continue; }
    if (c.type === 'Monster') {
      const lvl = c.level ?? 0;
      if (lvl <= 4) counts.lowMon++;
      else counts.highMon++;
    } else if (c.type === 'Spell') counts.spell++;
    else if (c.type === 'Trap') counts.trap++;
  }
  log.info(
    {
      deck: label,
      total: deck.length,
      monstersLow: `${counts.lowMon} (target 18-20)`,
      monstersHigh: `${counts.highMon} (target 6-8)`,
      spellsTraps: `${counts.spell + counts.trap} (target 12-14)`,
      breakdown: counts,
    },
    `[deck-balance] ${label} composition`,
  );
}

export class PvERoom extends Room {
  override maxClients = 1;
  declare state: DuelStateSchema;
  private engine!: GameEngine;
  private bot!: PvEBot;
  private log!: Logger;
  /** Resolver del Promise pendiente cuando el bot espera respuesta del jugador a su trap. */
  private pendingTrapResolver: ((trapInstanceId: string | null) => void) | null = null;
  private pendingTrapTimeout: ReturnType<typeof setTimeout> | null = null;
  /** Timer interval que verifica turnDeadlineMs y auto-termina el turno del humano si expira. */
  private turnTimerInterval: ReturnType<typeof setInterval> | null = null;
  /** Idempotencia: evita doble persist si onLeave + onDispose disparan. */
  private persisted = false;
  private startedAt = 0;
  /** sessionId del cliente humano (para mapear a userId real al persistir). */
  private humanSessionId = '';
  /** userId real del jugador (autenticado). Lo necesitamos para que api persista en su cuenta. */
  private humanUserId = '';
  /** Dificultad del bot — se persiste en el Match para que api aplique reward multiplier. */
  private botDifficulty: BotDifficulty = 'Easy';

  override onCreate(options: { difficulty?: BotDifficulty } = {}): void {
    const initial = new DuelStateSchema();
    initial.matchId = this.roomId;
    initial.mode = 'PvE';
    this.setState(initial);
    this.log = gameLogger(this.roomId);
    this.engine = new GameEngine(this.state, this.log, `pve_${this.roomId}`);

    this.onMessage('NORMAL_SUMMON', (client, raw) => this.safeAction(client, () => {
      this.engine.handleNormalSummon(client.sessionId, raw);
    }));
    this.onMessage('DECLARE_ATTACK', async (client, raw) => {
      // Async handler: tras combate, si MI atacante destruyó un enemigo Y tengo face-down
      // burn traps, ofrecer activar (Lethal Strike post-combat trigger).
      let result;
      try {
        result = this.engine.handleDeclareAttack(client.sessionId, raw);
      } catch (err) {
        if (err instanceof InvalidActionError) {
          client.send('ERROR', { code: err.code, message: err.message });
        } else {
          this.log.error({ err }, 'declareAttack crashed');
          client.send('ERROR', { code: 'INTERNAL_ERROR', message: 'Internal error' });
        }
        this.maybePersistOnGameOver();
        return;
      }
      // Post-combat burn trap prompt: solo si el atacante humano destruyó al defender.
      if (!result.cancelled && result.defenderDestroyed && client.sessionId !== 'BOT' && this.state.status !== 'GAME_OVER') {
        const me = this.state.players.get(client.sessionId);
        if (me) {
          const burnTraps = me.spellTrapZones.filter((c) => {
            if (!c.instanceId || !c.faceDown) return false;
            const def = this.engine.cards.getById(c.cardId);
            return def?.type === 'Trap' && def.effect?.kind === 'burn';
          });
          if (burnTraps.length > 0) {
            try {
              const chosenTrapId = await this.askPlayerTrapResponse(
                client.sessionId,
                burnTraps.map((t) => ({ instanceId: t.instanceId, cardId: t.cardId })),
                'post-combat',
              );
              if (chosenTrapId) {
                this.engine.handleActivateEffect(client.sessionId, { cardInstanceId: chosenTrapId, targets: [] });
              }
            } catch (err) {
              this.log.error({ err }, 'post-combat burn trap activation failed');
            }
          }
        }
      }
      this.maybePersistOnGameOver();
    });
    this.onMessage('ACTIVATE_EFFECT', (client, raw) => this.safeAction(client, () => this.engine.handleActivateEffect(client.sessionId, raw)));
    this.onMessage('SET_CARD', (client, raw: unknown) => this.safeAction(client, () => {
      const id = (raw as { cardInstanceId?: string })?.cardInstanceId;
      if (!id) throw new InvalidActionError('CARD_NOT_IN_HAND', 'cardInstanceId required');
      this.engine.handleSetCard(client.sessionId, id);
      // Broadcast narración (no leakea qué carta es — solo el tipo).
      const cardDef = this.engine.cards.getById(
        this.state.players.get(client.sessionId)?.spellTrapZones.find((c) => c.instanceId === id)?.cardId ?? '',
      );
      this.broadcastEvent('SET_CARD', client.sessionId, {
        kind: cardDef?.type === 'Trap' ? 'Trap' : 'Spell',
        cardName: cardDef?.name,
      });
    }));
    this.onMessage('CHANGE_POSITION', (client, raw) => this.safeAction(client, () => this.engine.handleChangePosition(client.sessionId, raw)));
    this.onMessage('END_PHASE', (client) => {
      const prevPhase = this.state.phase;
      const prevTurn = this.state.turnNumber;
      this.safeAction(client, () => this.engine.handleEndPhase(client.sessionId));
      // Narración del cambio.
      if (this.state.turnNumber !== prevTurn) {
        this.broadcastEvent('TURN_START', this.state.activePlayerId, {
          turnNumber: this.state.turnNumber,
        });
      }
      if (this.state.phase !== prevPhase) {
        this.broadcastEvent('PHASE_CHANGE', this.state.activePlayerId, {
          fromPhase: prevPhase,
          toPhase: this.state.phase,
        });
      }
      // Si tras avanzar quedó END phase + el jugador activo tiene discard pendiente,
      // notificar al cliente para que muestre el modal de discard.
      const active = this.state.players.get(this.state.activePlayerId);
      if (active && this.state.phase === 'END' && active.pendingHandLimitDiscard > 0) {
        client.send('HAND_LIMIT_DISCARD_REQUIRED', {
          count: active.pendingHandLimitDiscard,
          handLimit: 6,
        });
      }
      this.maybeRunBot();
    });
    this.onMessage('HAND_LIMIT_DISCARD', (client, raw: unknown) => this.safeAction(client, () => {
      const ids = (raw as { cardInstanceIds?: string[] })?.cardInstanceIds;
      if (!Array.isArray(ids)) {
        throw new InvalidActionError('TARGET_INVALID', 'cardInstanceIds[] required');
      }
      this.engine.handleHandLimitDiscard(client.sessionId, ids);
      this.broadcast('HAND_LIMIT_DISCARD_RESOLVED', {
        ownerId: client.sessionId,
        count: ids.length,
      });
    }));
    this.onMessage('SURRENDER', () => {
      this.state.status = 'GAME_OVER';
      this.state.winnerId = 'BOT';
      this.state.winReason = 'SURRENDER';
      this.maybePersistOnGameOver();
    });

    this.onMessage('SET_BOT_SPEED', (_client, raw) => {
      const speed = (raw as { speed?: 'normal' | 'fast' })?.speed;
      if (speed === 'normal' || speed === 'fast') this.setBotSpeed(speed);
    });

    this.onMessage('TRAP_RESPONSE', (_client, raw) => {
      const trapId = (raw as { trapInstanceId?: string | null })?.trapInstanceId ?? null;
      if (this.pendingTrapResolver) {
        if (this.pendingTrapTimeout) clearTimeout(this.pendingTrapTimeout);
        const resolver = this.pendingTrapResolver;
        this.pendingTrapResolver = null;
        this.pendingTrapTimeout = null;
        resolver(trapId);
      }
    });

    // Broadcast narración de invocaciones (cubre player Y bot).
    const cardDb = this.engine.cards;
    this.engine.events.on<OnSummonEvent>('onSummon', (e) => {
      const def = cardDb.getById(e.monster.cardId);
      this.broadcastEvent('SUMMON', e.ownerId, {
        cardName: def?.name ?? e.monster.cardId,
        position: e.monster.position,
        method: e.method,
      });
      // Si el monster tiene efecto triggered (onDeployHeal, beastSwarm, etc.), notificar al cliente
      // para que muestre toast "¡Efecto Activado!". Filtramos a monster (Spells usan CARD_ACTIVATED).
      if (def?.type === 'Monster' && def.effect) {
        this.broadcast('CARD_EFFECT_ACTIVATED', {
          ownerId: e.ownerId,
          cardName: def.name,
          cardId: def.id,
          effectKind: def.effect.kind,
          trigger: 'onSummon',
        });
      }
      // Detectar si una Field Spell del owner aplicó modificador a este summon (ej: Sky Mavis Field).
      // El handler de fieldTriggerFactory ya mutó event.monster.atkMod en este punto;
      // recorremos los spell zones del owner para identificar cuál Field reaccionó.
      const owner = this.state.players.get(e.ownerId);
      if (owner) {
        for (const sp of owner.spellTrapZones) {
          if (!sp.instanceId) continue;
          const spDef = cardDb.getById(sp.cardId);
          if (spDef?.type === 'Spell' && spDef.effect?.kind === 'fieldTrigger') {
            const atkBonus = (spDef.effect.params?.atkBonus as number) ?? 300;
            this.broadcast('CARD_EFFECT_TRIGGERED', {
              sourceOwnerId: e.ownerId,
              sourceCardName: spDef.name,
              sourceCardId: spDef.id,
              targetInstanceId: e.monster.instanceId,
              effectKind: 'fieldTrigger',
              delta: { atk: atkBonus },
            });
          }
        }
      }
    });

    // Broadcast cuando un monster muere (Backdoor Bird onDeathDirectDamage,
    // Terminator Reptile onDeathPermanentDebuff) — si tiene efecto triggered, notificar al cliente.
    this.engine.events.on('onDeath', (e) => {
      if (e.type !== 'onDeath') return;
      const def = cardDb.getById(e.deceased.cardId);
      if (def?.type === 'Monster' && def.effect) {
        this.broadcast('CARD_EFFECT_ACTIVATED', {
          ownerId: e.deceasedOwnerId,
          cardName: def.name,
          cardId: def.id,
          effectKind: def.effect.kind,
          trigger: 'onDeath',
        });
      }
    });

    // Broadcast del resultado de cada combate (cubre ataques del jugador Y del bot).
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
        matchup: e.outcome.matchup,
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
    // Capturar userId real (para persistir el match en su cuenta) + start timestamp.
    this.humanSessionId = client.sessionId;
    if (options.userId) this.humanUserId = options.userId;
    this.startedAt = Date.now();

    // Priority: inline cardIds (localStorage) > deckId fetch from api > VARIED_PLAYER_DECK fallback.
    // Validamos que todos los cardIds existan en el catálogo antes de aceptarlos.
    let playerDeck = VARIED_PLAYER_DECK;
    if (Array.isArray(options.cardIds) && options.cardIds.length > 0) {
      const valid = options.cardIds.filter((id) => this.engine.cards.getById(id));
      if (valid.length > 0) {
        playerDeck = valid;
        this.log.info({ cardCount: valid.length, dropped: options.cardIds.length - valid.length }, 'using inline cardIds (localStorage)');
      } else {
        this.log.warn({ provided: options.cardIds.length }, 'inline cardIds all invalid, falling back to deckId or default');
      }
    }
    if (playerDeck === VARIED_PLAYER_DECK && options.deckId) {
      const fetched = await fetchDeckCards(options.deckId, this.log);
      if (fetched) {
        playerDeck = fetched;
        this.log.info({ deckId: options.deckId, cardCount: fetched.length }, 'using player active deck (api fetch)');
      } else {
        this.log.info({ deckId: options.deckId }, 'deck fetch failed, using fallback VARIED_PLAYER_DECK');
      }
    }

    const difficulty: BotDifficulty = options.difficulty ?? 'Easy';
    const botDeck = BOT_DECKS[difficulty];
    const botUsername = difficulty === 'Hard' ? 'Experto Bot' : difficulty === 'Normal' ? 'Avanzado Bot' : 'Novato Bot';

    // Print deck composition reports al iniciar el match.
    const lookup = (id: string) => {
      const c = this.engine.cards.getById(id);
      if (!c) return undefined;
      return { type: c.type, level: c.type === 'Monster' ? c.level : null };
    };
    logDeckComposition('Player', playerDeck, lookup, this.log);
    logDeckComposition(`Bot[${difficulty}]`, botDeck, lookup, this.log);

    // RPS pre-match decide turn order. Default 'me' (humano primero) si no viene la flag.
    const humanGoesFirst = (options.firstPlayer ?? 'me') === 'me';
    this.engine.setupPlayer({
      id: client.sessionId,
      username: options.username ?? 'You',
      mainDeckCardIds: playerDeck,
      isFirstPlayer: humanGoesFirst,
    });
    this.engine.setupPlayer({
      id: 'BOT',
      username: botUsername,
      mainDeckCardIds: botDeck,
      isFirstPlayer: !humanGoesFirst,
    });
    this.log.info({ humanGoesFirst, requested: options.firstPlayer ?? 'me' }, '[rps] turn order set');
    this.botDifficulty = difficulty;
    this.bot = new PvEBot(this.engine, 'BOT', difficulty);
    this.bot.actionDelayMs = options.botSpeed === 'fast' ? 0 : 1500;
    // Cuando el bot va a atacar, preguntar al jugador si quiere activar alguna trap SET.
    this.bot.onBeforeAttack = (defenderId, traps, attackInfo) => {
      // Resolver nombres legibles para el cliente.
      const cardDb = this.engine.cards;
      const attackerDef = cardDb.getById(attackInfo.attackerCardId);
      const targetDef = attackInfo.targetCardId ? cardDb.getById(attackInfo.targetCardId) : undefined;
      return this.askPlayerTrapResponse(defenderId, traps, 'pre-attack', {
        attackerInstanceId: attackInfo.attackerInstanceId,
        attackerName: attackerDef?.name ?? attackInfo.attackerCardId,
        targetInstanceId: attackInfo.targetInstanceId,
        ...(targetDef?.name ? { targetName: targetDef.name } : {}),
      });
    };
    this.engine.startMatch();
    // Si el RPS dio que el bot va primero, schedulear su turno inicial inmediatamente.
    if (!humanGoesFirst) this.maybeRunBot();
    // Iniciar timer de turno: cada 1s chequea si el deadline expiró durante turno humano.
    this.turnTimerInterval = setInterval(() => this.checkTurnTimeout(), 1000);
  }

  /**
   * Auto-end del turno cuando expira turnDeadlineMs. Solo dispara si:
   *  - el match está IN_PROGRESS
   *  - el activePlayer es el humano (sessionId !== 'BOT')
   *  - el deadline ya pasó (Date.now() >= turnDeadlineMs)
   * Avanza la fase repetidamente hasta llegar a DRAW del oponente (turn change).
   */
  private checkTurnTimeout(): void {
    if (this.state.status !== 'IN_PROGRESS') return;
    if (!this.state.turnDeadlineMs || Date.now() < this.state.turnDeadlineMs) return;
    if (this.state.activePlayerId === 'BOT' || this.state.activePlayerId !== this.humanSessionId) return;
    // Si hay un trap prompt pendiente, no force-end — el user puede estar respondiendo.
    if (this.pendingTrapResolver) return;
    this.log.info({ player: this.state.activePlayerId }, 'turn timer expired — auto-ending turn');
    // Avanzar fases hasta cambio de turno. Limitado a 7 advances (DRAW→...→END→DRAW).
    let safetyCount = 0;
    const initialTurn = this.state.turnNumber;
    while (this.state.turnNumber === initialTurn && safetyCount < 8 && this.state.status === 'IN_PROGRESS') {
      try {
        this.engine.handleEndPhase(this.state.activePlayerId);
      } catch (err) {
        this.log.warn({ err }, 'turn timer auto-end: handleEndPhase threw, breaking');
        break;
      }
      safetyCount++;
    }
    // Avisar al cliente que el turno se acabó por timeout.
    this.broadcast('TURN_TIMEOUT', { previousPlayerId: this.humanSessionId });
    this.maybeRunBot();
  }

  /** Cambio en runtime del pacing del bot (sin reconexión). */
  public setBotSpeed(speed: 'normal' | 'fast'): void {
    if (this.bot) this.bot.actionDelayMs = speed === 'fast' ? 0 : 1500;
  }

  /**
   * Broadcast TRAP_RESPONSE_PROMPT al cliente del defender + espera su respuesta.
   * Resuelve con el trapInstanceId a activar o null (pasar / timeout 6s).
   * @param phase 'pre-attack' (defensor de un ataque entrante) o 'post-combat'
   *              (atacante post-destrucción de enemigo, ej Lethal Strike). Cliente usa
   *              esto para mostrar el texto del prompt apropiado.
   * @param attackInfo opcional: cuando phase='pre-attack', info del atacante y target
   *              para que el cliente muestre claramente quién ataca a quién o si es
   *              ataque directo. Se renderiza una flecha visual sobre el campo.
   */
  private askPlayerTrapResponse(
    defenderId: string,
    traps: Array<{ instanceId: string; cardId: string }>,
    phase: 'pre-attack' | 'post-combat' = 'pre-attack',
    attackInfo?: {
      attackerInstanceId: string;
      attackerName: string;
      targetInstanceId: string | 'DIRECT';
      targetName?: string;
    },
  ): Promise<string | null> {
    if (traps.length === 0) return Promise.resolve(null);
    const cardDb = this.engine.cards;
    const trapsWithNames = traps.map((t) => {
      const def = cardDb.getById(t.cardId);
      return {
        instanceId: t.instanceId,
        name: def?.name ?? t.cardId,
        description: def?.description ?? '',
        kind: def?.effect?.kind ?? '',
      };
    });
    const TIMEOUT_MS = 6000;
    return new Promise<string | null>((resolve) => {
      // Si ya había un prompt pendiente (no debería), cancelarlo.
      if (this.pendingTrapResolver) {
        this.pendingTrapResolver(null);
        if (this.pendingTrapTimeout) clearTimeout(this.pendingTrapTimeout);
      }
      this.pendingTrapResolver = resolve;
      this.broadcast('TRAP_RESPONSE_PROMPT', {
        defenderId,
        traps: trapsWithNames,
        timeoutMs: TIMEOUT_MS,
        phase,
        ...(attackInfo ? { attackInfo } : {}),
      });
      // Timeout fallback: si el jugador no responde en 6s, default a NO activar.
      this.pendingTrapTimeout = setTimeout(() => {
        if (this.pendingTrapResolver === resolve) {
          this.pendingTrapResolver = null;
          this.pendingTrapTimeout = null;
          resolve(null);
        }
      }, TIMEOUT_MS);
    });
  }

  /** Broadcast estructurado para que el cliente lo agregue al battle log. */
  private broadcastEvent(
    kind: 'SUMMON' | 'SET_CARD' | 'PHASE_CHANGE' | 'TURN_START',
    ownerId: string,
    payload: Record<string, unknown>,
  ): void {
    this.broadcast('GAME_EVENT', { kind, ownerId, ...payload });
  }

  override async onDispose(): Promise<void> {
    if (this.turnTimerInterval) {
      clearInterval(this.turnTimerInterval);
      this.turnTimerInterval = null;
    }
    await this.persistMatchIfNeeded();
    this.log.info('PvERoom disposed');
  }

  /**
   * Persiste el match PvE en api/internal/matches → triggea quests + LC + W/L + notif + drops.
   * Idempotente vía `this.persisted`. Sin userId real → no persiste (sessionId no es User válido).
   */
  private async persistMatchIfNeeded(): Promise<void> {
    if (this.persisted) return;
    if (this.state.status !== 'GAME_OVER') {
      // Match abortado (user salió antes del game over) → no persistir.
      return;
    }
    if (!this.humanUserId) {
      this.log.warn('PvERoom dispose: no humanUserId, skipping persist');
      return;
    }
    this.persisted = true;
    // Mapear winnerId del state (sessionId) a userId real, o BOT.
    const winnerSessionOrBot = this.state.winnerId || null;
    let winnerId: string | null = null;
    if (winnerSessionOrBot === this.humanSessionId) winnerId = this.humanUserId;
    else if (winnerSessionOrBot === 'BOT') winnerId = 'BOT';
    // Empate → winnerId = null

    const duration = Math.round((Date.now() - this.startedAt) / 1000);
    this.engine.replay.log('GAME_OVER', winnerId ?? undefined, {
      reason: this.state.winReason,
    });
    const result = await apiClient.persistMatch({
      player1Id: this.humanUserId,
      player2Id: 'BOT',
      winnerId,
      mode: 'PvE',
      botDifficulty: this.botDifficulty,
      duration,
      turnsPlayed: this.state.turnNumber,
      ...(this.state.winReason ? { reason: this.state.winReason } : {}),
      replayLog: this.engine.replay.serialize(),
    });
    if (result) {
      this.log.info(
        { matchId: result.matchId, userId: this.humanUserId, winnerId },
        'PvE match persisted to API',
      );
      // Push instantáneo del reward summary al cliente humano — evita el polling
      // de /users/me en el cliente. Si el WS ya cerró, no pasa nada.
      const myReward = result.rewardsByUserId?.[this.humanUserId];
      if (myReward && this.humanSessionId) {
        const targetClient = this.clients.find((c) => c.sessionId === this.humanSessionId);
        if (targetClient) {
          targetClient.send('MATCH_REWARDS', {
            matchId: result.matchId,
            ...myReward,
          });
        }
      }
    }
  }

  private maybeRunBot(): void {
    if (this.state.activePlayerId !== 'BOT') return;
    if (this.state.status !== 'IN_PROGRESS') return;
    setTimeout(() => {
      this.bot.takeTurn()
        .catch((err) => { this.log.error({ err }, 'bot turn crashed'); })
        .finally(() => this.maybePersistOnGameOver());
    }, BOT_TURN_DELAY_MS);
  }

  private maybePersistOnGameOver(): void {
    if (this.state.status !== 'GAME_OVER') return;
    if (this.persisted) return;
    this.persistMatchIfNeeded().catch((err) => {
      this.log.error({ err }, 'eager persist failed');
    });
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
    // After every action, if the duel is over, persist immediately so the
    // client's post-game-over LC fetch sees the updated balance.
    this.maybePersistOnGameOver();
  }
}
