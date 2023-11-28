import { targetMacro, type Target } from "../build/index.js";
import { markdownService } from "../services/markdown.js";

type MarkdownMacroArgs = {
  id: string;
  markdown: Target<string>;
};
const markdownMacro = targetMacro(
  markdownService,
  ({ markdown }: MarkdownMacroArgs) => markdown.tryGet(),
);

export { markdownMacro };
