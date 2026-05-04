/**
 * spells-traps-dictionary — Vista normalizada de todos los Spells y Traps
 * con su `acquisitionType` (BASE / PACK_EXPANSION / AXIE_LINKED).
 *
 * Permite que el frontend, la tienda, el deck builder y el matchmaking
 * sepan qué cartas son free, cuáles requieren sobre, y cuáles requieren
 * un Axie específico en el deck.
 *
 * Source of truth: los JSONs `spell-cards.json` y `trap-cards.json` —
 * agregar/quitar cartas ahí. Esta dictionary los indexa.
 */

import type { SpellCard, TrapCard } from '@axie-duel/shared-types';
// Importamos DIRECTAMENTE de los JSONs (no via ./index) para evitar circular dependency:
// index.ts re-exporta este módulo, así que importar `spellCards` desde ./index produce TDZ.
import spellJson from './spell-cards.json' with { type: 'json' };
import trapJson from './trap-cards.json' with { type: 'json' };

const _spellCards = spellJson as unknown as SpellCard[];
const _trapCards = trapJson as unknown as TrapCard[];

export type AcquisitionType = 'BASE' | 'PACK_EXPANSION' | 'AXIE_LINKED';

export interface AxieLinkRequirement {
  axieClass: 'Beast' | 'Aquatic' | 'Plant' | 'Bird' | 'Reptile' | 'Bug' | 'Mech' | 'Dawn' | 'Dusk';
  /** Cantidad mínima de Axies de esta clase en el deck para usar la carta. */
  minCount: number;
}

export interface SpellTrapDictionaryEntry {
  cardId: string;
  name: string;
  type: 'Spell' | 'Trap';
  rarity: string;
  acquisitionType: AcquisitionType;
  axieLinkRequirement: AxieLinkRequirement | null;
  description: string;
}

/** Cast a JSON entry to dictionary entry (los JSONs ya tienen acquisitionType + axieLinkRequirement). */
function entryFromCard(c: SpellCard | TrapCard): SpellTrapDictionaryEntry {
  const raw = c as unknown as { acquisitionType?: AcquisitionType; axieLinkRequirement?: AxieLinkRequirement | null };
  return {
    cardId: c.id,
    name: c.name,
    type: c.type,
    rarity: c.rarity,
    acquisitionType: raw.acquisitionType ?? 'BASE',
    axieLinkRequirement: raw.axieLinkRequirement ?? null,
    description: c.description,
  };
}

/** Diccionario completo: cardId → entry con metadata de acquisición. */
export const spellsAndTrapsDictionary: Record<string, SpellTrapDictionaryEntry> = (() => {
  const out: Record<string, SpellTrapDictionaryEntry> = {};
  for (const c of _spellCards) out[c.id] = entryFromCard(c);
  for (const c of _trapCards) out[c.id] = entryFromCard(c);
  return out;
})();

/** Lista de cartas BASE (free para todos los users al registrarse). */
export const baseSpellsAndTraps: SpellTrapDictionaryEntry[] = Object.values(spellsAndTrapsDictionary)
  .filter((e) => e.acquisitionType === 'BASE');

/** Lista de cartas que solo se obtienen abriendo packs. */
export const packOnlySpellsAndTraps: SpellTrapDictionaryEntry[] = Object.values(spellsAndTrapsDictionary)
  .filter((e) => e.acquisitionType === 'PACK_EXPANSION');

/** Lista de cartas que requieren un Axie específico en el deck. */
export const axieLinkedSpellsAndTraps: SpellTrapDictionaryEntry[] = Object.values(spellsAndTrapsDictionary)
  .filter((e) => e.acquisitionType === 'AXIE_LINKED');

/**
 * Helper: chequea si un user con un set de Axies puede usar una carta dada.
 * Retorna `null` si puede usarla, o un mensaje de error si no.
 */
export function canUseCard(
  cardId: string,
  userAxieClasses: string[],
): string | null {
  const entry = spellsAndTrapsDictionary[cardId];
  if (!entry) return null; // unknown card → assume usable (Monster cards no están aquí)
  if (entry.acquisitionType !== 'AXIE_LINKED') return null;
  const req = entry.axieLinkRequirement;
  if (!req) return null;
  const count = userAxieClasses.filter((c) => c === req.axieClass).length;
  if (count >= req.minCount) return null;
  return `Requires ${req.minCount}× ${req.axieClass} Axie(s) in your deck.`;
}
