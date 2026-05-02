/**
 * Sistema de combate aplicado al estado Colyseus.
 * Wrapper sobre `resolveCombat` de @axie-duel/game-rules que muta `DuelStateSchema`.
 */

import { resolveCombat, effectiveStats } from '@axie-duel/game-rules';
import type { MonsterCard } from '@axie-duel/shared-types';
import type { DuelStateSchema } from '../rooms/schema/DuelStateSchema.js';
import type { CardSchema } from '../rooms/schema/CardSchema.js';
import type { CardDatabase } from '../cards/CardDatabase.js';
import { aurasApplicableTo, type AuraRegistry } from './AuraRegistry.js';
import type { Logger } from 'pino';

export interface CombatOutcome {
  attackerDestroyed: boolean;
  defenderDestroyed: boolean;
  damageToAttackerOwner: number;
  damageToDefenderOwner: number;
  direct: boolean;
}

export class CombatSystem {
  constructor(
    private state: DuelStateSchema,
    private cards: CardDatabase,
    private log: Logger,
    private auras?: AuraRegistry,
  ) {}

  /**
   * Stats efectivos sumando: stats base de la card + atkMod/defMod del instance + auras aplicables.
   * Expuesto público para que el motor lo use en lugar del `effectiveStats` puro.
   */
  effectiveStatsWithAuras(
    cardDef: MonsterCard,
    instance: CardSchema,
    ownerId: string,
  ): { atk: number; def: number } {
    const base = effectiveStats(cardDef, { atkMod: instance.atkMod, defMod: instance.defMod } as never);
    if (!this.auras) return base;
    const auraBonus = aurasApplicableTo(this.auras, this.state, instance, ownerId, cardDef.attribute);
    return {
      atk: Math.max(0, base.atk + auraBonus.atkBonus),
      def: Math.max(0, base.def + auraBonus.defBonus),
    };
  }

  declareAttack(attackerOwnerId: string, attackerInstanceId: string, targetInstanceId: string | 'DIRECT'): CombatOutcome {
    const attackerOwner = this.state.players.get(attackerOwnerId);
    if (!attackerOwner) throw new Error(`unknown attacker owner ${attackerOwnerId}`);
    const defenderOwnerId = [...this.state.players.keys()].find((id) => id !== attackerOwnerId);
    if (!defenderOwnerId) throw new Error('no opponent');
    const defenderOwner = this.state.players.get(defenderOwnerId);
    if (!defenderOwner) throw new Error('unknown defender owner');

    const attacker = attackerOwner.monsterZones.find((c) => c.instanceId === attackerInstanceId);
    if (!attacker) throw new Error('attacker not in zone');

    const attackerDef = this.cards.getById(attacker.cardId);
    if (!attackerDef || attackerDef.type !== 'Monster') throw new Error('attacker is not a Monster');

    let defender = null;
    let defenderDef: MonsterCard | null = null;
    if (targetInstanceId !== 'DIRECT') {
      const found = defenderOwner.monsterZones.find((c) => c.instanceId === targetInstanceId);
      if (!found) throw new Error('defender not on opponent field');
      defender = found;
      const def = this.cards.getById(found.cardId);
      if (!def || def.type !== 'Monster') throw new Error('defender is not a Monster');
      defenderDef = def;
    }

    const aStats = this.effectiveStatsWithAuras(attackerDef, attacker, attackerOwnerId);
    const dStats =
      defender && defenderDef ? this.effectiveStatsWithAuras(defenderDef, defender, defenderOwnerId) : null;

    const result = resolveCombat(
      { instanceId: attacker.instanceId, position: attacker.position } as never,
      aStats,
      attackerOwnerId,
      defender ? ({ instanceId: defender.instanceId, position: defender.position } as never) : null,
      dStats,
      defenderOwnerId,
    );

    // Aplicar destrucciones.
    const destroyAndMove = (instanceId: string): void => {
      for (const ownerId of [attackerOwnerId, defenderOwnerId]) {
        const owner = this.state.players.get(ownerId);
        if (!owner) continue;
        const idx = owner.monsterZones.findIndex((c) => c.instanceId === instanceId);
        if (idx !== -1) {
          const card = owner.monsterZones[idx]!;
          owner.graveyard.push(card);
          // Reemplazar slot con carta vacía (placeholder de zona libre).
          const empty = new (card.constructor as { new (): typeof card })();
          empty.instanceId = '';
          owner.monsterZones[idx] = empty;
          return;
        }
      }
    };
    for (const id of result.destroyed) destroyAndMove(id);

    // Aplicar daño.
    for (const [pid, dmg] of Object.entries(result.damage)) {
      const target = this.state.players.get(pid);
      if (target) target.lifePoints = Math.max(0, target.lifePoints - dmg);
    }

    attacker.hasAttacked = true;

    // Game over check
    if (attackerOwner.lifePoints <= 0 || defenderOwner.lifePoints <= 0) {
      this.state.status = 'GAME_OVER';
      const winner = attackerOwner.lifePoints <= 0 ? defenderOwnerId : attackerOwnerId;
      this.state.winnerId = winner;
      this.state.winReason = 'LIFE_POINTS_ZERO';
    }

    const outcome: CombatOutcome = {
      attackerDestroyed: result.destroyed.includes(attacker.instanceId),
      defenderDestroyed: defender ? result.destroyed.includes(defender.instanceId) : false,
      damageToAttackerOwner: result.damage[attackerOwnerId] ?? 0,
      damageToDefenderOwner: result.damage[defenderOwnerId] ?? 0,
      direct: result.direct,
    };
    this.log.info(outcome, 'combat resolved');
    return outcome;
  }
}
