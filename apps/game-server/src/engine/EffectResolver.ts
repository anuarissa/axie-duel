/**
 * Cadena de efectos al estilo Yu-Gi-Oh!:
 * - Cuando alguien activa un efecto, se abre una "ventana" para que el oponente
 *   responda con un efecto de Spell Speed igual o superior.
 * - Si nadie responde en `CHAIN_RESPONSE_WINDOW_MS`, la cadena se resuelve LIFO.
 *
 * Esta clase NO maneja timers — los timers viven en `DuelRoom` que llama
 * `closeChainAndResolve()` cuando el deadline expira.
 */

import { ArraySchema } from '@colyseus/schema';
import { ChainLinkSchema } from '../rooms/schema/ChainLinkSchema.js';
import type { DuelStateSchema } from '../rooms/schema/DuelStateSchema.js';
import type { CardDatabase } from '../cards/CardDatabase.js';
import { effectHandlers, type EffectResultData } from '../cards/effects/index.js';
import type { CardSchema } from '../rooms/schema/CardSchema.js';
import type { Logger } from 'pino';

export class EffectResolver {
  constructor(
    private state: DuelStateSchema,
    private cards: CardDatabase,
    private log: Logger,
  ) {}

  /**
   * Añade un efecto a la cadena. Devuelve el ChainLink creado.
   * El caller decide si abre ventana de respuesta para el rival o resuelve directo.
   */
  addToChain(activatorId: string, source: CardSchema, targets: string[]): ChainLinkSchema {
    const def = this.cards.getById(source.cardId);
    if (!def?.effect) throw new Error(`Card ${source.cardId} has no effect`);
    const link = new ChainLinkSchema();
    link.index = this.state.chain.length + 1;
    link.playerId = activatorId;
    link.cardInstanceId = source.instanceId;
    link.spellSpeed = def.effect.spellSpeed;
    link.targets = new ArraySchema<string>(...targets);
    this.state.chain.push(link);
    this.log.info({ link: link.index, kind: def.effect.kind, activator: activatorId }, 'chain link added');
    return link;
  }

  /**
   * Resuelve toda la cadena LIFO. Cada link ejecuta su handler en orden inverso.
   * Devuelve los resultados en orden de resolución.
   */
  resolveChain(): EffectResultData[] {
    const results: EffectResultData[] = [];
    while (this.state.chain.length > 0) {
      const link = this.state.chain[this.state.chain.length - 1]!;
      const result = this.resolveLink(link);
      link.resolved = true;
      link.resultMessage = result.message ?? '';
      results.push(result);
      this.state.chain.pop();
    }
    return results;
  }

  private resolveLink(link: ChainLinkSchema): EffectResultData {
    // Buscar la carta que originó el link (puede estar en cualquier zona).
    const player = this.state.players.get(link.playerId);
    if (!player) return { success: false, mutations: [], message: 'no activator' };
    const source = this.findCardInPlayer(player, link.cardInstanceId);
    if (!source) return { success: false, mutations: [], message: 'source card not found' };

    const def = this.cards.getById(source.cardId);
    if (!def?.effect) return { success: false, mutations: [], message: 'no effect on card' };

    const handler = effectHandlers[def.effect.kind];
    if (!handler) {
      this.log.warn({ kind: def.effect.kind }, 'no handler for effect kind');
      return { success: false, mutations: [], message: `unhandled effect kind ${def.effect.kind}` };
    }

    return handler({
      state: this.state,
      source,
      activatorId: link.playerId,
      targets: [...link.targets],
      params: def.effect.params ?? {},
    });
  }

  private findCardInPlayer(player: ReturnType<DuelStateSchema['players']['get']>, instanceId: string): CardSchema | undefined {
    if (!player) return undefined;
    return (
      player.hand.find((c) => c.instanceId === instanceId) ??
      player.monsterZones.find((c) => c.instanceId === instanceId) ??
      player.spellTrapZones.find((c) => c.instanceId === instanceId)
    );
  }
}
