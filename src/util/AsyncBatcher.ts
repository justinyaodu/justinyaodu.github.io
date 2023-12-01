type MaybeTimeout<T> = { timeout: true } | { timeout: false; result: T };

class AsyncBatcher<T> implements AsyncIterableIterator<T[]> {
  private done: boolean;
  private promise: Promise<IteratorResult<T>>;

  constructor(
    private source: AsyncIterator<T>,
    private batchIntervalMs: number,
  ) {
    this.done = false;
    this.promise = source.next();
  }

  async next(): Promise<IteratorResult<T[]>> {
    if (this.done) {
      return { done: true, value: undefined };
    }

    const timer = new Promise<{ timeout: true }>((resolve, reject) => {
      this.promise.then(
        () => {
          setTimeout(() => {
            resolve({ timeout: true });
          }, this.batchIntervalMs);
        },
        (e) => {
          reject(e);
        },
      );
    });

    const batch: T[] = [];

    while (true) {
      const maybeTimeout: MaybeTimeout<IteratorResult<T>> = await Promise.race([
        timer,
        this.promise.then((result) => ({ timeout: false, result })),
      ]);

      if (maybeTimeout.timeout) {
        return { value: batch };
      }

      if (maybeTimeout.result.done) {
        this.done = true;
        return { value: batch };
      }

      batch.push(maybeTimeout.result.value);
      this.promise = this.source.next();
    }
  }

  [Symbol.asyncIterator]() {
    return this;
  }
}

export { AsyncBatcher };
