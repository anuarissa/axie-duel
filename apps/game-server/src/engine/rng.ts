/**
 * RNG determinista (Mulberry32). Tomado de la implementación de referencia
 * pública. Usar el MISMO seed garantiza el mismo orden de barajado y robos —
 * crítico para replays.
 */

export class SeededRng {
  private state: number;

  constructor(seed: string | number) {
    if (typeof seed === 'string') {
      // Hash simple FNV-1a para convertir string -> uint32.
      let h = 0x811c9dc5;
      for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
      }
      this.state = h >>> 0;
    } else {
      this.state = seed >>> 0;
    }
  }

  /** Random float in [0, 1). */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Random int in [0, max). */
  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }

  /** Fisher-Yates shuffle in place. Returns the same array. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      const tmp = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = tmp;
    }
    return arr;
  }
}
