/**
 * Fixed-capacity object pool. Bullets and particles are recycled instead of
 * allocated so a dense pattern does not feed the garbage collector on a phone.
 *
 * `active` items are iterated in-place by the simulation; `release()` swaps the
 * item with the last active one, so iteration must never mutate during a loop
 * that is still walking the array.
 */
export class Pool<T extends { active: boolean }> {
  readonly items: T[];
  private activeCount = 0;

  constructor(
    capacity: number,
    factory: () => T,
    private readonly reset: (item: T) => void,
  ) {
    this.items = new Array<T>(capacity);
    for (let i = 0; i < capacity; i += 1) {
      const item = factory();
      item.active = false;
      this.items[i] = item;
    }
  }

  get count(): number {
    return this.activeCount;
  }

  get capacity(): number {
    return this.items.length;
  }

  /** Returns a recycled item, or null when the pool is exhausted. */
  acquire(): T | null {
    if (this.activeCount >= this.items.length) return null;
    const item = this.items[this.activeCount] as T;
    this.activeCount += 1;
    this.reset(item);
    item.active = true;
    return item;
  }

  /** Marks the item at `index` inactive and shrinks the active prefix. */
  releaseAt(index: number): void {
    if (index < 0 || index >= this.activeCount) return;
    const lastIndex = this.activeCount - 1;
    const item = this.items[index] as T;
    if (index !== lastIndex) {
      const last = this.items[lastIndex] as T;
      this.items[index] = last;
      this.items[lastIndex] = item;
    }
    item.active = false;
    this.activeCount = lastIndex;
  }

  release(item: T): void {
    const index = this.items.indexOf(item);
    if (index >= 0 && index < this.activeCount) this.releaseAt(index);
  }

  forEachActive(fn: (item: T, index: number) => void): void {
    for (let i = 0; i < this.activeCount; i += 1) {
      fn(this.items[i] as T, i);
    }
  }

  clear(): void {
    for (let i = 0; i < this.activeCount; i += 1) {
      (this.items[i] as T).active = false;
    }
    this.activeCount = 0;
  }
}
