/**
 * Contrato del handler de efectos. Cada `kind` declarativo en JSON tiene
 * un handler implementado aquí.
 */

import type { DuelStateSchema } from '../../rooms/schema/DuelStateSchema.js';
import type { CardSchema } from '../../rooms/schema/CardSchema.js';

export interface EffectContext {
  state: DuelStateSchema;
  /** Carta activadora. */
  source: CardSchema;
  /** Player que activó el efecto. */
  activatorId: string;
  /** instanceIds elegidos como target (si aplica). */
  targets: string[];
  /** Parámetros declarados en JSON. */
  params: Record<string, unknown>;
}

export interface EffectResultData {
  success: boolean;
  mutations: string[];
  message?: string;
}

export type EffectHandler = (ctx: EffectContext) => EffectResultData;
