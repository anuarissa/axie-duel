/**
 * Catálogo central de cartas. Loader que devuelve un array tipado
 * unificado consumible por `apps/api` (seed Prisma) y `apps/game-server`.
 */

import type { Card, MonsterCard, SpellCard, TrapCard } from '@axie-duel/shared-types';
import monsterJson from './monster-cards.json' with { type: 'json' };
import spellJson from './spell-cards.json' with { type: 'json' };
import trapJson from './trap-cards.json' with { type: 'json' };

export const monsterCards: MonsterCard[] = monsterJson as unknown as MonsterCard[];
export const spellCards: SpellCard[] = spellJson as unknown as SpellCard[];
export const trapCards: TrapCard[] = trapJson as unknown as TrapCard[];

export const allCards: Card[] = [...monsterCards, ...spellCards, ...trapCards];

export function getCardById(id: string): Card | undefined {
  return allCards.find((c) => c.id === id);
}

export * from './axie-parts-mapping.js';
export * from './axie-parts-dictionary.js';
export * from './spells-traps-dictionary.js';
