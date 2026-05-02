/**
 * Schema Colyseus del jugador dentro de la partida.
 * El cliente solo recibe la mano de su propio jugador (filtrado en DuelRoom.onPatch).
 */

import { Schema, type, ArraySchema } from '@colyseus/schema';
import { CardSchema } from './CardSchema.js';

export class PlayerSchema extends Schema {
  @type('string') id = '';
  @type('string') username = '';
  @type('int32') lifePoints = 8000;
  @type('int32') handSize = 0;
  /** Mano del jugador. Solo se sincroniza al cliente del mismo jugador. */
  @type([CardSchema]) hand = new ArraySchema<CardSchema>();
  @type([CardSchema]) deck = new ArraySchema<CardSchema>();
  @type([CardSchema]) extraDeck = new ArraySchema<CardSchema>();
  @type([CardSchema]) graveyard = new ArraySchema<CardSchema>();
  @type([CardSchema]) banished = new ArraySchema<CardSchema>();
  /** 5 zonas de monstruos. null se representa como CardSchema con instanceId vacío. */
  @type([CardSchema]) monsterZones = new ArraySchema<CardSchema>();
  @type([CardSchema]) spellTrapZones = new ArraySchema<CardSchema>();
  @type(CardSchema) fieldSpell = new CardSchema();
  @type('boolean') hasNormalSummonedThisTurn = false;
  @type('boolean') awaitingChainResponse = false;
  @type('boolean') isFirstPlayer = false;
}
