/**
 * sound.ts — Sound engine para Axie Duel.
 *
 * Decisión técnica: TODOS los SFX se sintetizan con Web Audio API en runtime
 * (oscillators + envelopes). Cero archivos externos, cero licencias, cero round-trips.
 * Esto da SFX inmediatos (no hay assets que precargar) y son <1KB de código por sound.
 *
 * Para BACKGROUND MUSIC (loop ambiental): se busca lazy en `/sounds/bgm.mp3` o `.ogg`.
 * Si el archivo NO existe, simplemente no hay música — los SFX siguen funcionando.
 * El usuario puede dropear su propio MP3 en `apps/web/public/sounds/bgm.mp3` cuando
 * quiera (royalty-free recomendado: ver `docs/audio-sources.md`).
 *
 * Persistencia: master volume + mute state en localStorage (`axie:sound:*`).
 *
 * Uso:
 *   import { sound } from '@/lib/sound';
 *   sound.play('cardDeploy');
 *   sound.setVolume(0.5);
 *   sound.toggleMute();
 *   sound.startBgm();  // intenta cargar /sounds/bgm.mp3
 */

export type SfxKey =
  | 'click'
  | 'cardDraw'
  | 'cardDeploy'
  | 'cardSet'
  | 'spellActivate'
  | 'trapActivate'
  | 'attackHit'
  | 'attackMiss'
  | 'cardDestroyed'
  | 'lpDamage'
  | 'phaseAdvance'
  | 'turnStart'
  | 'victory'
  | 'defeat'
  | 'coinReward'
  | 'error';

const VOLUME_KEY = 'axie:sound:volume';
const MUTE_KEY = 'axie:sound:muted';
const BGM_VOLUME_KEY = 'axie:sound:bgm-volume';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmAudio: HTMLAudioElement | null = null;
  private bgmTried = false;
  private listeners = new Set<() => void>();
  // Synth BGM state
  private bgmGain: GainNode | null = null;
  private bgmTimer: ReturnType<typeof setTimeout> | null = null;
  private bgmActiveOscs: OscillatorNode[] = [];
  private bgmRunning = false;
  private firstGestureBound = false;

  // Persisted state (initialized lazily on client only).
  private _volume = 0.5;
  private _muted = false;
  private _bgmVolume = 0.25;
  private hydrated = false;

  // Hydrate from localStorage on first access (avoid SSR access).
  private hydrate(): void {
    if (this.hydrated || typeof window === 'undefined') return;
    this.hydrated = true;
    try {
      const v = localStorage.getItem(VOLUME_KEY);
      const m = localStorage.getItem(MUTE_KEY);
      const bv = localStorage.getItem(BGM_VOLUME_KEY);
      if (v !== null) this._volume = clamp(Number(v), 0, 1);
      if (m !== null) this._muted = m === '1';
      if (bv !== null) this._bgmVolume = clamp(Number(bv), 0, 1);
    } catch { /* ignore */ }
  }

  get volume(): number { this.hydrate(); return this._volume; }
  get muted(): boolean { this.hydrate(); return this._muted; }
  get bgmVolume(): number { this.hydrate(); return this._bgmVolume; }

  setVolume(v: number): void {
    this.hydrate();
    this._volume = clamp(v, 0, 1);
    try { localStorage.setItem(VOLUME_KEY, String(this._volume)); } catch { /* */ }
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.effectiveGain(), this.ctx.currentTime);
    }
    this.notify();
  }

  setBgmVolume(v: number): void {
    this.hydrate();
    this._bgmVolume = clamp(v, 0, 1);
    try { localStorage.setItem(BGM_VOLUME_KEY, String(this._bgmVolume)); } catch { /* */ }
    if (this.bgmAudio) this.bgmAudio.volume = this._muted ? 0 : this._bgmVolume;
    if (this.bgmGain && this.ctx) {
      this.bgmGain.gain.setValueAtTime(this.effectiveBgmGain(), this.ctx.currentTime);
    }
    this.notify();
  }

  private effectiveBgmGain(): number {
    // BGM at 60% of slider value, so synth chord stacks don't drown SFX.
    return this._muted ? 0 : this._bgmVolume * 0.6;
  }

  toggleMute(): void {
    this.hydrate();
    this._muted = !this._muted;
    try { localStorage.setItem(MUTE_KEY, this._muted ? '1' : '0'); } catch { /* */ }
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.effectiveGain(), this.ctx.currentTime);
    }
    if (this.bgmGain && this.ctx) {
      this.bgmGain.gain.setValueAtTime(this.effectiveBgmGain(), this.ctx.currentTime);
    }
    if (this.bgmAudio) this.bgmAudio.volume = this._muted ? 0 : this._bgmVolume;
    this.notify();
  }

  private effectiveGain(): number {
    return this._muted ? 0 : this._volume;
  }

  /** Subscribe a state changes (volume/mute). Returns unsubscribe fn. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    this.listeners.forEach((fn) => { try { fn(); } catch { /* */ } });
  }

  /** Lazy-init AudioContext on first sound. Browsers require user gesture for resume. */
  private ensureCtx(): AudioContext | null {
    this.hydrate();
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      type WebkitWindow = typeof window & { webkitAudioContext?: typeof AudioContext };
      const W = window as WebkitWindow;
      const Ctor = window.AudioContext ?? W.webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.effectiveGain();
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Reproduce un SFX por key. No-op si está muted. */
  play(key: SfxKey): void {
    if (this.muted) return;
    const ctx = this.ensureCtx();
    if (!ctx || !this.masterGain) return;
    const t0 = ctx.currentTime;
    switch (key) {
      case 'click':         return this.synthBlip(ctx, t0, 700, 0.04, 'square', 0.15);
      case 'cardDraw':      return this.synthSwoosh(ctx, t0, 600, 200, 0.18, 0.2);
      case 'cardDeploy':    return this.synthThud(ctx, t0, 0.35);
      case 'cardSet':       return this.synthBlip(ctx, t0, 320, 0.08, 'sine', 0.2);
      case 'spellActivate': return this.synthChime(ctx, t0, [880, 1320, 1760], 0.6);
      case 'trapActivate':  return this.synthSting(ctx, t0, 0.5);
      case 'attackHit':     return this.synthClash(ctx, t0, 0.45);
      case 'attackMiss':    return this.synthBlip(ctx, t0, 200, 0.1, 'triangle', 0.12);
      case 'cardDestroyed': return this.synthShatter(ctx, t0, 0.55);
      case 'lpDamage':      return this.synthBlip(ctx, t0, 180, 0.12, 'sawtooth', 0.18);
      case 'phaseAdvance':  return this.synthBlip(ctx, t0, 520, 0.06, 'sine', 0.15);
      case 'turnStart':     return this.synthChime(ctx, t0, [523, 659], 0.32);
      case 'victory':       return this.synthFanfare(ctx, t0, true);
      case 'defeat':        return this.synthFanfare(ctx, t0, false);
      case 'coinReward':    return this.synthChime(ctx, t0, [988, 1319, 1568, 2093], 0.5);
      case 'error':         return this.synthSting(ctx, t0, 0.25, 220);
    }
  }

  // ── Synth primitives ──────────────────────────────────────────────────

  private synthBlip(ctx: AudioContext, t0: number, freq: number, dur: number, type: OscillatorType, vol: number): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g); g.connect(this.masterGain!);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  private synthSwoosh(ctx: AudioContext, t0: number, fStart: number, fEnd: number, dur: number, vol: number): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass'; filt.Q.value = 6;
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(fStart, t0);
    osc.frequency.exponentialRampToValueAtTime(fEnd, t0 + dur);
    filt.frequency.setValueAtTime(fStart, t0);
    filt.frequency.exponentialRampToValueAtTime(fEnd, t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(filt); filt.connect(g); g.connect(this.masterGain!);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  private synthThud(ctx: AudioContext, t0: number, dur: number): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t0);
    osc.frequency.exponentialRampToValueAtTime(45, t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.4, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g); g.connect(this.masterGain!);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
    // Click layer
    this.synthBlip(ctx, t0, 1800, 0.04, 'triangle', 0.12);
  }

  private synthChime(ctx: AudioContext, t0: number, freqs: number[], dur: number): void {
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t0 + i * 0.05);
      g.gain.setValueAtTime(0, t0 + i * 0.05);
      g.gain.linearRampToValueAtTime(0.18, t0 + i * 0.05 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.05 + dur);
      osc.connect(g); g.connect(this.masterGain!);
      osc.start(t0 + i * 0.05);
      osc.stop(t0 + i * 0.05 + dur + 0.02);
    });
  }

  private synthSting(ctx: AudioContext, t0: number, dur: number, baseFreq = 380): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(baseFreq, t0);
    osc.frequency.linearRampToValueAtTime(baseFreq * 1.6, t0 + 0.05);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.5, t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.28, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g); g.connect(this.masterGain!);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  private synthClash(ctx: AudioContext, t0: number, dur: number): void {
    // Noise burst → metallic ring.
    const noise = this.makeNoiseBuffer(ctx, dur);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filt = ctx.createBiquadFilter();
    filt.type = 'highpass'; filt.frequency.value = 2000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filt); filt.connect(g); g.connect(this.masterGain!);
    src.start(t0); src.stop(t0 + dur);
    // Ring overlay
    [1200, 1800].forEach((f) => this.synthBlip(ctx, t0 + 0.02, f, 0.18, 'triangle', 0.12));
  }

  private synthShatter(ctx: AudioContext, t0: number, dur: number): void {
    const noise = this.makeNoiseBuffer(ctx, dur);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = 3500; filt.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filt); filt.connect(g); g.connect(this.masterGain!);
    src.start(t0); src.stop(t0 + dur);
    // Glass tinkle
    [2400, 3200, 4100].forEach((f, i) =>
      this.synthBlip(ctx, t0 + 0.06 + i * 0.04, f, 0.18, 'sine', 0.1),
    );
  }

  private synthFanfare(ctx: AudioContext, t0: number, victory: boolean): void {
    const seq = victory
      ? [523, 659, 784, 1047]   // C–E–G–C major
      : [392, 311, 261, 196];   // G–Eb–C–G minor
    seq.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = victory ? 'triangle' : 'sawtooth';
      osc.frequency.setValueAtTime(f, t0 + i * 0.18);
      g.gain.setValueAtTime(0, t0 + i * 0.18);
      g.gain.linearRampToValueAtTime(0.22, t0 + i * 0.18 + 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.18 + 0.6);
      osc.connect(g); g.connect(this.masterGain!);
      osc.start(t0 + i * 0.18);
      osc.stop(t0 + i * 0.18 + 0.62);
    });
  }

  private makeNoiseBuffer(ctx: AudioContext, dur: number): AudioBuffer {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ── Background music ──────────────────────────────────────────────────

  /**
   * Auto-start BGM cuando el usuario hace primer gesto (browsers requieren
   * user gesture para AudioContext.resume). Idempotente — solo registra una vez.
   * Estrategia: intenta cargar /sounds/bgm.mp3; si 404 o error, fallback a synth.
   */
  startBgmOnFirstGesture(srcPath?: string): void {
    if (typeof window === 'undefined' || this.firstGestureBound) return;
    this.firstGestureBound = true;
    const handler = () => {
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('keydown', handler);
      this.startBgm(srcPath);
    };
    window.addEventListener('pointerdown', handler, { once: false });
    window.addEventListener('keydown', handler, { once: false });
  }

  /** Intenta cargar archivo /sounds/bgm.mp3; si falla, arranca el synth ambient loop. */
  startBgm(srcPath = '/sounds/bgm.mp3'): void {
    if (typeof window === 'undefined') return;
    if (this.bgmTried) {
      // Re-resume si ya estaba corriendo
      if (this.bgmAudio) void this.bgmAudio.play().catch(() => undefined);
      else this.startSynthBgm();
      return;
    }
    this.bgmTried = true;
    this.hydrate();
    const audio = new Audio(srcPath);
    audio.loop = true;
    audio.volume = this._muted ? 0 : this._bgmVolume;
    audio.addEventListener('error', () => {
      this.bgmAudio = null;
      this.startSynthBgm();
    });
    void audio.play().then(() => { this.bgmAudio = audio; }).catch(() => {
      this.bgmAudio = null;
      this.startSynthBgm();
    });
  }

  /** Arranca un loop ambient procedural (chord pads en Am-F-C-G). */
  startSynthBgm(): void {
    if (this.bgmRunning) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;
    if (!this.bgmGain) {
      this.bgmGain = ctx.createGain();
      this.bgmGain.gain.value = this.effectiveBgmGain();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.7;
      this.bgmGain.connect(lp);
      lp.connect(ctx.destination);
    }
    this.bgmRunning = true;
    this.scheduleBgmLoop(ctx);
  }

  stopBgm(): void {
    if (this.bgmAudio) { this.bgmAudio.pause(); this.bgmAudio.currentTime = 0; this.bgmAudio = null; }
    this.bgmRunning = false;
    if (this.bgmTimer) { clearTimeout(this.bgmTimer); this.bgmTimer = null; }
    this.bgmActiveOscs.forEach((o) => { try { o.stop(); } catch { /* */ } });
    this.bgmActiveOscs = [];
  }

  /**
   * Loop ambient ALEGRE estilo anime/JRPG town theme.
   * Progresión: C - G - Am - F (I-V-vi-IV en Do mayor), tempo ~110 BPM.
   * Layers: walking bass + sustained pad + plucky 8th-note arpeggio + lead melody hook.
   * Cada chord = 4 beats. Loop completo = 16 beats ≈ 8.7s.
   */
  private scheduleBgmLoop(ctx: AudioContext): void {
    if (!this.bgmRunning || !this.bgmGain) return;
    const beat = 0.545; // sec per beat (~110 BPM)
    const chordDur = 4 * beat; // 4 beats per chord
    const t0 = ctx.currentTime + 0.05;

    // Chord progression (notes: bass, then chord pad notes root/3rd/5th, then octave)
    interface Chord { name: string; bass: number; pad: number[]; arp: number[]; melody: number[]; }
    const chords: Chord[] = [
      { // C major
        name: 'C', bass: 65.41,
        pad:    [261.63, 329.63, 392.00],         // C4 E4 G4
        arp:    [523.25, 659.25, 783.99, 659.25], // C5 E5 G5 E5
        melody: [783.99, 880.00, 783.99, 659.25], // G5 A5 G5 E5
      },
      { // G major
        name: 'G', bass: 49.00,
        pad:    [246.94, 293.66, 391.99],         // B3 D4 G4
        arp:    [493.88, 587.33, 783.99, 587.33], // B4 D5 G5 D5
        melody: [659.25, 587.33, 493.88, 587.33], // E5 D5 B4 D5
      },
      { // A minor
        name: 'Am', bass: 55.00,
        pad:    [261.63, 329.63, 440.00],         // C4 E4 A4
        arp:    [523.25, 659.25, 880.00, 659.25], // C5 E5 A5 E5
        melody: [880.00, 783.99, 659.25, 587.33], // A5 G5 E5 D5
      },
      { // F major
        name: 'F', bass: 43.65,
        pad:    [261.63, 349.23, 440.00],         // C4 F4 A4
        arp:    [523.25, 698.46, 880.00, 698.46], // C5 F5 A5 F5
        melody: [659.25, 698.46, 880.00, 1046.50],// E5 F5 A5 C6  (climbs to peak)
      },
    ];

    chords.forEach((chord, ci) => {
      const start = t0 + ci * chordDur;

      // 1. Walking bass: root on beat 1+3, fifth on beat 2+4 (bouncy, alegre).
      const fifth = chord.bass * 1.5;
      const bassPattern = [chord.bass, fifth, chord.bass, fifth];
      bassPattern.forEach((freq, b) => {
        const t = start + b * beat;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.16, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + beat * 0.85);
        osc.connect(g); g.connect(this.bgmGain!);
        osc.start(t); osc.stop(t + beat);
        this.bgmActiveOscs.push(osc);
      });

      // 2. Sustained pad (3 voices, full chord duration) — warm sine background.
      chord.pad.forEach((freq) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(0.075, start + 0.4);
        g.gain.setValueAtTime(0.075, start + chordDur - 0.4);
        g.gain.linearRampToValueAtTime(0, start + chordDur);
        osc.connect(g); g.connect(this.bgmGain!);
        osc.start(start); osc.stop(start + chordDur + 0.05);
        this.bgmActiveOscs.push(osc);
      });

      // 3. Plucky arpeggio: 8 eighth notes (4 patterns × 2 cycles), bright triangle.
      for (let cycle = 0; cycle < 2; cycle++) {
        chord.arp.forEach((freq, j) => {
          const t = start + cycle * 4 * (beat / 2) + j * (beat / 2);
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.value = freq;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.06, t + 0.015);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
          osc.connect(g); g.connect(this.bgmGain!);
          osc.start(t); osc.stop(t + 0.35);
          this.bgmActiveOscs.push(osc);
        });
      }

      // 4. Lead melody hook (4 quarter notes, square wave with filter for "8-bit anime").
      chord.melody.forEach((freq, b) => {
        const t = start + b * beat;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        const filt = ctx.createBiquadFilter();
        filt.type = 'lowpass'; filt.frequency.value = 1800; filt.Q.value = 2;
        osc.type = 'square';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.045, t + 0.04);
        g.gain.setValueAtTime(0.045, t + beat * 0.7);
        g.gain.exponentialRampToValueAtTime(0.001, t + beat * 0.95);
        osc.connect(filt); filt.connect(g); g.connect(this.bgmGain!);
        osc.start(t); osc.stop(t + beat);
        this.bgmActiveOscs.push(osc);
      });
    });

    // Schedule next iteration
    const loopMs = chords.length * chordDur * 1000;
    this.bgmTimer = setTimeout(() => {
      this.bgmActiveOscs = [];
      this.scheduleBgmLoop(ctx);
    }, loopMs);
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export const sound = new SoundEngine();
