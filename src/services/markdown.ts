import { Parser, HtmlRenderer } from "commonmark";

import type { ServiceDefinition } from "../build/Service.js";

const parser = new Parser({ smart: true });
const renderer = new HtmlRenderer({ safe: false });

const markdownService: ServiceDefinition<string, string> = {
  id: "Markdown",
  pure: true,
  call: ({ args: source }) => renderer.render(parser.parse(source)),
};

export { markdownService };
