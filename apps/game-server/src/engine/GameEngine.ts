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
import { AuraRegistry } from './AuraRegistry.js';
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
  public readonly auras: AuraRegistry;

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
    this.auras = new AuraRegistry();
    this.deckManager = new DeckManager(this.rng);
    this.validator = new ActionValidator(this.state, this.cards);
    this.summon = new SummonSystem(this.state, this.cards);
    this.combat = new CombatSystem(this.state, this.cards, this.log, this.auras, this.events);
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
    // Anti-bricking: garantiza ≥1 monster L1-4 en mano inicial.
    this.deckManager.drawStartingHand(p, DEFAULT_DUEL_CONFIG.startingHandSize, this.cards);
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

  /**
   * Recomputa los snapshots `auraAtkBonus` / `auraDefBonus` / `affectedByAura` de TODOS
   * los monsters en field. Llamado al final de cada handler que pueda cambiar field state
   * (summon, activate, set, attack, position change, end phase). Permite al cliente
   * mostrar stats efectivos + indicador visual sin duplicar la lógica de auras.
   */
  recomputeAuraSnapshots(): void {
    for (const player of this.state.players.values()) {
      for (const card of player.monsterZones) {
        if (!card.instanceId) continue;
        const def = this.cards.getById(card.cardId);
        if (!def || def.type !== 'Monster') continue;
        const withAuras = this.combat.effectiveStatsWithAuras(def, card, player.id);
        const baseAtk = Math.max(0, def.atk + card.atkMod);
        const baseDef = Math.max(0, def.def + card.defMod);
        card.auraAtkBonus = withAuras.atk - baseAtk;
        card.auraDefBonus = withAuras.def - baseDef;
        card.affectedByAura =
          card.atkMod !== 0 || card.defMod !== 0 ||
          card.auraAtkBonus !== 0 || card.auraDefBonus !== 0;
      }
    }
  }

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
      // Si el monster tiene un triggered/passive effect (onDeployHeal, beastSwarm, antiPlantDebuff,
      // onDeployDestroySpellTrap, onDeathDirectDamage, onDeathPermanentDebuff), registrarlo ahora.
      const def = this.cards.getById(monster.cardId);
      if (def && def.effect) {
        registerTriggersForCard(def, {
          state: this.state,
          source: monster,
          ownerId: playerId,
          registry: this.triggers,
          auras: this.auras,
          log: this.log,
        });
      }
    }
    this.recomputeAuraSnapshots();
  }

  /**
   * Resultado completo del combate, devuelto al room para broadcast a clientes.
   * `cancelled` cuando un trap negó el ataque (Mirror Web etc).
   */
  handleDeclareAttack(playerId: string, raw: unknown): {
    cancelled: boolean;
    attackerName: string | undefined;
    defenderName: string | undefined;
    attackerAtk: number | undefined;
    defenderAtk: number | undefined;
    defenderDef: number | undefined;
    direct: boolean | undefined;
    attackerDestroyed: boolean | undefined;
    defenderDestroyed: boolean | undefined;
    damageToAttackerOwner: number | undefined;
    damageToDefenderOwner: number | undefined;
  } {
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
    const attackerDef = this.cards.getById(attacker.cardId);
    const attackerName = attackerDef?.name ?? attacker.cardId;
    if (declareEvent.cancelled) {
      attacker.hasAttacked = true;
      return {
        cancelled: true,
        attackerName,
        defenderName: undefined,
        attackerAtk: undefined,
        defenderAtk: undefined,
        defenderDef: undefined,
        direct: undefined,
        attackerDestroyed: undefined,
        defenderDestroyed: undefined,
        damageToAttackerOwner: undefined,
        damageToDefenderOwner: undefined,
      };
    }
    if (declareEvent.attackerAtkPenalty > 0) {
      attacker.atkMod -= declareEvent.attackerAtkPenalty;
    }
    const opponentId = [...this.state.players.keys()].find((id) => id !== playerId);
    const defender =
      input.targetInstanceId !== 'DIRECT' && opponentId
        ? this.state.players.get(opponentId)?.monsterZones.find((c) => c.instanceId === input.targetInstanceId) ?? null
        : null;
    const defenderDef = defender ? this.cards.getById(defender.cardId) : null;
    // Snapshot stats ANTES del combate para reportar al cliente.
    const attackerStatsSnap = attackerDef && attackerDef.type === 'Monster'
      ? this.combat.effectiveStatsWithAuras(attackerDef, attacker, playerId)
      : { atk: 0, def: 0 };
    const defenderStatsSnap = defender && defenderDef && defenderDef.type === 'Monster'
      ? this.combat.effectiveStatsWithAuras(defenderDef, defender, opponentId ?? '')
      : null;

    const outcome = this.combat.declareAttack(playerId, input.attackerInstanceId, input.targetInstanceId);
    this.replay.log('DECLARE_ATTACK', playerId, {
      attackerInstanceId: input.attackerInstanceId,
      targetInstanceId: input.targetInstanceId,
    });
    this.replay.log('COMBAT_RESOLVED', playerId, { ...outcome });
    this.events.emit({
      type: 'onBattleResolve',
      attackerOwnerId: playerId,
      defenderOwnerId: opponentId ?? '',
      attacker,
      defender,
      outcome,
    });
    // Tras el combate puede haber muertes que cambian field state (auras requireFieldCondition).
    this.recomputeAuraSnapshots();

    return {
      cancelled: false,
      attackerName,
      defenderName: defenderDef?.name,
      attackerAtk: attackerStatsSnap.atk,
      defenderAtk: defenderStatsSnap?.atk,
      defenderDef: defenderStatsSnap?.def,
      direct: outcome.direct,
      attackerDestroyed: outcome.attackerDestroyed,
      defenderDestroyed: outcome.defenderDestroyed,
      damageToAttackerOwner: outcome.damageToAttackerOwner,
      damageToDefenderOwner: outcome.damageToDefenderOwner,
    };
  }

  handleActivateEffect(playerId: string, raw: unknown): void {
    const input = this.validator.validateActivateEffect(playerId, raw);
    const player = this.state.players.get(playerId);
    if (!player) throw new InvalidActionError('TARGET_INVALID', 'unknown player');
    const handIdx = player.hand.findIndex((c) => c.instanceId === input.cardInstanceId);
    const card =
      (handIdx !== -1 ? player.hand[handIdx]! : null) ??
      player.monsterZones.find((c) => c.instanceId === input.cardInstanceId) ??
      player.spellTrapZones.find((c) => c.instanceId === input.cardInstanceId);
    if (!card) throw new InvalidActionError('CARD_NOT_IN_HAND', 'card not found');
    const def = this.cards.getById(card.cardId);

    // Si se activa desde la mano (Quick-Play / Field / Continuous / Equip / Normal Spell),
    // moverla a una zona Spell/Trap libre face-up ANTES de resolver. Esto refleja la
    // mecánica YGO: una Spell activada está físicamente en zona, visible.
    if (handIdx !== -1 && def?.type === 'Spell') {
      const freeIdx = player.spellTrapZones.findIndex((z) => !z.instanceId);
      if (freeIdx === -1) {
        throw new InvalidActionError('NO_FREE_SPELL_ZONE', 'No free Spell/Trap zone to place the card.');
      }
      player.hand.splice(handIdx, 1);
      player.handSize = player.hand.length;
      player.spellTrapZones[freeIdx] = card;
    }

    // Voltear la carta boca arriba (Spell/Trap activadas son visibles).
    card.faceDown = false;

    // Si la carta es Spell, emitir onSpellActivated PRIMERO para que counter
    // traps (negateAndDestroy) tengan ventana de cancelar.
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

    // Algunos effect kinds son TRIGGERED (persistent/event-based, no immediate).
    // Lista: negateAttack, atkDebuff, negateAndDestroy, fieldTrigger, continuousAura,
    // auraDef, trapImmune, lockPosition, duelLock, piercingDirect.
    // BUG-FIX 2026-05-08 (Mirror Web): si el card ya tenía listeners registrados
    // (fue SETteado previamente con handleSetCard), NO re-registrar — causaría doble
    // ejecución del trigger. El listener registrado al SET ya tiene capturada la ref
    // del CardSchema y, al pasar `card.faceDown = false`, dispara correctamente.
    const alreadyHadTriggers = this.triggers.countFor(card.instanceId) > 0;
    const triggerRegistered = alreadyHadTriggers
      ? true
      : registerTriggersForCard(def!, {
          state: this.state,
          source: card,
          ownerId: playerId,
          registry: this.triggers,
          auras: this.auras,
          log: this.log,
        });

    this.effects.addToChain(playerId, card, input.targets ?? []);
    const results = this.effects.resolveChain();
    for (const r of results) {
      this.replay.log('EFFECT_RESOLVED', playerId, {
        success: r.success,
        message: r.message,
      });
    }

    // Si NINGUN sistema lo manejó (ni triggered ni immediate handler), avisar al cliente
    // que el efecto no está implementado en lugar de fallar silencioso.
    const allFailed = !triggerRegistered && results.every((r) => !r.success);
    if (allFailed) {
      this.log.warn(
        { kind: def?.effect?.kind, cardId: card.cardId },
        'effect activated but no handler matched (triggered nor immediate)',
      );
      throw new InvalidActionError(
        'EFFECT_NOT_IMPLEMENTED',
        `El efecto "${def?.effect?.kind ?? 'unknown'}" todavía no tiene handler implementado.`,
      );
    }

    // Cleanup one-shot Spells/Traps: Normal / Quick-Play / Equip / Counter → graveyard tras resolver.
    // Las Continuous y Field permanecen en zona (sus triggers/auras siguen activos).
    //
    // BUG-FIX 2026-05-08 (Mirror Web): si la carta dejó listeners registrados esperando
    // un evento futuro (negateAttack escucha onAttackDeclare; atkDebuff idem; negateAndDestroy
    // escucha onSpellActivated; etc.), DEBE quedar en zona — el handler del trigger se
    // encarga de moverla al graveyard cuando dispare. Si la mandamos al cementerio acá,
    // el listener nunca dispara y el efecto se pierde.
    if (def?.type === 'Spell' || def?.type === 'Trap') {
      const subtype = def.subtype;
      const isPersistent = subtype === 'Continuous' || subtype === 'Field';
      const stillWaitingOnTrigger = this.triggers.countFor(card.instanceId) > 0;
      if (!isPersistent && !stillWaitingOnTrigger) {
        moveCardToGraveyard(player, card);
      }
    }
    // Spell activation puede registrar auras (Tide Surge), buffear monsters (Lunacian Blessing),
    // o sacrificar monsters (Verdant Renewal). Todo cambia el field state.
    this.recomputeAuraSnapshots();
  }

  /** Cambio manual ATK ↔ DEF de un monster propio en MAIN_1/MAIN_2. */
  handleChangePosition(playerId: string, raw: unknown): void {
    const input = this.validator.validateChangePosition(playerId, raw);
    const player = this.state.players.get(playerId);
    const monster = player?.monsterZones.find((c) => c.instanceId === input.cardInstanceId);
    if (!monster) throw new InvalidActionError('TARGET_INVALID', 'monster not on field');
    monster.position = monster.position === 'ATK' ? 'DEF' : 'ATK';
    monster.positionChangedThisTurn = true;
    this.replay.log('CHANGE_POSITION', playerId, {
      cardInstanceId: input.cardInstanceId,
      newPosition: monster.position,
    });
    // auraDef requiere position=DEF — cambiar pos puede activar/desactivar el aura.
    this.recomputeAuraSnapshots();
  }

  /**
   * Resuelve el discard pendiente por hand limit. El jugador (o el bot) elige las
   * cartas exactas a descartar. Una vez resuelto, pendingHandLimitDiscard = 0 y
   * el jugador puede avanzar de END phase libremente.
   */
  handleHandLimitDiscard(playerId: string, cardInstanceIds: string[]): void {
    const player = this.state.players.get(playerId);
    if (!player) throw new InvalidActionError('TARGET_INVALID', 'unknown player');
    if (this.state.activePlayerId !== playerId) {
      throw new InvalidActionError('NOT_YOUR_TURN', 'Solo el jugador activo descarta.');
    }
    if (this.state.phase !== Phase.END) {
      throw new InvalidActionError('WRONG_PHASE', 'Hand-limit discard solo en End Phase.');
    }
    const required = player.pendingHandLimitDiscard;
    if (required <= 0) {
      throw new InvalidActionError('CONDITION_NOT_MET', 'No tenés discard pendiente.');
    }
    if (cardInstanceIds.length !== required) {
      throw new InvalidActionError(
        'TARGET_INVALID',
        `Debés elegir exactamente ${required} carta(s) — recibí ${cardInstanceIds.length}.`,
      );
    }
    // Validar que TODAS las cartas estén en la mano (sin duplicados).
    const ids = new Set(cardInstanceIds);
    if (ids.size !== cardInstanceIds.length) {
      throw new InvalidActionError('TARGET_INVALID', 'IDs duplicados en discard.');
    }
    for (const id of cardInstanceIds) {
      const inHand = player.hand.some((c) => c.instanceId === id);
      if (!inHand) {
        throw new InvalidActionError('CARD_NOT_IN_HAND', `Carta ${id} no está en mano.`);
      }
    }
    // Mover cada carta al graveyard.
    for (const id of cardInstanceIds) {
      const idx = player.hand.findIndex((c) => c.instanceId === id);
      if (idx === -1) continue;
      const card = player.hand[idx]!;
      player.hand.splice(idx, 1);
      player.graveyard.push(card);
      this.replay.log('HAND_LIMIT_DISCARD', playerId, { cardInstanceId: id, cardId: card.cardId });
    }
    player.handSize = player.hand.length;
    player.pendingHandLimitDiscard = 0;
    this.log.info({ player: playerId, discarded: cardInstanceIds }, 'hand-limit discard resolved');
  }

  handleEndPhase(playerId: string): void {
    this.validator.validateEndPhase(playerId);
    // Si el jugador activo está en END phase con cartas pendientes de descartar,
    // bloquear hasta que las descarte vía HAND_LIMIT_DISCARD.
    const activePlayer = this.state.players.get(this.state.activePlayerId);
    if (
      activePlayer &&
      this.state.phase === Phase.END &&
      activePlayer.pendingHandLimitDiscard > 0
    ) {
      throw new InvalidActionError(
        'MUST_DISCARD',
        `You must discard ${activePlayer.pendingHandLimitDiscard} card(s) before ending your turn.`,
      );
    }
    const prevPhase = this.state.phase;
    const prevTurn = this.state.turnNumber;
    const activePlayerBefore = this.state.activePlayerId;
    this.phases.advance();
    // Emitir onPhaseChange para que listeners (poisonDoT) reaccionen.
    // El activePlayerId del EVENT es el del JUGADOR que estaba en ese turno (al "salir" del prevPhase),
    // no el nuevo. Esto importa para poisonDoT que dispara al final del turno DEL OPONENTE de Venom.
    this.events.emit({
      type: 'onPhaseChange',
      fromPhase: prevPhase as Phase,
      toPhase: this.state.phase as Phase,
      activePlayerId: activePlayerBefore,
    });
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
    this.recomputeAuraSnapshots();
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

    // Si el effect tiene un trigger handler (event-based) o aura (state-based), registrarlo.
    registerTriggersForCard(def, {
      state: this.state,
      source: card,
      ownerId: playerId,
      registry: this.triggers,
      auras: this.auras,
      log: this.log,
    });
    this.replay.log('SET_CARD', playerId, { cardInstanceId });
    this.log.info({ player: playerId, card: card.cardId, instanceId: card.instanceId }, 'card set');
    // Continuous traps tipo Webbed Roots o Chimera Roost (continuousAura) cambian el field state.
    this.recomputeAuraSnapshots();
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
