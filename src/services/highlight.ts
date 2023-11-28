import { getHighlighter } from "shiki";

import type { ServiceDefinition } from "../build/index.js";

const highlighter = await getHighlighter({ theme: "solarized-light" });

const highlightService: ServiceDefinition<
  { code: string; language: string },
  string
> = {
  id: "Highlight",
  pure: true,
  call: ({ args: { code, language } }) =>
    highlighter.codeToHtml(code, { lang: language }),
};

export { highlightService };
