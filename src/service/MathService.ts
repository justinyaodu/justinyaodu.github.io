import katex from "katex";

import { HistoryCache } from "../util/HistoryCache.js";
import { Result } from "../util/Result.js";

class MathService {
  private readonly cache: HistoryCache<string, Result<string, unknown>>;

  constructor() {
    this.cache = new HistoryCache(10);
  }

  render(source: string, displayMode: boolean): Result<string, unknown> {
    const key = JSON.stringify({ source, displayMode });
    return this.cache.getOrSetComputed(key, () =>
      Result.fromThrowing(() =>
        katex.renderToString(source, { throwOnError: true, displayMode }),
      ),
    );
  }
}

export { MathService };
