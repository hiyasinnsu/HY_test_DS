import { describe, expect, it } from 'vitest';
import {
  angleDelta,
  angleTo,
  approach,
  clamp,
  damp,
  easeInQuad,
  easeInOutSine,
  easeOutCubic,
  lerp,
  segmentDistanceSq,
  TAU,
  wrapAngle,
} from '../src/core/math';
import { Pool } from '../src/core/pool';
import { Rng } from '../src/core/rng';

describe('math', () => {
  it('clamps to both bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it('lerps and approaches without overshooting', () => {
    expect(lerp(0, 10, 0.25)).toBe(2.5);
    expect(approach(0, 10, 3)).toBe(3);
    expect(approach(9, 10, 3)).toBe(10);
    expect(approach(10, 0, 3)).toBe(7);
    expect(approach(1, 0, 3)).toBe(0);
  });

  it('computes angles and wraps them into [-PI, PI)', () => {
    expect(angleTo(0, 0, 1, 0)).toBeCloseTo(0, 6);
    expect(angleTo(0, 0, 0, 1)).toBeCloseTo(Math.PI / 2, 6);
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(-Math.PI, 6);
    expect(wrapAngle(-Math.PI * 3)).toBeCloseTo(-Math.PI, 6);
    expect(Math.abs(angleDelta(0.1, TAU - 0.1))).toBeCloseTo(0.2, 6);
  });

  it('measures distance to a segment including clamped endpoints', () => {
    expect(segmentDistanceSq(0, 5, 0, 0, 10, 0)).toBeCloseTo(25, 6);
    expect(segmentDistanceSq(-5, 0, 0, 0, 10, 0)).toBeCloseTo(25, 6);
    expect(segmentDistanceSq(20, 0, 0, 0, 10, 0)).toBeCloseTo(100, 6);
    expect(segmentDistanceSq(5, 0, 0, 0, 10, 0)).toBe(0);
  });

  it('damps toward the target monotonically', () => {
    let value = 100;
    for (let i = 0; i < 10; i += 1) value = damp(value, 0, 8, 1 / 60);
    expect(value).toBeLessThan(100);
    expect(value).toBeGreaterThan(0);
    const settled = damp(0, 0, 8, 1 / 60);
    expect(settled).toBe(0);
  });

  it('easings stay within 0..1 and hit their endpoints', () => {
    for (const ease of [easeOutCubic, easeInQuad, easeInOutSine]) {
      expect(ease(0)).toBeCloseTo(0, 6);
      expect(ease(1)).toBeCloseTo(1, 6);
      for (let t = 0; t <= 1; t += 0.1) {
        const value = ease(t);
        expect(value).toBeGreaterThanOrEqual(-1e-9);
        expect(value).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });
});

describe('Rng', () => {
  it('is deterministic for a given seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const first = [a.next(), a.next(), a.next()];
    const second = [b.next(), b.next(), b.next()];
    expect(first).toEqual(second);
  });

  it('produces different streams for different seeds', () => {
    expect(new Rng(1).next()).not.toBe(new Rng(2).next());
  });

  it('stays inside the requested bounds', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 500; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      const ranged = rng.range(-5, 5);
      expect(ranged).toBeGreaterThanOrEqual(-5);
      expect(ranged).toBeLessThan(5);
      const int = rng.int(3, 6);
      expect(Number.isInteger(int)).toBe(true);
      expect(int).toBeGreaterThanOrEqual(3);
      expect(int).toBeLessThanOrEqual(6);
    }
  });

  it('picks from a list and rejects an empty one', () => {
    const rng = new Rng(3);
    const items = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 20; i += 1) expect(items).toContain(rng.pick(items));
    expect(() => rng.pick([])).toThrow();
  });

  it('reseeding restarts the stream', () => {
    const rng = new Rng(9);
    const first = rng.next();
    rng.next();
    rng.reseed(9);
    expect(rng.next()).toBe(first);
  });
});

interface Item {
  active: boolean;
  value: number;
}

describe('Pool', () => {
  const makePool = (capacity: number): Pool<Item> =>
    new Pool<Item>(capacity, () => ({ active: false, value: 0 }), (item) => {
      item.value = 0;
    });

  it('starts empty and hands out distinct objects', () => {
    const pool = makePool(3);
    expect(pool.count).toBe(0);
    const a = pool.acquire();
    const b = pool.acquire();
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a).not.toBe(b);
    expect(pool.count).toBe(2);
  });

  it('returns null once exhausted', () => {
    const pool = makePool(2);
    expect(pool.acquire()).not.toBeNull();
    expect(pool.acquire()).not.toBeNull();
    expect(pool.acquire()).toBeNull();
  });

  it('recycles released items and keeps the active prefix contiguous', () => {
    const pool = makePool(4);
    const first = pool.acquire();
    if (!first) throw new Error('acquire failed');
    first.value = 1;
    pool.acquire();
    pool.acquire();
    pool.releaseAt(0);
    expect(pool.count).toBe(2);
    const recycled = pool.acquire();
    expect(recycled).toBe(first);
    expect(recycled?.value).toBe(0);
    for (let i = 0; i < pool.count; i += 1) expect(pool.items[i]?.active).toBe(true);
  });

  it('releases by reference and clears everything', () => {
    const pool = makePool(3);
    const item = pool.acquire();
    if (!item) throw new Error('acquire failed');
    pool.release(item);
    expect(pool.count).toBe(0);
    pool.acquire();
    pool.acquire();
    pool.clear();
    expect(pool.count).toBe(0);
    expect(pool.items.every((entry) => !entry.active)).toBe(true);
  });

  it('survives releasing indices from a backwards loop', () => {
    const pool = makePool(5);
    for (let i = 0; i < 5; i += 1) pool.acquire();
    for (let i = pool.count - 1; i >= 0; i -= 1) {
      if (i % 2 === 0) pool.releaseAt(i);
    }
    expect(pool.count).toBe(2);
  });

  it('iterates only active items', () => {
    const pool = makePool(4);
    pool.acquire();
    pool.acquire();
    const seen: number[] = [];
    pool.forEachActive((_item, index) => seen.push(index));
    expect(seen).toEqual([0, 1]);
  });
});
