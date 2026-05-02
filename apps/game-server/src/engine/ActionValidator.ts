/**
 * Valida cada intención del cliente ANTES de mutar el estado.
 * Si la acción es inválida, lanza error tipado que el room traduce en evento ERROR.
 */

import { z } from 'zod';
import { Phase } from '@axie-duel/shared-types';
import {
  canDeclareAttack,
  canActivateSpellSpeed1,
  canActivateSpellSpeed2or3,
  tributesRequired,
} from '@axie-duel/game-rules';
import type { DuelStateSchema } from '../rooms/schema/DuelStateSchema.js';
import type { PlayerSchema } from '../rooms/schema/PlayerSchema.js';
import { CardDatabase } from '../cards/CardDatabase.js';

export class InvalidActionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'InvalidActionError';
  }
}

const NormalSummonInput = z.object({
  cardInstanceId: z.string().min(1),
  tributes: z.array(z.string()).optional(),
  position: z.enum(['ATK', 'DEF', 'DEF_FACEDOWN']),
});

const DeclareAttackInput = z.object({
  attackerInstanceId: z.string().min(1),
  targetInstanceId: z.union([z.string().min(1), z.literal('DIRECT')]),
});

const ActivateEffectInput = z.object({
  cardInstanceId: z.string().min(1),
  targets: z.array(z.string()).optional(),
});

export class ActionValidator {
  constructor(
    private state: DuelStateSchema,
    private cards: CardDatabase,
  ) {}

  validateNormalSummon(playerId: string, raw: unknown): z.infer<typeof NormalSummonInput> {
    if (this.state.activePlayerId !== playerId) {
      throw new InvalidActionError('NOT_YOUR_TURN', 'Solo el jugador activo puede invocar.');
    }
    const phase = this.state.phase as Phase;
    if (phase !== Phase.MAIN_1 && phase !== Phase.MAIN_2) {
      throw new InvalidActionError('WRONG_PHASE', 'Invocación normal solo en Main 1 o Main 2.');
    }
    const input = NormalSummonInput.parse(raw);
    const player = this.requirePlayer(playerId);

    if (player.hasNormalSummonedThisTurn) {
      throw new InvalidActionError('ALREADY_NORMAL_SUMMONED', 'Ya invocaste normalmente este turno.');
    }

    const cardInstance = player.hand.find((c) => c.instanceId === input.cardInstanceId);
    if (!cardInstance) {
      throw new InvalidActionError('CARD_NOT_IN_HAND', 'Carta no está en tu mano.');
    }
    const def = this.cards.getById(cardInstance.cardId);
    if (!def || def.type !== 'Monster') {
      throw new InvalidActionError('TARGET_INVALID', 'Solo Monstruos se pueden invocar normalmente.');
    }

    const required = tributesRequired(def.level);
    const provided = input.tributes ?? [];
    if (provided.length !== required) {
      throw new InvalidActionError(
        'INSUFFICIENT_TRIBUTES',
        `Nivel ${def.level} requiere ${required} tributo(s), recibí ${provided.length}.`,
      );
    }
    // Validar que los tributos son monstruos en el campo del propio jugador.
    for (const tribId of provided) {
      const onField = player.monsterZones.find((m) => m.instanceId === tribId);
      if (!onField) {
        throw new InvalidActionError('TARGET_INVALID', `Tributo ${tribId} no está en tu campo.`);
      }
    }

    // Hay que tener una zona libre.
    const freeZone = player.monsterZones.findIndex((z) => !z.instanceId);
    if (freeZone === -1 && required === 0) {
      throw new InvalidActionError('TARGET_INVALID', 'No hay zona libre para invocar.');
    }
    return input;
  }

  validateDeclareAttack(playerId: string, raw: unknown): z.infer<typeof DeclareAttackInput> {
    if (this.state.activePlayerId !== playerId) {
      throw new InvalidActionError('NOT_YOUR_TURN', 'Solo el jugador activo puede atacar.');
    }
    const player = this.requirePlayer(playerId);
    const phase = this.state.phase as Phase;
    const input = DeclareAttackInput.parse(raw);

    const attacker = player.monsterZones.find((m) => m.instanceId === input.attackerInstanceId);
    if (!attacker) throw new InvalidActionError('TARGET_INVALID', 'Atacante no está en tu campo.');

    const allowed = canDeclareAttack(
      phase,
      true,
      this.state.turnNumber,
      attacker.hasAttacked,
      player.isFirstPlayer,
    );
    if (!allowed) throw new InvalidActionError('WRONG_PHASE', 'No puedes declarar ataque ahora.');

    if (attacker.position !== 'ATK') {
      throw new InvalidActionError('TARGET_INVALID', 'Solo monstruos en ATK pueden atacar.');
    }
    return input;
  }

  validateActivateEffect(playerId: string, raw: unknown): z.infer<typeof ActivateEffectInput> {
    const input = ActivateEffectInput.parse(raw);
    const player = this.requirePlayer(playerId);
    const isActive = playerId === this.state.activePlayerId;
    const phase = this.state.phase as Phase;

    // Buscar la carta en cualquier zona del jugador (mano, monsterZones, spellTrapZones).
    const inHand = player.hand.find((c) => c.instanceId === input.cardInstanceId);
    const inField = [...player.monsterZones, ...player.spellTrapZones].find(
      (c) => c.instanceId === input.cardInstanceId,
    );
    const card = inHand ?? inField;
    if (!card) throw new InvalidActionError('CARD_NOT_IN_HAND', 'No tienes esa carta.');

    const def = this.cards.getById(card.cardId);
    if (!def?.effect) {
      throw new InvalidActionError('TARGET_INVALID', 'Esa carta no tiene efecto activable.');
    }

    if (def.effect.spellSpeed === 1) {
      if (!canActivateSpellSpeed1(phase, isActive)) {
        throw new InvalidActionError('WRONG_PHASE', 'Spell Speed 1: solo en Main del jugador activo.');
      }
    } else if (!canActivateSpellSpeed2or3()) {
      throw new InvalidActionError('WRONG_PHASE', 'No puedes activar este efecto ahora.');
    }
    return input;
  }

  validateEndPhase(playerId: string): void {
    if (this.state.activePlayerId !== playerId) {
      throw new InvalidActionError('NOT_YOUR_TURN', 'Solo el jugador activo termina la fase.');
    }
  }

  private requirePlayer(playerId: string): PlayerSchema {
    const p = this.state.players.get(playerId);
    if (!p) throw new InvalidActionError('TARGET_INVALID', 'Player not found in match.');
    return p;
  }
}
