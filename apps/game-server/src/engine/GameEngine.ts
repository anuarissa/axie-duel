/**
 * Orquestador principal del duelo. La sala (`DuelRoom`) llama a este motor;
 * el motor coordina ActionValidator + SummonSystem + CombatSystem + EffectResolver + PhaseManager.
 *
 * Este es el corazón del juego. Toda mutación del estado pasa por aquí.
 */

import { ArraySchema } from '@colyseus/schema';
import {
  DEFAULT_DUEL_CONFIG,
  MONSTER_ZONES,
  SPELL_TRAP_ZONES,
} from '@axie-duel/game-rules';
import { Phase } from '@axie-duel/shared-types';
import type { DuelStateSchema } from '../rooms/schema/DuelStateSchema.js';
import { CardSchema } from '../rooms/schema/CardSchema.js';
import { PlayerSchema } from '../rooms/schema/PlayerSchema.js';
import { ActionValidator, InvalidActionError } from './ActionValidator.js';
import { CombatSystem } from './CombatSystem.js';
import { SummonSystem } from './SummonSystem.js';
import { EffectResolver } from './EffectResolver.js';
import { PhaseManager } from './PhaseManager.js';
import { DeckManager } from './DeckManager.js';
import { SeededRng } from './rng.js';
import { EventBus } from './EventBus.js';
import { TriggerRegistry } from './TriggerRegistry.js';
import { ReplayLogger } from './ReplayLogger.js';
import { registerTriggersForCard } from '../cards/triggered/registry.js';
import { CardDatabase } from '../cards/CardDatabase.js';
import type { Logger } from 'pino';

export interface SetupPlayerInput {
  id: string;
  username: string;
  /** Lista plana de cardIds del Main Deck (puede haber duplicados hasta 3). */
  mainDeckCardIds: string[];
  extraDeckCardIds?: string[];
  isFirstPlayer: boolean;
}

export class GameEngine {
  public readonly cards: CardDatabase;
  public readonly rng: SeededRng;
  public readonly deckManager: DeckManager;
  public readonly validator: ActionValidator;
  public readonly summon: SummonSystem;
  public readonly combat: CombatSystem;
  public readonly effects: EffectResolver;
  public readonly phases: PhaseManager;
  public readonly events: EventBus;
  public readonly triggers: TriggerRegistry;
  public readonly replay: ReplayLogger;

  constructor(
    private state: DuelStateSchema,
    private log: Logger,
    seed?: string,
  ) {
    this.cards = new CardDatabase();
    this.rng = new SeededRng(seed ?? `${Date.now()}-${Math.random()}`);
    this.state.rngSeed = seed ?? '';
    this.events = new EventBus();
    this.triggers = new TriggerRegistry(this.events);
    this.replay = new ReplayLogger();
    this.deckManager = new DeckManager(this.rng);
    this.validator = new ActionValidator(this.state, this.cards);
    this.summon = new SummonSystem(this.state, this.cards);
    this.combat = new CombatSystem(this.state, this.cards, this.log);
    this.effects = new EffectResolver(this.state, this.cards, this.log);
    this.phases = new PhaseManager(this.state, this.deckManager, this.log);
  }

  /** Inicializa un jugador en el estado: barajea, construye deck, llena zonas vacías. */
  setupPlayer(input: SetupPlayerInput): PlayerSchema {
    const p = new PlayerSchema();
    p.id = input.id;
    p.username = input.username;
    p.lifePoints = DEFAULT_DUEL_CONFIG.initialLifePoints;
    p.deck = this.deckManager.buildDeckFromCardIds(input.id, input.mainDeckCardIds);
    p.extraDeck = this.deckManager.buildDeckFromCardIds(input.id, input.extraDeckCardIds ?? []);
    p.isFirstPlayer = input.isFirstPlayer;
    // Llenar zonas con CardSchema vacíos (slot libre = instanceId = '').
    for (let i = 0; i < MONSTER_ZONES; i++) p.monsterZones.push(new CardSchema());
    for (let i = 0; i < SPELL_TRAP_ZONES; i++) p.spellTrapZones.push(new CardSchema());
    this.deckManager.shuffleDeck(p);
    this.deckManager.draw(p, DEFAULT_DUEL_CONFIG.startingHandSize);
    this.state.players.set(input.id, p);
    return p;
  }

  /** Arranca la partida tras tener 2 jugadores. */
  startMatch(): void {
    const ids = [...this.state.players.keys()];
    if (ids.length !== 2) throw new Error('startMatch requires 2 players');
    const first = [...this.state.players.values()].find((p) => p.isFirstPlayer);
    if (!first) throw new Error('no first player marked');
    this.state.activePlayerId = first.id;
    this.state.turnNumber = 1;
    this.state.status = 'IN_PROGRESS';
    this.state.phase = Phase.DRAW;
    this.state.turnDeadlineMs = Date.now() + DEFAULT_DUEL_CONFIG.turnDurationMs;
    this.replay.start();
    this.replay.log('MATCH_START', undefined, {
      players: ids,
      firstPlayer: first.id,
      seed: this.state.rngSeed,
    });
    this.log.info({ first: first.id }, 'match started');
    // El primer jugador NO roba en su turno 1 (ver shouldDrawInDrawPhase).
    // PhaseManager respeta esa regla en onEnterPhase(DRAW).
  }

  // ── Acciones públicas (la sala las invoca tras Zod-parsing) ──────────────────

  handleNormalSummon(playerId: string, raw: unknown): void {
    const input = this.validator.validateNormalSummon(playerId, raw);
    this.summon.normalSummon(playerId, input.cardInstanceId, input.tributes ?? [], input.position);
    this.replay.log('NORMAL_SUMMON', playerId, {
      cardInstanceId: input.cardInstanceId,
      position: input.position,
      tributes: input.tributes ?? [],
    });
    // Emit onSummon — triggered effects (ej: "field spell que da +300 ATK") corren acá.
    const player = this.state.players.get(playerId);
    const monster = player?.monsterZones.find((c) => c.instanceId === input.cardInstanceId);
    if (monster) {
      this.events.emit({ type: 'onSummon', ownerId: playerId, monster, method: 'normal' });
    }
  }

  handleDeclareAttack(playerId: string, raw: unknown): void {
    const input = this.validator.validateDeclareAttack(playerId, raw);
    const player = this.state.players.get(playerId);
    const attacker = player?.monsterZones.find((c) => c.instanceId === input.attackerInstanceId);
    if (!attacker) {
      throw new InvalidActionError('TARGET_INVALID', 'attacker not on field');
    }
    // Emit onAttackDeclare — handlers como Mirror Web pueden setear cancelled=true.
    const declareEvent = {
      type: 'onAttackDeclare' as const,
      attackerOwnerId: playerId,
      attacker,
      targetInstanceId: input.targetInstanceId,
      cancelled: false,
      attackerAtkPenalty: 0,
    };
    this.events.emit(declareEvent);
    if (declareEvent.cancelled) {
      attacker.hasAttacked = true; // se gasta el ataque del turno aunque sea cancelado
      return;
    }
    if (declareEvent.attackerAtkPenalty > 0) {
      attacker.atkMod -= declareEvent.attackerAtkPenalty;
    }
    const outcome = this.combat.declareAttack(playerId, input.attackerInstanceId, input.targetInstanceId);
    this.replay.log('DECLARE_ATTACK', playerId, {
      attackerInstanceId: input.attackerInstanceId,
      targetInstanceId: input.targetInstanceId,
    });
    this.replay.log('COMBAT_RESOLVED', playerId, { ...outcome });
    // Emit onBattleResolve para handlers tipo Lethal Strike.
    const opponentId = [...this.state.players.keys()].find((id) => id !== playerId);
    const defender =
      input.targetInstanceId !== 'DIRECT' && opponentId
        ? this.state.players.get(opponentId)?.monsterZones.find((c) => c.instanceId === input.targetInstanceId) ?? null
        : null;
    this.events.emit({
      type: 'onBattleResolve',
      attackerOwnerId: playerId,
      defenderOwnerId: opponentId ?? '',
      attacker,
      defender,
      outcome,
    });
  }

  handleActivateEffect(playerId: string, raw: unknown): void {
    const input = this.validator.validateActivateEffect(playerId, raw);
    const player = this.state.players.get(playerId);
    if (!player) throw new InvalidActionError('TARGET_INVALID', 'unknown player');
    const card =
      player.hand.find((c) => c.instanceId === input.cardInstanceId) ??
      player.monsterZones.find((c) => c.instanceId === input.cardInstanceId) ??
      player.spellTrapZones.find((c) => c.instanceId === input.cardInstanceId);
    if (!card) throw new InvalidActionError('CARD_NOT_IN_HAND', 'card not found');

    // Si la carta es Spell, emitir onSpellActivated PRIMERO para que counter
    // traps (negateAndDestroy) tengan ventana de cancelar.
    const def = this.cards.getById(card.cardId);
    if (def?.type === 'Spell') {
      const spellEvent = {
        type: 'onSpellActivated' as const,
        ownerId: playerId,
        source: card,
        cancelled: false,
      };
      this.events.emit(spellEvent);
      this.replay.log('ACTIVATE_EFFECT', playerId, {
        cardInstanceId: input.cardInstanceId,
        targets: input.targets ?? [],
        spellNegated: spellEvent.cancelled,
      });
      if (spellEvent.cancelled) {
        // Spell negada por counter trap → mover a graveyard sin resolver.
        moveCardToGraveyard(player, card);
        return;
      }
    } else {
      this.replay.log('ACTIVATE_EFFECT', playerId, {
        cardInstanceId: input.cardInstanceId,
        targets: input.targets ?? [],
      });
    }

    this.effects.addToChain(playerId, card, input.targets ?? []);
    // En Fase 0, resolvemos inmediatamente sin abrir ventana de respuesta.
    // Fase 1: abrir ventana 15s para el rival vía Room timer.
    const results = this.effects.resolveChain();
    for (const r of results) {
      this.replay.log('EFFECT_RESOLVED', playerId, {
        success: r.success,
        message: r.message,
      });
    }
  }

  handleEndPhase(playerId: string): void {
    this.validator.validateEndPhase(playerId);
    const prevPhase = this.state.phase;
    const prevTurn = this.state.turnNumber;
    this.phases.advance();
    if (this.state.turnNumber !== prevTurn) {
      this.replay.log('TURN_CHANGED', this.state.activePlayerId, {
        turnNumber: this.state.turnNumber,
      });
    } else {
      this.replay.log('PHASE_CHANGED', playerId, {
        from: prevPhase,
        to: this.state.phase,
      });
    }
  }

  /**
   * SET de una carta de Spell o Trap a una zona spell/trap face-down.
   * Si la carta tiene un effect kind soportado por triggered handlers,
   * se registra automáticamente al EventBus.
   */
  handleSetCard(playerId: string, cardInstanceId: string): void {
    if (this.state.activePlayerId !== playerId) {
      throw new InvalidActionError('NOT_YOUR_TURN', 'Solo el jugador activo puede SET.');
    }
    const player = this.state.players.get(playerId);
    if (!player) throw new InvalidActionError('TARGET_INVALID', 'unknown player');

    const handIdx = player.hand.findIndex((c) => c.instanceId === cardInstanceId);
    if (handIdx === -1) throw new InvalidActionError('CARD_NOT_IN_HAND', 'card not in hand');
    const card = player.hand[handIdx]!;

    const def = this.cards.getById(card.cardId);
    if (!def || (def.type !== 'Spell' && def.type !== 'Trap')) {
      throw new InvalidActionError('TARGET_INVALID', 'Solo Spell/Trap se pueden SET.');
    }

    const freeIdx = player.spellTrapZones.findIndex((z) => !z.instanceId);
    if (freeIdx === -1) throw new InvalidActionError('TARGET_INVALID', 'No hay zona spell/trap libre.');

    player.hand.splice(handIdx, 1);
    player.handSize = player.hand.length;
    card.faceDown = true;
    card.position = ''; // n/a para spell/trap
    player.spellTrapZones[freeIdx] = card;

    // Si el effect tiene un trigger handler conocido, registrarlo en el bus.
    registerTriggersForCard(def, {
      state: this.state,
      source: card,
      ownerId: playerId,
      registry: this.triggers,
      log: this.log,
    });
    this.replay.log('SET_CARD', playerId, { cardInstanceId });
    this.log.info({ player: playerId, card: card.cardId, instanceId: card.instanceId }, 'card set');
  }
}

/** Helper: mueve una carta de cualquier zona del jugador a su graveyard. */
function moveCardToGraveyard(player: PlayerSchema, card: CardSchema): void {
  const inHand = player.hand.findIndex((c) => c.instanceId === card.instanceId);
  if (inHand !== -1) {
    player.graveyard.push(player.hand[inHand]!);
    player.hand.splice(inHand, 1);
    player.handSize = player.hand.length;
    return;
  }
  for (const zones of [player.spellTrapZones, player.monsterZones]) {
    const idx = zones.findIndex((c) => c.instanceId === card.instanceId);
    if (idx !== -1) {
      const c = zones[idx]!;
      player.graveyard.push(c);
      const empty = new (c.constructor as { new (): typeof c })();
      empty.instanceId = '';
      zones[idx] = empty;
      return;
    }
  }
}
