/**
 * Procedural WebAudio engine.
 *
 * There are no audio assets: every sound effect and every BGM note is
 * synthesised with oscillators and a single shared noise buffer. The engine is
 * deliberately defensive because it also runs in Node (tests) and on mobile
 * Safari, where the AudioContext may only be created/resumed from a gesture.
 *
 * All `play` scheduling uses AudioContext.currentTime. Nothing touches the
 * WebAudio API until `unlock()` is called.
 */

export type SfxName =
  | 'shot'
  | 'enemyHit'
  | 'enemyKilled'
  | 'graze'
  | 'playerHit'
  | 'bomb'
  | 'item'
  | 'bossWarning'
  | 'phase'
  | 'laser'
  | 'extend'
  | 'cancel'
  | 'uiTap'
  | 'uiBack';

export type BgmTrack = 'title' | 'stage' | 'boss' | 'clear' | 'gameover';

export interface AudioEngine {
  unlock(): void;
  play(name: SfxName, volume?: number): void;
  playBgm(track: BgmTrack): void;
  stopBgm(): void;
  setEnabled(enabled: boolean): void;
  readonly enabled: boolean;
}

const MASTER_GAIN = 0.22;
const MUSIC_GAIN = 0.7;

/** Same effect may not retrigger faster than this (seconds of context time). */
const SFX_RATE_LIMIT = 0.03;

/** Upper bound on concurrently scheduled oscillator/buffer sources. */
const MAX_VOICES = 24;

const SCHEDULER_MS = 100;
const LOOKAHEAD = 0.3;

type AudioContextCtor = new () => AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  const scope = globalThis as typeof globalThis & { webkitAudioContext?: AudioContextCtor };
  if (typeof AudioContext !== 'undefined') return AudioContext;
  return typeof scope.webkitAudioContext === 'function' ? scope.webkitAudioContext : null;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function midiToHz(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

/** One deterministic noise buffer is shared by every noise-based effect. */
function makeNoiseBuffer(ctx: AudioContext): AudioBuffer | null {
  try {
    const length = Math.max(1, Math.floor(ctx.sampleRate * 0.5));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 0x1f2e3d4c;
    for (let i = 0; i < length; i += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed / 0x100000000) * 2 - 1;
    }
    return buffer;
  } catch {
    return null;
  }
}

interface FilterSpec {
  readonly type: BiquadFilterType;
  readonly from: number;
  readonly to?: number;
  readonly q?: number;
}

interface TremoloSpec {
  readonly rate: number;
  readonly depth: number;
}

interface ToneSpec {
  readonly type: OscillatorType;
  /** Absolute context time. */
  readonly at: number;
  /** Seconds; the envelope releases to silence at at + duration. */
  readonly duration: number;
  readonly gain: number;
  /** [seconds after `at`, Hz] breakpoints, fed to set/exponential ramps. */
  readonly freq: readonly (readonly [number, number])[];
  readonly attack?: number;
  readonly detune?: number;
  readonly filter?: FilterSpec;
  readonly tremolo?: TremoloSpec;
  readonly dest?: AudioNode;
}

interface NoiseSpec {
  readonly at: number;
  readonly duration: number;
  readonly gain: number;
  readonly attack?: number;
  readonly filter?: FilterSpec;
  readonly dest?: AudioNode;
}

interface BgmDef {
  readonly bpm: number;
  /** Steps per beat: 4 = 16th notes, 2 = 8th notes. */
  readonly subdivision: number;
  /** MIDI root of the key. */
  readonly root: number;
  readonly bassOctave: number;
  readonly arpOctave: number;
  readonly padOctave: number;
  readonly bassWave: OscillatorType;
  readonly arpWave: OscillatorType;
  readonly padWave: OscillatorType;
  readonly bassGain: number;
  readonly arpGain: number;
  readonly padGain: number;
  /** Cents; used by the game-over track to sound worn out. */
  readonly detune?: number;
  /** Semitone offsets from root; null is a rest. */
  readonly bass: readonly (number | null)[];
  readonly arp: readonly (number | null)[];
  /** One chord per bar, as semitone offsets from root. */
  readonly chords: readonly (readonly number[])[];
}

const BGM_TRACKS: Record<BgmTrack, BgmDef> = {
  title: {
    bpm: 80,
    subdivision: 2,
    root: 60,
    bassOctave: -1,
    arpOctave: 1,
    padOctave: 0,
    bassWave: 'sine',
    arpWave: 'triangle',
    padWave: 'sine',
    bassGain: 0.13,
    arpGain: 0.04,
    padGain: 0.022,
    bass: [0, null, 0, null, 9, null, 9, null, 5, null, 5, null, 7, null, 7, null],
    arp: [12, null, 16, 19, null, 16, 12, null, 21, null, 19, 16, null, 12, null, 7],
    chords: [
      [0, 4, 7, 11],
      [9, 12, 16, 19],
      [5, 9, 12, 16],
      [7, 11, 14, 17],
    ],
  },
  stage: {
    bpm: 140,
    subdivision: 4,
    root: 57,
    bassOctave: -1,
    arpOctave: 0,
    padOctave: 0,
    bassWave: 'sawtooth',
    arpWave: 'square',
    padWave: 'triangle',
    bassGain: 0.11,
    arpGain: 0.032,
    padGain: 0.018,
    bass: [0, null, 0, 0, null, 0, null, 0, 8, null, 8, 8, null, 8, null, 8],
    arp: [0, 7, 12, 15, 12, 7, 3, 7, 8, 12, 15, 20, 15, 12, 8, 7],
    chords: [
      [0, 3, 7],
      [8, 12, 15],
      [3, 7, 10],
      [10, 14, 17],
    ],
  },
  boss: {
    bpm: 150,
    subdivision: 4,
    root: 57,
    bassOctave: -1,
    arpOctave: 0,
    padOctave: 0,
    bassWave: 'square',
    arpWave: 'sawtooth',
    padWave: 'triangle',
    bassGain: 0.1,
    arpGain: 0.026,
    padGain: 0.02,
    bass: [
      0, null, 0, 0, 0, null, 0, 0, 1, null, 1, 1, 1, null, 1, 1,
      0, null, 0, 0, 0, null, 0, 0, 7, null, 7, 7, 7, null, 7, 7,
    ],
    arp: [
      0, 3, 7, 3, 12, 7, 3, 0, 1, 4, 8, 4, 13, 8, 4, 1,
      0, 3, 7, 3, 12, 7, 3, 0, 7, 11, 14, 11, 19, 14, 11, 7,
    ],
    chords: [
      [0, 3, 7],
      [1, 4, 8],
      [0, 3, 7],
      [7, 11, 14],
    ],
  },
  clear: {
    bpm: 112,
    subdivision: 2,
    root: 62,
    bassOctave: -1,
    arpOctave: 0,
    padOctave: 0,
    bassWave: 'triangle',
    arpWave: 'sine',
    padWave: 'sine',
    bassGain: 0.12,
    arpGain: 0.045,
    padGain: 0.024,
    bass: [0, null, 5, null, 7, null, 0, null],
    arp: [12, 16, 19, 24, 19, 16, 12, 16],
    chords: [
      [0, 4, 7],
      [5, 9, 12],
      [7, 11, 14],
      [0, 4, 7],
    ],
  },
  gameover: {
    bpm: 60,
    subdivision: 2,
    root: 57,
    bassOctave: -1,
    arpOctave: 0,
    padOctave: 0,
    bassWave: 'sine',
    arpWave: 'triangle',
    padWave: 'sine',
    bassGain: 0.12,
    arpGain: 0.035,
    padGain: 0.028,
    detune: 9,
    bass: [0, null, null, null, 8, null, null, null, 5, null, null, null, 7, null, null, null],
    arp: [0, null, null, null, 12, null, null, null, 5, null, null, null, 7, null, null, null],
    chords: [
      [0, 3, 7],
      [8, 12, 15],
      [5, 8, 12],
      [7, 11, 14],
    ],
  },
};

class ProceduralAudio implements AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  private _enabled = true;
  private voices = 0;
  private readonly lastPlayed = new Map<SfxName, number>();

  private requestedTrack: BgmTrack | null = null;
  private playingTrack: BgmTrack | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextStepAt = 0;
  private stepIndex = 0;

  get enabled(): boolean {
    return this._enabled;
  }

  unlock(): void {
    const Ctor = audioContextCtor();
    if (!Ctor) return;

    if (!this.ctx) {
      try {
        const ctx = new Ctor();
        const master = ctx.createGain();
        master.gain.value = this._enabled ? MASTER_GAIN : 0;
        master.connect(ctx.destination);

        const music = ctx.createGain();
        music.gain.value = 0.0001;
        music.connect(master);

        this.ctx = ctx;
        this.master = master;
        this.musicBus = music;
        this.noise = makeNoiseBuffer(ctx);
      } catch {
        this.ctx = null;
        this.master = null;
        this.musicBus = null;
        this.noise = null;
        return;
      }
    }

    if (!this.ctx) return;
    // Resume unconditionally (not only on 'suspended'): Safari also reports
    // 'interrupted' after calls/notifications, and resume() is harmless when
    // the context is already running.
    if (this._enabled) this.resumeContext();
    if (this._enabled && this.requestedTrack !== null && this.timer === null) {
      this.startTrack(this.requestedTrack);
    }
  }

  play(name: SfxName, volume = 1): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this._enabled) return;

    const level = clamp(volume, 0, 1.5);
    if (level <= 0) return;

    const now = ctx.currentTime;
    const last = this.lastPlayed.get(name);
    if (last !== undefined && now - last < SFX_RATE_LIMIT) return;
    this.lastPlayed.set(name, now);

    try {
      this.synth(name, now, level);
    } catch {
      // A partially implemented AudioContext must never break the game loop.
    }
  }

  playBgm(track: BgmTrack): void {
    this.requestedTrack = track;
    if (!this._enabled || !this.ctx) return;
    if (this.playingTrack === track && this.timer !== null) return;
    this.resumeContext();
    this.startTrack(track);
  }

  stopBgm(): void {
    this.requestedTrack = null;
    this.clearScheduler();
    const ctx = this.ctx;
    const bus = this.musicBus;
    if (!ctx || !bus) return;
    const now = ctx.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), now);
    bus.gain.linearRampToValueAtTime(0.0001, now + 0.08);
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this._enabled) return;
    this._enabled = enabled;

    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(enabled ? MASTER_GAIN : 0, now + (enabled ? 0.12 : 0.06));

    if (!enabled) {
      this.clearScheduler();
      this.suspendContext();
      return;
    }

    this.resumeContext();
    if (this.requestedTrack !== null) this.startTrack(this.requestedTrack);
  }

  // --------------------------------------------------------------- graph utils

  private resumeContext(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const pending = ctx.resume();
      if (pending && typeof pending.catch === 'function') pending.catch(() => undefined);
    } catch {
      // Autoplay policy may reject until the next gesture; unlock() retries.
    }
  }

  private suspendContext(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const pending = ctx.suspend();
      if (pending && typeof pending.catch === 'function') pending.catch(() => undefined);
    } catch {
      // Nothing to recover from; the next unlock() will try again.
    }
  }

  private makeFilter(spec: FilterSpec, at: number, stop: number): BiquadFilterNode | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    try {
      const filter = ctx.createBiquadFilter();
      filter.type = spec.type;
      filter.frequency.setValueAtTime(Math.max(20, spec.from), at);
      if (spec.to !== undefined) {
        filter.frequency.exponentialRampToValueAtTime(Math.max(20, spec.to), stop);
      }
      filter.Q.value = spec.q ?? 0.8;
      return filter;
    } catch {
      return null;
    }
  }

  private tone(spec: ToneSpec): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const needed = spec.tremolo ? 2 : 1;
    if (this.voices + needed > MAX_VOICES) return;

    const at = spec.at;
    const duration = Math.max(0.012, spec.duration);
    const stop = at + duration;
    const dest = spec.dest ?? master;

    let osc: OscillatorNode | null = null;
    let env: GainNode | null = null;
    let filter: BiquadFilterNode | null = null;
    let trem: GainNode | null = null;
    let lfo: OscillatorNode | null = null;
    let lfoDepth: GainNode | null = null;
    let counted = false;
    let released = false;

    const release = (): void => {
      if (released) return;
      released = true;
      if (counted) this.voices = Math.max(0, this.voices - needed);
      for (const node of [osc, env, filter, trem, lfo, lfoDepth]) {
        if (!node) continue;
        try {
          node.disconnect();
        } catch {
          // Already disconnected.
        }
      }
    };

    try {
      osc = ctx.createOscillator();
      osc.type = spec.type;
      for (const [offset, hz] of spec.freq) {
        const time = at + Math.max(0, offset);
        const value = Math.max(1, hz);
        if (offset <= 0) osc.frequency.setValueAtTime(value, time);
        else osc.frequency.exponentialRampToValueAtTime(value, time);
      }
      if (spec.detune) osc.detune.setValueAtTime(spec.detune, at);

      env = ctx.createGain();
      const peak = Math.max(0.0001, spec.gain);
      const attack = Math.min(spec.attack ?? 0.004, duration * 0.5);
      env.gain.setValueAtTime(0.0001, at);
      env.gain.linearRampToValueAtTime(peak, at + Math.max(0.001, attack));
      env.gain.exponentialRampToValueAtTime(0.0001, stop);

      let tail: AudioNode = osc;
      if (spec.filter) {
        filter = this.makeFilter(spec.filter, at, stop);
        if (filter) {
          tail.connect(filter);
          tail = filter;
        }
      }
      tail.connect(env);

      if (spec.tremolo) {
        const depth = clamp(spec.tremolo.depth, 0, 0.9);
        trem = ctx.createGain();
        trem.gain.value = 1 - depth;
        lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(Math.max(0.1, spec.tremolo.rate), at);
        lfoDepth = ctx.createGain();
        lfoDepth.gain.value = depth;
        lfo.connect(lfoDepth);
        lfoDepth.connect(trem.gain);
        env.connect(trem);
        trem.connect(dest);
      } else {
        env.connect(dest);
      }

      this.voices += needed;
      counted = true;
      osc.onended = release;
      osc.start(at);
      osc.stop(stop);
      if (lfo) {
        lfo.start(at);
        lfo.stop(stop);
      }
    } catch {
      release();
    }
  }

  private noiseBurst(spec: NoiseSpec): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.noise) return;
    if (this.voices >= MAX_VOICES) return;

    const at = spec.at;
    const duration = Math.max(0.012, spec.duration);
    const stop = at + duration;
    const dest = spec.dest ?? master;

    let src: AudioBufferSourceNode | null = null;
    let env: GainNode | null = null;
    let filter: BiquadFilterNode | null = null;
    let counted = false;
    let released = false;

    const release = (): void => {
      if (released) return;
      released = true;
      if (counted) this.voices = Math.max(0, this.voices - 1);
      for (const node of [src, env, filter]) {
        if (!node) continue;
        try {
          node.disconnect();
        } catch {
          // Already disconnected.
        }
      }
    };

    try {
      src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;

      env = ctx.createGain();
      const peak = Math.max(0.0001, spec.gain);
      const attack = Math.min(spec.attack ?? 0.003, duration * 0.5);
      env.gain.setValueAtTime(0.0001, at);
      env.gain.linearRampToValueAtTime(peak, at + Math.max(0.001, attack));
      env.gain.exponentialRampToValueAtTime(0.0001, stop);

      let tail: AudioNode = src;
      if (spec.filter) {
        filter = this.makeFilter(spec.filter, at, stop);
        if (filter) {
          tail.connect(filter);
          tail = filter;
        }
      }
      tail.connect(env);
      env.connect(dest);

      this.voices += 1;
      counted = true;
      src.onended = release;
      src.start(at);
      src.stop(stop);
    } catch {
      release();
    }
  }

  // -------------------------------------------------------------------- effects

  private synth(name: SfxName, at: number, volume: number): void {
    switch (name) {
      case 'shot':
        this.tone({
          type: 'square',
          at,
          duration: 0.05,
          gain: 0.04 * volume,
          freq: [
            [0, 900],
            [0.045, 620],
          ],
          attack: 0.002,
        });
        break;
      case 'enemyHit':
        this.noiseBurst({
          at,
          duration: 0.06,
          gain: 0.075 * volume,
          filter: { type: 'bandpass', from: 2200, to: 1200, q: 1.2 },
        });
        break;
      case 'enemyKilled':
        this.noiseBurst({
          at,
          duration: 0.26,
          gain: 0.1 * volume,
          filter: { type: 'lowpass', from: 4200, to: 700, q: 0.7 },
        });
        this.tone({
          type: 'sawtooth',
          at,
          duration: 0.28,
          gain: 0.085 * volume,
          freq: [
            [0, 320],
            [0.28, 70],
          ],
          filter: { type: 'lowpass', from: 1800, to: 500 },
        });
        break;
      case 'graze':
        this.tone({
          type: 'sine',
          at,
          duration: 0.09,
          gain: 0.055 * volume,
          freq: [
            [0, 1700],
            [0.09, 2700],
          ],
          attack: 0.003,
        });
        break;
      case 'playerHit':
        this.tone({
          type: 'sawtooth',
          at,
          duration: 0.42,
          gain: 0.12 * volume,
          freq: [
            [0, 220],
            [0.4, 52],
          ],
          filter: { type: 'lowpass', from: 1200, to: 220 },
        });
        this.noiseBurst({
          at,
          duration: 0.35,
          gain: 0.08 * volume,
          filter: { type: 'lowpass', from: 1400, to: 180 },
        });
        break;
      case 'bomb':
        this.tone({
          type: 'sawtooth',
          at,
          duration: 0.48,
          gain: 0.1 * volume,
          freq: [
            [0, 70],
            [0.22, 520],
            [0.48, 48],
          ],
          filter: { type: 'lowpass', from: 900, to: 2400 },
          attack: 0.02,
        });
        this.noiseBurst({
          at: at + 0.06,
          duration: 0.38,
          gain: 0.075 * volume,
          filter: { type: 'bandpass', from: 500, to: 2600, q: 0.6 },
          attack: 0.04,
        });
        break;
      case 'item':
        this.tone({
          type: 'sine',
          at,
          duration: 0.22,
          gain: 0.05 * volume,
          freq: [[0, 1046.5]],
          attack: 0.004,
        });
        this.tone({
          type: 'sine',
          at: at + 0.02,
          duration: 0.16,
          gain: 0.032 * volume,
          freq: [[0, 1568]],
          attack: 0.004,
        });
        break;
      case 'bossWarning':
        this.tone({
          type: 'triangle',
          at,
          duration: 0.09,
          gain: 0.075 * volume,
          freq: [[0, 440]],
          attack: 0.008,
        });
        this.tone({
          type: 'triangle',
          at: at + 0.1,
          duration: 0.09,
          gain: 0.075 * volume,
          freq: [[0, 554]],
          attack: 0.008,
        });
        this.tone({
          type: 'triangle',
          at: at + 0.2,
          duration: 0.09,
          gain: 0.075 * volume,
          freq: [[0, 440]],
          attack: 0.008,
        });
        this.tone({
          type: 'triangle',
          at: at + 0.3,
          duration: 0.1,
          gain: 0.075 * volume,
          freq: [[0, 554]],
          attack: 0.008,
        });
        break;
      case 'phase':
        this.tone({
          type: 'triangle',
          at,
          duration: 0.32,
          gain: 0.038 * volume,
          freq: [[0, 523.25]],
          attack: 0.01,
        });
        this.tone({
          type: 'triangle',
          at: at + 0.04,
          duration: 0.3,
          gain: 0.032 * volume,
          freq: [[0, 659.25]],
          attack: 0.01,
        });
        this.tone({
          type: 'sine',
          at: at + 0.08,
          duration: 0.28,
          gain: 0.03 * volume,
          freq: [[0, 783.99]],
          attack: 0.01,
        });
        break;
      case 'laser':
        this.tone({
          type: 'sawtooth',
          at,
          duration: 0.3,
          gain: 0.075 * volume,
          freq: [
            [0, 138],
            [0.3, 112],
          ],
          tremolo: { rate: 27, depth: 0.45 },
          filter: { type: 'lowpass', from: 1600, to: 900 },
        });
        break;
      case 'extend': {
        const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
        for (let i = 0; i < notes.length; i += 1) {
          this.tone({
            type: 'triangle',
            at: at + i * 0.055,
            duration: 0.14,
            gain: 0.05 * volume,
            freq: [[0, notes[i]]],
            attack: 0.004,
          });
        }
        break;
      }
      case 'cancel':
        this.noiseBurst({
          at,
          duration: 0.2,
          gain: 0.075 * volume,
          filter: { type: 'bandpass', from: 600, to: 3200, q: 0.9 },
          attack: 0.02,
        });
        break;
      case 'uiTap':
        this.tone({
          type: 'square',
          at,
          duration: 0.035,
          gain: 0.045 * volume,
          freq: [[0, 1250]],
          attack: 0.001,
        });
        break;
      case 'uiBack':
        this.tone({
          type: 'square',
          at,
          duration: 0.07,
          gain: 0.04 * volume,
          freq: [
            [0, 700],
            [0.06, 430],
          ],
          attack: 0.002,
        });
        break;
    }
  }

  // ------------------------------------------------------------------------ BGM

  private startTrack(track: BgmTrack): void {
    const ctx = this.ctx;
    const bus = this.musicBus;
    if (!ctx || !bus || !this._enabled) return;

    const switching = this.playingTrack !== null;
    this.clearScheduler();
    this.playingTrack = track;
    this.stepIndex = 0;

    const now = ctx.currentTime;
    const startDelay = switching ? 0.2 : 0.15;
    this.nextStepAt = now + startDelay;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), now);
    if (switching) {
      // Duck the old track before its already-scheduled notes can overlap.
      bus.gain.linearRampToValueAtTime(0.0001, now + 0.06);
      bus.gain.setValueAtTime(0.0001, now + 0.09);
      bus.gain.linearRampToValueAtTime(MUSIC_GAIN, now + 0.18);
    } else {
      bus.gain.linearRampToValueAtTime(MUSIC_GAIN, now + 0.15);
    }

    this.pump();
    this.timer = setInterval(() => this.pump(), SCHEDULER_MS);
  }

  private clearScheduler(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.playingTrack = null;
  }

  /** Schedule every step that starts inside the lookahead window. */
  private pump(): void {
    const ctx = this.ctx;
    const track = this.playingTrack;
    if (!ctx || !track || !this._enabled) return;

    const def = BGM_TRACKS[track];
    const stepDur = 60 / def.bpm / def.subdivision;
    if (this.nextStepAt < ctx.currentTime) this.nextStepAt = ctx.currentTime + 0.02;

    let guard = 0;
    while (this.nextStepAt < ctx.currentTime + LOOKAHEAD && guard < 64) {
      this.scheduleStep(def, this.stepIndex, this.nextStepAt, stepDur);
      this.stepIndex += 1;
      this.nextStepAt += stepDur;
      guard += 1;
    }
  }

  private scheduleStep(def: BgmDef, step: number, at: number, stepDur: number): void {
    const bus = this.musicBus;
    if (!bus) return;

    const bass = def.bass[step % def.bass.length];
    if (bass !== null) {
      this.tone({
        type: def.bassWave,
        at,
        duration: stepDur * 1.7,
        gain: def.bassGain,
        freq: [[0, midiToHz(def.root + def.bassOctave * 12 + bass)]],
        filter: { type: 'lowpass', from: 620, to: 280, q: 0.7 },
        attack: 0.01,
        dest: bus,
      });
    }

    const arp = def.arp[step % def.arp.length];
    if (arp !== null) {
      this.tone({
        type: def.arpWave,
        at,
        duration: stepDur * 0.9,
        gain: def.arpGain,
        freq: [[0, midiToHz(def.root + def.arpOctave * 12 + arp)]],
        detune: def.detune,
        attack: 0.006,
        dest: bus,
      });
    }

    const stepsPerBar = def.subdivision * 4;
    if (step % stepsPerBar === 0) {
      const bar = stepDur * stepsPerBar;
      const chord = def.chords[Math.floor(step / stepsPerBar) % def.chords.length];
      for (const semi of chord) {
        this.tone({
          type: def.padWave,
          at,
          duration: bar * 0.96,
          gain: def.padGain,
          freq: [[0, midiToHz(def.root + def.padOctave * 12 + semi)]],
          detune: def.detune,
          attack: Math.min(0.4, bar * 0.2),
          dest: bus,
        });
      }
    }
  }
}

export function createAudio(): AudioEngine {
  return new ProceduralAudio();
}
