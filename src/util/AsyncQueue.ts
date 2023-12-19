class AsyncQueue<T> implements AsyncIterableIterator<T> {
  private closed: boolean;
  private readonly dataQueue: Map<number, T>;
  private dataQueueIndex: number;
  private readonly resolveQueue: Map<number, (arg: { value: T }) => void>;
  private resolveQueueIndex: number;

  constructor() {
    this.closed = false;
    this.dataQueue = new Map();
    this.dataQueueIndex = 0;
    this.resolveQueue = new Map();
    this.resolveQueueIndex = 0;
  }

  enqueue(value: T) {
    if (this.closed) {
      throw new Error("cannot enqueue after closing");
    }

    const index = this.dataQueueIndex;
    this.dataQueueIndex++;

    if (this.resolveQueue.has(index)) {
      this.resolveQueue.get(index)!({ value });
      this.resolveQueue.delete(index);
    } else {
      this.dataQueue.set(index, value);
    }
  }

  close() {
    this.closed = true;
  }

  async next(): Promise<IteratorResult<T>> {
    const index = this.resolveQueueIndex;
    this.resolveQueueIndex++;

    if (this.dataQueue.has(index)) {
      const event = this.dataQueue.get(index)!;
      this.dataQueue.delete(index);
      return { value: event };
    } else if (this.closed) {
      return { done: true, value: undefined };
    } else {
      const promise = new Promise<{ value: T }>((resolve) => {
        this.resolveQueue.set(index, resolve);
      });
      return promise;
    }
  }

  [Symbol.asyncIterator]() {
    return this;
  }
}

export { AsyncQueue };
