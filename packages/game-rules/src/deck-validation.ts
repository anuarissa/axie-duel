/**
 * Validación de mazos según las reglas del master prompt sección 4.1:
 * - Main deck: 40-60
 * - Extra deck: 0-15
 * - Side deck: 0-15
 * - Máximo 3 copias del mismo cardId en main+extra+side combinados.
 */

import { DECK_MAX, DECK_MIN, EXTRA_DECK_MAX, MAX_COPIES_PER_CARD, SIDE_DECK_MAX } from './constants.js';

export interface DeckEntry {
  cardId: string;
  zone: 'Main' | 'Extra' | 'Side';
  quantity: number;
}

export interface DeckValidationResult {
  valid: boolean;
  errors: string[];
  mainCount: number;
  extraCount: number;
  sideCount: number;
}

export function validateDeck(entries: DeckEntry[]): DeckValidationResult {
  const errors: string[] = [];
  let mainCount = 0;
  let extraCount = 0;
  let sideCount = 0;

  // Contadores para detectar >3 copias acumuladas entre zonas.
  const totalCopiesByCard = new Map<string, number>();

  for (const entry of entries) {
    if (entry.quantity < 1) {
      errors.push(`Card ${entry.cardId} has invalid quantity ${entry.quantity}`);
      continue;
    }
    switch (entry.zone) {
      case 'Main':
        mainCount += entry.quantity;
        break;
      case 'Extra':
        extraCount += entry.quantity;
        break;
      case 'Side':
        sideCount += entry.quantity;
        break;
    }
    totalCopiesByCard.set(
      entry.cardId,
      (totalCopiesByCard.get(entry.cardId) ?? 0) + entry.quantity,
    );
  }

  if (mainCount < DECK_MIN || mainCount > DECK_MAX) {
    errors.push(`Main deck must have ${DECK_MIN}-${DECK_MAX} cards (has ${mainCount})`);
  }
  if (extraCount > EXTRA_DECK_MAX) {
    errors.push(`Extra deck max is ${EXTRA_DECK_MAX} (has ${extraCount})`);
  }
  if (sideCount > SIDE_DECK_MAX) {
    errors.push(`Side deck max is ${SIDE_DECK_MAX} (has ${sideCount})`);
  }

  for (const [cardId, total] of totalCopiesByCard.entries()) {
    if (total > MAX_COPIES_PER_CARD) {
      errors.push(`Card ${cardId} has ${total} copies (max ${MAX_COPIES_PER_CARD})`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    mainCount,
    extraCount,
    sideCount,
  };
}
