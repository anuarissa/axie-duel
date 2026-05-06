/**
 * Append-only log de eventos del duelo. Determinista.
 *
 * El log se construye en memoria durante toda la partida. Al GAME_OVER,
 * DuelRoom lo manda al API junto con los datos del Match para persistencia.
 *
 * Combinado con `rngSeed` y los decklists iniciales, permite reconstruir
 * el duelo entero entrada por entrada — fundamental para "ver replay" + analytics
 * de balance.
 *
 * Cap defensivo: 10_000 entries max (un duelo realista tiene ~200-500 entries).
 * Si se excede, los eventos siguientes se descartan con un sentinel.
 */

const MAX_ENTRIES = 10_000;

export interface ReplayEntry {
  /** Milisegundos desde el inicio del match. */
  t: number;
  /** Tipo del evento. */
  type:
    | 'MATCH_START'
    | 'PHASE_CHANGED'
    | 'TURN_CHANGED'
    | 'CARD_DRAWN'
    | 'NORMAL_SUMMON'
    | 'SET_CARD'
    | 'ACTIVATE_EFFECT'
    | 'DECLARE_ATTACK'
    | 'CHANGE_POSITION'
    | 'COMBAT_RESOLVED'
    | 'EFFECT_TRIGGERED'
    | 'EFFECT_RESOLVED'
    | 'CARD_DESTROYED'
    | 'HAND_LIMIT_DISCARD'
    | 'GAME_OVER'
    | 'TRUNCATED';
  /** ID del jugador que originó el evento (sessionId o 'BOT'). */
  playerId?: string;
  /** Payload arbitrario tipado por evento. */
  data?: Record<string, unknown>;
}

export class ReplayLogger {
  private entries: ReplayEntry[] = [];
  private startedAt = Date.now();
  private truncated = false;

  start(): void {
    this.startedAt = Date.now();
    this.entries = [];
    this.truncated = false;
  }

  log(type: ReplayEntry['type'], playerId?: string, data?: Record<string, unknown>): void {
    if (this.truncated) return;
    if (this.entries.length >= MAX_ENTRIES) {
      this.entries.push({ t: Date.now() - this.startedAt, type: 'TRUNCATED' });
      this.truncated = true;
      return;
    }
    const entry: ReplayEntry = { t: Date.now() - this.startedAt, type };
    if (playerId !== undefined) entry.playerId = playerId;
    if (data !== undefined) entry.data = data;
    this.entries.push(entry);
  }

  /** Devuelve el array para serializar (no muta el log). */
  serialize(): ReplayEntry[] {
    return [...this.entries];
  }

  size(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries = [];
    this.truncated = false;
  }
}
