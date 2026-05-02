/**
 * Registro central de handlers. EffectResolver enruta `effect.kind` a una de estas funciones.
 * Para agregar un nuevo efecto: crea el archivo, impórtalo y registra el `kind`.
 */

import type { EffectHandler } from './types.js';
import { damageEffect } from './DamageEffect.js';
import { drawEffect } from './DrawEffect.js';
import { buffEffect } from './BuffEffect.js';
import { equipEffect } from './EquipEffect.js';
import { tributeDrawEffect } from './TributeDrawEffect.js';
import { burnEffect } from './BurnEffect.js';

export const effectHandlers: Record<string, EffectHandler> = {
  damage: damageEffect,
  draw: drawEffect,
  buff: buffEffect,
  equip: equipEffect,
  tributeDraw: tributeDrawEffect,
  burn: burnEffect,
};

export type { EffectHandler, EffectContext, EffectResultData } from './types.js';
