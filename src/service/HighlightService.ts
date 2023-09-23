import { getHighlighter } from "shiki";

import { HistoryCache } from "../util/HistoryCache.js";

const highlighter = await getHighlighter({ theme: "solarized-light" });

class HighlightService {
  private cache: HistoryCache<string, string>;

  constructor() {
    this.cache = new HistoryCache(10);
  }

  render(code: string, language: string): string {
    const key = JSON.stringify({ source: code, language });
    return this.cache.getOrSetComputed(key, () =>
      highlighter.codeToHtml(code, { lang: language }),
    );
  }
}

export { HighlightService };
