/**
 * Invocación normal: con o sin sacrificios. La validación de elegibilidad la hace
 * `ActionValidator`; aquí solo se aplica la mutación del estado.
 */

import type { DuelStateSchema } from '../rooms/schema/DuelStateSchema.js';
import type { CardSchema } from '../rooms/schema/CardSchema.js';
import type { CardDatabase } from '../cards/CardDatabase.js';

export class SummonSystem {
  constructor(
    private state: DuelStateSchema,
    private cards: CardDatabase,
  ) {}

  normalSummon(
    playerId: string,
    cardInstanceId: string,
    tributes: string[],
    position: 'ATK' | 'DEF' | 'DEF_FACEDOWN',
  ): void {
    const player = this.state.players.get(playerId);
    if (!player) throw new Error('player not found');

    const handIdx = player.hand.findIndex((c) => c.instanceId === cardInstanceId);
    if (handIdx === -1) throw new Error('card not in hand');
    const card = player.hand[handIdx]!;

    // Tributar.
    for (const tribId of tributes) {
      const tIdx = player.monsterZones.findIndex((m) => m.instanceId === tribId);
      if (tIdx === -1) throw new Error(`tribute ${tribId} not on field`);
      const tribute = player.monsterZones[tIdx]!;
      player.graveyard.push(tribute);
      const empty = new (tribute.constructor as { new (): typeof tribute })();
      empty.instanceId = '';
      player.monsterZones[tIdx] = empty;
    }

    // Sacar de la mano.
    player.hand.splice(handIdx, 1);
    player.handSize = player.hand.length;

    // Colocar en primera zona libre.
    const freeIdx = player.monsterZones.findIndex((z) => !z.instanceId);
    if (freeIdx === -1) throw new Error('no free monster zone');
    card.position = position;
    card.faceDown = position === 'DEF_FACEDOWN';
    card.hasAttacked = false;
    card.positionChangedThisTurn = true; // se resetea en End Phase
    player.monsterZones[freeIdx] = card;

    player.hasNormalSummonedThisTurn = true;
  }
}
