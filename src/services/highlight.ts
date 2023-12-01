import { getHighlighter } from "shiki";

import { defineService } from "../build/index.js";

const highlighter = await getHighlighter({ theme: "solarized-light" });

const highlightService = defineService<
  { code: string; language: string },
  string
>({
  id: "Highlight",
  pure: true,
  run: ({ code, language }) => highlighter.codeToHtml(code, { lang: language }),
});

export { highlightService };
