/**
 * Mapeo Axie part → habilidad de carta. Placeholder para Fase 1.
 * El esquema de "qué hace cada parte" se modela aquí cuando se implementen
 * los efectos por parte (ver master prompt sección 4.5 capa 2).
 */

export interface PartAbility {
  partId: string;
  partType: 'eyes' | 'ears' | 'mouth' | 'horn' | 'back' | 'tail';
  /** kind del efecto que registra. Mismo formato que cards/effects. */
  effectKind: string;
  /** Descripción humana del efecto. */
  description: string;
}

// TODO Fase 1: poblar con las habilidades reales de Axie Origins parts.
export const partAbilities: PartAbility[] = [];
