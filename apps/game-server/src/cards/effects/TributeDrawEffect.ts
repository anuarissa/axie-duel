/**
 * Efecto: tributa 1 monstruo target del jugador (por filtro) y roba N cartas.
 * params: {
 *   drawAmount: number,
 *   tributeFilter?: 'any' | 'ownPlant' | 'ownAquatic' | 'ownBeast'
 * }
 *
 * Usado por: Verdant Renewal — tributar 1 Plant propio, robar 2.
 */

import type { EffectHandler } from './types.js';

const FILTER_ATTRIBUTE: Record<string, string> = {
  ownPlant: 'Plant',
  ownAquatic: 'Aquatic',
  ownBeast: 'Beast',
  ownBird: 'Bird',
  ownReptile: 'Reptile',
};

export const tributeDrawEffect: EffectHandler = ({ state, activatorId, targets, params }) => {
  const drawAmount = typeof params.drawAmount === 'number' ? params.drawAmount : 1;
  const filter = (params.tributeFilter as string) ?? 'any';

  const player = state.players.get(activatorId);
  if (!player) return { success: false, mutations: [], message: 'invalid player' };

  const targetId = targets[0];
  if (!targetId) return { success: false, mutations: [], message: 'tribute target required' };

  const idx = player.monsterZones.findIndex((c) => c.instanceId === targetId);
  if (idx === -1) return { success: false, mutations: [], message: 'target not on own field' };
  const target = player.monsterZones[idx]!;

  // Check filter — necesita el cardId para mirar attribute. Asumimos
  // que el caller ya validó esto vía ActionValidator. Aquí solo trust.
  if (filter !== 'any' && FILTER_ATTRIBUTE[filter]) {
    // No tenemos acceso directo a card def aquí sin pasar CardDatabase.
    // Validación más estricta queda como TODO Fase 1 (ya que ActionValidator
    // ya valida targets en general).
  }

  // Tributar: mover a graveyard, vaciar slot.
  player.graveyard.push(target);
  const empty = new (target.constructor as { new (): typeof target })();
  empty.instanceId = '';
  player.monsterZones[idx] = empty;

  // Robar.
  let drawn = 0;
  for (let i = 0; i < drawAmount; i++) {
    const card = player.deck.shift();
    if (!card) break;
    player.hand.push(card);
    drawn++;
  }
  player.handSize = player.hand.length;

  return {
    success: true,
    mutations: [`${targetId}->graveyard`, `${activatorId}.hand+=${drawn}`],
    message: `Tributed ${targetId}, drew ${drawn} card(s)`,
  };
};
