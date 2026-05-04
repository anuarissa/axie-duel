/**
 * Schema Colyseus de una instancia de carta dentro de la partida.
 * Espeja `CardInstance` de `@axie-duel/shared-types`.
 */

import { Schema, type, MapSchema } from '@colyseus/schema';

export class CardSchema extends Schema {
  @type('string') instanceId = '';
  @type('string') cardId = '';
  @type('string') ownerId = '';
  /** 'ATK' | 'DEF' | 'DEF_FACEDOWN' | '' (none, para Spell/Trap). */
  @type('string') position = '';
  @type('boolean') faceDown = false;
  @type('int32') atkMod = 0;
  @type('int32') defMod = 0;
  @type({ map: 'int32' }) counters = new MapSchema<number>();
  @type('boolean') hasAttacked = false;
  @type('boolean') positionChangedThisTurn = false;
  /**
   * Snapshot del bonus efectivo proveniente de AuraRegistry (continuousAura, beastSwarm,
   * antiPlantDebuff, auraDef). NO se sincroniza vía atkMod porque las auras se computan
   * server-side dinámicamente. Este campo se actualiza tras cada acción que pueda cambiar
   * el field state, así el cliente puede mostrar stats efectivos + indicador visual.
   */
  @type('int32') auraAtkBonus = 0;
  @type('int32') auraDefBonus = 0;
  /** True si el monster está afectado por algún aura, equip, fieldTrigger u otro modifier. */
  @type('boolean') affectedByAura = false;
}
