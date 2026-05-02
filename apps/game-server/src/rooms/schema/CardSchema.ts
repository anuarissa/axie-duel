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
}
