import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAudio } from '../src/audio/audio';

// ---------------------------------------------------------------- fake WebAudio

interface ParamEvent {
  readonly kind: 'set' | 'linear' | 'exp' | 'target' | 'cancel';
  readonly value: number;
  readonly time: number;
}

class FakeParam {
  value: number;
  readonly events: ParamEvent[] = [];

  constructor(value = 0) {
    this.value = value;
  }

  setValueAtTime(value: number, time: number): this {
    this.value = value;
    this.events.push({ kind: 'set', value, time });
    return this;
  }

  linearRampToValueAtTime(value: number, time: number): this {
    this.value = value;
    this.events.push({ kind: 'linear', value, time });
    return this;
  }

  exponentialRampToValueAtTime(value: number, time: number): this {
    this.value = value;
    this.events.push({ kind: 'exp', value, time });
    return this;
  }

  setTargetAtTime(value: number, time: number, _constant: number): this {
    this.value = value;
    this.events.push({ kind: 'target', value, time });
    return this;
  }

  cancelScheduledValues(time: number): this {
    this.events.push({ kind: 'cancel', value: this.value, time });
    return this;
  }
}

class FakeGain {
  readonly gain = new FakeParam(1);

  connect(_node: unknown): this {
    return this;
  }

  disconnect(): void {
    // no-op
  }
}

class FakeOscillator {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeParam(440);
  readonly detune = new FakeParam(0);
  onended: (() => void) | null = null;
  startedAt = -1;
  stoppedAt = -1;

  connect(_node: unknown): this {
    return this;
  }

  disconnect(): void {
    // no-op
  }

  start(at = 0): void {
    this.startedAt = at;
  }

  stop(at = 0): void {
    this.stoppedAt = at;
  }
}

class FakeBufferSource {
  buffer: unknown = null;
  loop = false;
  readonly playbackRate = new FakeParam(1);
  onended: (() => void) | null = null;
  startedAt = -1;
  stoppedAt = -1;

  connect(_node: unknown): this {
    return this;
  }

  disconnect(): void {
    // no-op
  }

  start(at = 0): void {
    this.startedAt = at;
  }

  stop(at = 0): void {
    this.stoppedAt = at;
  }
}

class FakeFilter {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new FakeParam(350);
  readonly Q = new FakeParam(1);

  connect(_node: unknown): this {
    return this;
  }

  disconnect(): void {
    // no-op
  }
}

class FakeBuffer {
  constructor(
    readonly length: number,
    readonly sampleRate: number,
  ) {}

  getChannelData(_channel: number): Float32Array {
    return new Float32Array(this.length);
  }
}

class FakeAudioContext {
  static readonly instances: FakeAudioContext[] = [];

  currentTime = 0;
  readonly sampleRate = 48000;
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  readonly destination = {
    connect: (): void => undefined,
    disconnect: (): void => undefined,
  };

  readonly gains: FakeGain[] = [];
  readonly oscillators: FakeOscillator[] = [];
  readonly bufferSources: FakeBufferSource[] = [];
  readonly filters: FakeFilter[] = [];
  resumeCalls = 0;
  suspendCalls = 0;

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  createGain(): FakeGain {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }

  createOscillator(): FakeOscillator {
    const osc = new FakeOscillator();
    this.oscillators.push(osc);
    return osc;
  }

  createBufferSource(): FakeBufferSource {
    const src = new FakeBufferSource();
    this.bufferSources.push(src);
    return src;
  }

  createBiquadFilter(): FakeFilter {
    const filter = new FakeFilter();
    this.filters.push(filter);
    return filter;
  }

  createBuffer(_channels: number, length: number, sampleRate: number): FakeBuffer {
    return new FakeBuffer(length, sampleRate);
  }

  resume(): Promise<void> {
    this.resumeCalls += 1;
    this.state = 'running';
    return Promise.resolve();
  }

  suspend(): Promise<void> {
    this.suspendCalls += 1;
    this.state = 'suspended';
    return Promise.resolve();
  }
}

type AudioCtor = typeof AudioContext;

const audioGlobal = globalThis as unknown as {
  AudioContext?: AudioCtor;
  webkitAudioContext?: AudioCtor;
};

let savedAudioContext: AudioCtor | undefined;
let savedWebkitAudioContext: AudioCtor | undefined;

beforeEach(() => {
  savedAudioContext = audioGlobal.AudioContext;
  savedWebkitAudioContext = audioGlobal.webkitAudioContext;
  FakeAudioContext.instances.length = 0;
});

afterEach(() => {
  if (savedAudioContext) audioGlobal.AudioContext = savedAudioContext;
  else delete audioGlobal.AudioContext;
  if (savedWebkitAudioContext) audioGlobal.webkitAudioContext = savedWebkitAudioContext;
  else delete audioGlobal.webkitAudioContext;
  vi.useRealTimers();
});

function installFakeAudio(): typeof FakeAudioContext {
  audioGlobal.AudioContext = FakeAudioContext as unknown as AudioCtor;
  delete audioGlobal.webkitAudioContext;
  return FakeAudioContext;
}

// ------------------------------------------------------------------------- tests

describe('audio engine without a WebAudio implementation', () => {
  beforeEach(() => {
    delete audioGlobal.AudioContext;
    delete audioGlobal.webkitAudioContext;
  });

  it('createAudio and every method are safe no-ops', () => {
    expect(() => {
      const engine = createAudio();
      engine.unlock();
      engine.play('shot');
      engine.play('bomb', 0.5);
      engine.playBgm('stage');
      engine.stopBgm();
      engine.setEnabled(false);
      engine.setEnabled(true);
      expect(engine.enabled).toBe(true);
    }).not.toThrow();

    expect(FakeAudioContext.instances).toHaveLength(0);
  });
});

describe('audio engine with a fake AudioContext', () => {
  beforeEach(() => {
    installFakeAudio();
  });

  it('lazily creates exactly one context on unlock and resumes it', () => {
    const engine = createAudio();

    engine.play('shot');
    expect(FakeAudioContext.instances).toHaveLength(0);

    engine.unlock();
    expect(FakeAudioContext.instances).toHaveLength(1);
    const ctx = FakeAudioContext.instances[0]!;
    expect(ctx.resumeCalls).toBe(1);

    engine.unlock();
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(ctx.resumeCalls).toBeGreaterThanOrEqual(1);
  });

  it('rate limits the same effect to one voice per 30 ms', () => {
    const engine = createAudio();
    engine.unlock();
    const ctx = FakeAudioContext.instances[0]!;

    engine.play('shot');
    engine.play('shot');
    expect(ctx.oscillators).toHaveLength(1);

    ctx.currentTime = 0.05;
    engine.play('shot');
    expect(ctx.oscillators).toHaveLength(2);
  });

  it('drops effects once the 24 voice budget is exhausted', () => {
    const engine = createAudio();
    engine.unlock();
    const ctx = FakeAudioContext.instances[0]!;

    for (let i = 0; i < 40; i += 1) {
      ctx.currentTime = i * 0.04;
      engine.play('uiTap');
    }

    expect(ctx.oscillators).toHaveLength(24);

    engine.play('item');
    expect(ctx.oscillators).toHaveLength(24);
  });

  it('frees a voice again when its source ends', () => {
    const engine = createAudio();
    engine.unlock();
    const ctx = FakeAudioContext.instances[0]!;

    for (let i = 0; i < 30; i += 1) {
      ctx.currentTime = i * 0.04;
      engine.play('uiTap');
    }
    expect(ctx.oscillators).toHaveLength(24);

    ctx.oscillators[0]!.onended?.();
    ctx.currentTime = 2;
    engine.play('uiTap');
    expect(ctx.oscillators).toHaveLength(25);
  });

  it('reuses the single noise buffer for every noise effect', () => {
    const engine = createAudio();
    engine.unlock();
    const ctx = FakeAudioContext.instances[0]!;

    engine.play('enemyHit');
    ctx.currentTime = 0.1;
    engine.play('cancel');

    expect(ctx.bufferSources).toHaveLength(2);
    expect(ctx.bufferSources[0]!.buffer).toBe(ctx.bufferSources[1]!.buffer);
  });

  it('mutes the master gain, silences play and suspends when disabled', () => {
    const engine = createAudio();
    engine.unlock();
    const ctx = FakeAudioContext.instances[0]!;
    const master = ctx.gains[0]!;

    engine.setEnabled(false);
    expect(engine.enabled).toBe(false);
    expect(master.gain.value).toBe(0);
    expect(master.gain.events.at(-1)).toMatchObject({ kind: 'linear', value: 0 });
    expect(ctx.suspendCalls).toBe(1);
    expect(ctx.state).toBe('suspended');

    const before = ctx.oscillators.length;
    ctx.currentTime = 2;
    engine.play('item');
    expect(ctx.oscillators).toHaveLength(before);

    engine.setEnabled(true);
    expect(ctx.resumeCalls).toBeGreaterThanOrEqual(1);
    expect(master.gain.value).toBeCloseTo(0.22, 5);
  });

  it('runs the BGM scheduler and clears it on stop', () => {
    vi.useFakeTimers();
    const engine = createAudio();
    engine.unlock();
    const ctx = FakeAudioContext.instances[0]!;

    engine.playBgm('stage');
    expect(vi.getTimerCount()).toBe(1);
    expect(ctx.oscillators.length).toBeGreaterThan(0);

    const scheduled = ctx.oscillators.length;
    engine.playBgm('stage');
    expect(ctx.oscillators).toHaveLength(scheduled);

    ctx.currentTime = 0.25;
    vi.advanceTimersByTime(150);
    expect(ctx.oscillators.length).toBeGreaterThan(scheduled);

    engine.stopBgm();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('restarts a requested track after being re-enabled', () => {
    vi.useFakeTimers();
    const engine = createAudio();
    engine.unlock();

    engine.playBgm('boss');
    expect(vi.getTimerCount()).toBe(1);

    engine.setEnabled(false);
    expect(vi.getTimerCount()).toBe(0);

    engine.setEnabled(true);
    expect(vi.getTimerCount()).toBe(1);

    engine.stopBgm();
    expect(vi.getTimerCount()).toBe(0);
  });
});
