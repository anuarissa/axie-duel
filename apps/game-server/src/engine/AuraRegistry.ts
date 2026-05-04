/**
 * Auras pasivas (continuous) que modifican stats efectivos sin disparar al Event bus.
 *
 * Diferencia con TriggerRegistry:
 *   - TriggerRegistry: handlers que reaccionan a eventos (onSummon, onAttackDeclare).
 *     Modifican el flujo del juego en momentos específicos.
 *   - AuraRegistry: efectos PERSISTENTES de campo. Mientras la fuente esté en zona,
 *     el aura se aplica al recalcular stats efectivos. Sin event hooks — son state-based.
 *
 * Ejemplos de auras: Tide Surge (+400 ATK a Aquatic propios), Verdant Sentinel
 * (+200 DEF a Plants propios mientras esté en DEF), Ena (-200 ATK a enemy Plants).
 */

import type { CardSchema } from '../rooms/schema/CardSchema.js';
import type { DuelStateSchema } from '../rooms/schema/DuelStateSchema.js';

export type AuraScope =
  | 'ownAll'
  | 'ownPlant'
  | 'ownAquatic'
  | 'ownBeast'
  | 'ownBird'
  | 'ownReptile'
  | 'ownBug'
  | 'ownChimera'
  | 'oppAll'
  | 'enemyPlant'
  | 'enemyAquatic'
  | 'enemyBeast'
  | 'enemyBird'
  | 'enemyReptile'
  | 'enemyBug';

export interface AuraEffect {
  /** Source de la aura (Field Spell, Continuous Spell, Continuous Trap, monster pasivo, etc.). */
  sourceInstanceId: string;
  /** Player que controla la fuente. */
  ownerId: string;
  scope: AuraScope;
  atkBonus: number;
  defBonus: number;
  /** Si true, NO aplica al source mismo (ej: Verdant Sentinel buffea a OTROS plants). */
  excludeSelf?: boolean;
  /** Solo aplica al SOURCE mismo si la condición se cumple (ej: beastSwarm: solo aplica a este beast si hay otro beast del mismo dueño). */
  applyOnlyToSelf?: boolean;
  /** Condición de field para que la aura aplique. 'ownerHasOtherSameClass' = el dueño debe controlar otra carta del mismo attribute. */
  requireFieldCondition?: 'ownerHasOtherSameClass';
  /** Solo aplica si la fuente está en DEF. (Verdant Sentinel) */
  requireSourcePosition?: 'ATK' | 'DEF' | 'DEF_FACEDOWN';
  /** Solo aplica si NINGUN otro monster del owner ha atacado este turno (Tripp firstAttackBonus). */
  requireFirstAttackOfTurn?: boolean;
}

export class AuraRegistry {
  private auras = new Map<string, AuraEffect>();

  register(aura: AuraEffect): void {
    this.auras.set(aura.sourceInstanceId, aura);
  }

  unregister(sourceInstanceId: string): void {
    this.auras.delete(sourceInstanceId);
  }

  /** Lista todas las auras activas. */
  list(): AuraEffect[] {
    return [...this.auras.values()];
  }

  /** Cuántas auras tiene un source (0 o 1). Útil para tests. */
  countFor(sourceInstanceId: string): number {
    return this.auras.has(sourceInstanceId) ? 1 : 0;
  }

  clear(): void {
    this.auras.clear();
  }
}

const SCOPE_ATTRIBUTES: Record<string, string> = {
  ownPlant: 'Plant',     enemyPlant: 'Plant',
  ownAquatic: 'Aquatic', enemyAquatic: 'Aquatic',
  ownBeast: 'Beast',     enemyBeast: 'Beast',
  ownBird: 'Bird',       enemyBird: 'Bird',
  ownReptile: 'Reptile', enemyReptile: 'Reptile',
  ownBug: 'Bug',         enemyBug: 'Bug',
};

/**
 * Calcula bonus de auras aplicables a un monster específico.
 * Devuelve { atkBonus, defBonus } a sumar al stat base.
 *
 * @param getCardAttribute opcional — si lo proveés, las auras con `requireFieldCondition`
 * pueden chequear el attribute de otras cartas en field. Sin él, esas condiciones se skipean.
 */
export function aurasApplicableTo(
  registry: AuraRegistry,
  state: DuelStateSchema,
  target: CardSchema,
  targetOwnerId: string,
  targetAttribute: string,
  targetCardId?: string,
  getCardAttribute?: (cardId: string) => string | undefined,
): { atkBonus: number; defBonus: number } {
  let atkBonus = 0;
  let defBonus = 0;

  for (const aura of registry.list()) {
    // Ownership check.
    const isOwn = aura.ownerId === targetOwnerId;
    if (aura.scope.startsWith('own') && !isOwn) continue;
    if (aura.scope === 'oppAll' && isOwn) continue;
    if (aura.scope.startsWith('enemy') && isOwn) continue;

    // Scope/attribute check (skip ownAll/oppAll which span all attributes).
    if (aura.scope !== 'ownAll' && aura.scope !== 'oppAll') {
      if (aura.scope === 'ownChimera') {
        if (!targetCardId || !targetCardId.startsWith('mon_chim_')) continue;
      } else {
        const requiredAttr = SCOPE_ATTRIBUTES[aura.scope];
        if (requiredAttr && targetAttribute !== requiredAttr) continue;
      }
    }

    // Exclude self.
    if (aura.excludeSelf && aura.sourceInstanceId === target.instanceId) continue;

    // Apply ONLY to self (passive monster effects: Buba beastSwarm only buffs Buba itself).
    if (aura.applyOnlyToSelf && aura.sourceInstanceId !== target.instanceId) continue;

    // Field condition: el dueño debe controlar otra carta del mismo attribute (excluyendo source).
    // Se asume que el scope del aura ya filtra por attribute (ej: ownBeast → solo aplica si target es Beast).
    // Acá sólo chequeamos: ¿hay otro own monster en field, distinto del source, del MISMO attribute?
    if (aura.requireFieldCondition === 'ownerHasOtherSameClass') {
      const owner = state.players.get(aura.ownerId);
      if (!owner) continue;
      let hasSibling = false;
      for (const c of owner.monsterZones) {
        if (!c.instanceId) continue;
        if (c.instanceId === aura.sourceInstanceId) continue;
        if (!getCardAttribute) {
          // Sin lookup: aproximar como "cualquier otro monster" → permite la aura.
          hasSibling = true;
          break;
        }
        if (getCardAttribute(c.cardId) === targetAttribute) {
          hasSibling = true;
          break;
        }
      }
      if (!hasSibling) continue;
    }

    // SIEMPRE verificar que la fuente sigue presente en zona (monster o spell/trap).
    // Si murió/fue removida, el aura ya no aplica (cleanup implícito sin requerir unregister).
    const sourceOwner = state.players.get(aura.ownerId);
    const sourceCard = sourceOwner?.monsterZones.find((c) => c.instanceId === aura.sourceInstanceId)
      ?? sourceOwner?.spellTrapZones.find((c) => c.instanceId === aura.sourceInstanceId);
    if (!sourceCard) continue;
    if (aura.requireSourcePosition && sourceCard.position !== aura.requireSourcePosition) continue;

    // requireFirstAttackOfTurn: el aura solo aplica si NINGUN otro monster del owner
    // ya atacó este turno. Cuando el primero ataca y otro hace lo mismo, esta aura desaparece.
    // hasAttacked se resetea al final del turno (PhaseManager).
    if (aura.requireFirstAttackOfTurn) {
      const owner = state.players.get(aura.ownerId);
      if (!owner) continue;
      const someoneElseAttacked = owner.monsterZones.some(
        (m) => m.instanceId && m.instanceId !== aura.sourceInstanceId && m.hasAttacked,
      );
      if (someoneElseAttacked) continue;
    }

    atkBonus += aura.atkBonus;
    defBonus += aura.defBonus;
  }

  return { atkBonus, defBonus };
}
