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
 * (+200 DEF a Plants propios mientras esté en DEF).
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
  | 'oppAll';

export interface AuraEffect {
  /** Source de la aura (Field Spell, Continuous Spell, Continuous Trap, etc.). */
  sourceInstanceId: string;
  /** Player que controla la fuente. */
  ownerId: string;
  scope: AuraScope;
  atkBonus: number;
  defBonus: number;
  /** Si true, NO aplica al source mismo (ej: Verdant Sentinel buffea a OTROS plants). */
  excludeSelf?: boolean;
  /** Solo aplica si la fuente está en DEF. (Verdant Sentinel) */
  requireSourcePosition?: 'ATK' | 'DEF' | 'DEF_FACEDOWN';
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

/**
 * Calcula bonus de auras aplicables a un monster específico.
 * Devuelve { atkBonus, defBonus } a sumar al stat base.
 *
 * - Itera todas las auras activas.
 * - Verifica scope (matchea attribute del monster + ownership).
 * - Verifica requireSourcePosition (si la fuente debe estar en DEF, etc.).
 * - Verifica excludeSelf.
 */
export function aurasApplicableTo(
  registry: AuraRegistry,
  state: DuelStateSchema,
  target: CardSchema,
  targetOwnerId: string,
  targetAttribute: string,
): { atkBonus: number; defBonus: number } {
  let atkBonus = 0;
  let defBonus = 0;

  for (const aura of registry.list()) {
    // Ownership check.
    const isOwn = aura.ownerId === targetOwnerId;
    if (aura.scope.startsWith('own') && !isOwn) continue;
    if (aura.scope === 'oppAll' && isOwn) continue;

    // Scope/attribute check.
    if (aura.scope === 'ownPlant' && targetAttribute !== 'Plant') continue;
    if (aura.scope === 'ownAquatic' && targetAttribute !== 'Aquatic') continue;
    if (aura.scope === 'ownBeast' && targetAttribute !== 'Beast') continue;
    if (aura.scope === 'ownBird' && targetAttribute !== 'Bird') continue;
    if (aura.scope === 'ownReptile' && targetAttribute !== 'Reptile') continue;

    // Exclude self.
    if (aura.excludeSelf && aura.sourceInstanceId === target.instanceId) continue;

    // Require source position: la fuente debe seguir en zona Y en la posición esperada.
    if (aura.requireSourcePosition) {
      const sourceOwner = state.players.get(aura.ownerId);
      const source = sourceOwner?.monsterZones.find((c) => c.instanceId === aura.sourceInstanceId)
        ?? sourceOwner?.spellTrapZones.find((c) => c.instanceId === aura.sourceInstanceId);
      if (!source) continue;
      if (source.position !== aura.requireSourcePosition) continue;
    }

    atkBonus += aura.atkBonus;
    defBonus += aura.defBonus;
  }

  return { atkBonus, defBonus };
}
