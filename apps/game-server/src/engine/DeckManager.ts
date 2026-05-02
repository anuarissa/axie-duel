/**
 * Manejo del mazo de un jugador en partida: shuffle determinista, draw,
 * mulligan, deck-out.
 */

import { ArraySchema } from '@colyseus/schema';
import { CardSchema } from '../rooms/schema/CardSchema.js';
import type { PlayerSchema } from '../rooms/schema/PlayerSchema.js';
import { SeededRng } from './rng.js';

export class DeckManager {
  constructor(private rng: SeededRng) {}

  shuffleDeck(player: PlayerSchema): void {
    const arr = [...player.deck];
    this.rng.shuffle(arr);
    player.deck.clear();
    for (const c of arr) player.deck.push(c);
  }

  /** Roba N cartas del top del mazo a la mano. Devuelve cuántas robó realmente
   *  (puede ser menos si hubo deck-out). */
  draw(player: PlayerSchema, n: number): number {
    let drawn = 0;
    for (let i = 0; i < n; i++) {
      const card = player.deck.shift();
      if (!card) return drawn;
      player.hand.push(card);
      drawn++;
    }
    player.handSize = player.hand.length;
    return drawn;
  }

  /** Mueve carta de mano a graveyard. */
  discardFromHand(player: PlayerSchema, instanceId: string): boolean {
    const idx = player.hand.findIndex((c) => c.instanceId === instanceId);
    if (idx === -1) return false;
    const card = player.hand.splice(idx, 1)[0]!;
    player.graveyard.push(card);
    player.handSize = player.hand.length;
    return true;
  }

  /** Devuelve true si ya no hay cartas para robar (deck out condition). */
  isDeckEmpty(player: PlayerSchema): boolean {
    return player.deck.length === 0;
  }

  /** Helper: instancia las cartas iniciales del jugador a partir de su lista de cardIds. */
  buildDeckFromCardIds(playerId: string, cardIds: string[]): ArraySchema<CardSchema> {
    const deck = new ArraySchema<CardSchema>();
    cardIds.forEach((cardId, i) => {
      const c = new CardSchema();
      c.instanceId = `${playerId}_d_${i}`;
      c.cardId = cardId;
      c.ownerId = playerId;
      c.position = '';
      c.faceDown = false;
      deck.push(c);
    });
    return deck;
  }
}
