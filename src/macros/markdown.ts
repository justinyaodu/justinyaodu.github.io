import { type Target, defineRule } from "../build/index.js";
import { markdownService } from "../services/markdown.js";

const markdownRule = defineRule(
  markdownService,
  (markdown: Target<string>, { tryBuild }) => tryBuild(markdown),
);

export { markdownRule };
