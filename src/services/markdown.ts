import { Parser, HtmlRenderer } from "commonmark";

import { defineService } from "../build/service.js";

const parser = new Parser({ smart: true });
const renderer = new HtmlRenderer({ safe: false });

const markdownService = defineService<string, string>({
  id: "Markdown",
  pure: true,
  run: (markdown) => renderer.render(parser.parse(markdown)),
});

export { markdownService };
