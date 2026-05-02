/**
 * Loader/getter del catálogo. Encapsula `@axie-duel/card-database` para que el motor
 * pueda mockearlo en tests sin tirar del paquete real.
 */

import { allCards, getCardById } from '@axie-duel/card-database';
import type { Card } from '@axie-duel/shared-types';

export class CardDatabase {
  getById(id: string): Card | undefined {
    return getCardById(id);
  }

  all(): Card[] {
    return allCards;
  }
}
