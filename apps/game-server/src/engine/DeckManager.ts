/**
 * Manejo del mazo de un jugador en partida: shuffle determinista, draw,
 * mulligan, deck-out.
 */

import { ArraySchema } from '@colyseus/schema';
import { CardSchema } from '../rooms/schema/CardSchema.js';
import type { PlayerSchema } from '../rooms/schema/PlayerSchema.js';
import { SeededRng } from './rng.js';
import type { CardDatabase } from '../cards/CardDatabase.js';

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

  /**
   * Garantía anti-bricking: la mano inicial DEBE tener al menos 1 monster
   * level 1-4 (jugable sin tribute) para que el jugador pueda actuar el primer turno.
   *
   * Algoritmo:
   *  1. Roba `n` cartas normales.
   *  2. Si la mano resultante NO tiene ningún monster L≤4, busca el primer
   *     monster L≤4 en el TOP del deck restante y lo intercambia con la última
   *     carta de la mano.
   *  3. Si el deck no tiene NINGÚN monster L≤4 (deck patológico), no hay nada
   *     que hacer — la mano queda como salió.
   *
   * Mantiene el shuffle determinista intacto en el resto del deck.
   */
  drawStartingHand(player: PlayerSchema, n: number, cards: CardDatabase): number {
    const drawn = this.draw(player, n);
    if (drawn === 0) return 0;
    const hasPlayableMonster = player.hand.some((c) => {
      const def = cards.getById(c.cardId);
      if (!def || def.type !== 'Monster') return false;
      return (def.level ?? 0) <= 4;
    });
    if (hasPlayableMonster) return drawn;

    // Buscar el primer monster L≤4 en el deck restante.
    const swapIdx = player.deck.findIndex((c) => {
      const def = cards.getById(c.cardId);
      if (!def || def.type !== 'Monster') return false;
      return (def.level ?? 0) <= 4;
    });
    if (swapIdx === -1) return drawn; // deck no tiene low-level monsters, nada que hacer

    // Intercambio: la última carta de la mano se reinserta DETRÁS de la swap card,
    // y la swap card pasa al final de la mano.
    const lastHandIdx = player.hand.length - 1;
    const handCard = player.hand[lastHandIdx]!;
    const swapCard = player.deck[swapIdx]!;
    player.deck.splice(swapIdx, 1);
    player.hand[lastHandIdx] = swapCard;
    // Re-insertamos la handCard cerca del fondo del deck (~75% pos) para que no se robe muy pronto.
    // IMPORTANTE: Colyseus 0.16 ArraySchema NO soporta splice con insertCount > deleteCount
    // (error "ArraySchema#splice(): insertCount must be equal or lower than deleteCount").
    // Usamos clear + repush — patrón ya probado en shuffleDeck.
    const insertPos = Math.min(player.deck.length, Math.floor(player.deck.length * 0.75));
    const deckArr = [...player.deck];
    deckArr.splice(insertPos, 0, handCard);
    player.deck.clear();
    for (const c of deckArr) player.deck.push(c);
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
