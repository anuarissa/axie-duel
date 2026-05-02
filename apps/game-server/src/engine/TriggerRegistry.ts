/**
 * Tracking de qué triggered handlers están suscritos a qué CardSchema.
 *
 * Cuando una carta se SET en zona spell/trap (o se ACTIVATE como Field Spell),
 * sus handlers triggered se registran en EventBus. Cuando esa carta se mueve
 * a graveyard / banished / vuelve a la mano, los handlers se desuscriben.
 *
 * El TriggerRegistry mantiene el mapping `instanceId → handler[]` para poder
 * hacer cleanup limpio. Sin esto, los handlers quedan colgados en el bus y
 * disparan después de que la carta ya no está en juego — bug grave.
 */

import type { EventBus, EngineEvent, EngineEventType, EventHandler } from './EventBus.js';

interface RegisteredHandler {
  type: EngineEventType;
  handler: EventHandler<EngineEvent>;
}

export class TriggerRegistry {
  private subscriptions = new Map<string, RegisteredHandler[]>();

  constructor(private bus: EventBus) {}

  register<T extends EngineEvent>(
    instanceId: string,
    type: T['type'],
    handler: EventHandler<T>,
  ): void {
    this.bus.on(type, handler);
    const list = this.subscriptions.get(instanceId) ?? [];
    list.push({ type, handler: handler as EventHandler<EngineEvent> });
    this.subscriptions.set(instanceId, list);
  }

  /** Desuscribe TODOS los handlers asociados a este instanceId. */
  unregisterAll(instanceId: string): void {
    const list = this.subscriptions.get(instanceId);
    if (!list) return;
    for (const { type, handler } of list) {
      this.bus.off(type, handler);
    }
    this.subscriptions.delete(instanceId);
  }

  /** Cuántos handlers tiene una carta. Útil para tests. */
  countFor(instanceId: string): number {
    return this.subscriptions.get(instanceId)?.length ?? 0;
  }

  clear(): void {
    this.subscriptions.clear();
  }
}
