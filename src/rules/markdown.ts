import { defineRule } from "../build/index.js";
import { markdownService } from "../services/markdown.js";

import type { Target } from "../build/index.js";

const markdownRule = defineRule(
  markdownService,
  (markdown: Target<string>, { tryBuild }) => tryBuild(markdown),
);

export { markdownRule };
