class HistoryCache<K extends number | string, V> {
  private cache: Map<K, V>;
  private refCounts: Map<K, number>;
  private time: number;
  private history: (K | undefined)[];
  private historyMask: number;

  constructor(logHistorySize: number) {
    this.cache = new Map();
    this.refCounts = new Map();
    this.time = 0;
    const historySize = 1 << logHistorySize;
    this.history = [];
    this.history.length = historySize;
    this.historyMask = historySize - 1;
  }

  get(key: K): V | undefined {
    return this.cache.get(key);
  }

  getOrSetComputed(key: K, callback: (key: K) => V): V {
    const existing = this.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const value = callback(key);
    this.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    const index = this.time & this.historyMask;

    const prev = this.history[index];
    if (prev !== undefined) {
      const newRefCount = this.refCounts.get(key)! - 1;
      if (newRefCount === 0) {
        this.cache.delete(key);
        this.refCounts.delete(key);
      } else {
        this.refCounts.set(key, newRefCount);
      }
    }

    this.history[index] = key;
    this.cache.set(key, value);
    this.refCounts.set(key, (this.refCounts.get(key) ?? 0) + 1);
    this.time++;
  }
}

export { HistoryCache };
