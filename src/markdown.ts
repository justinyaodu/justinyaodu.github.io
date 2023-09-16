import { Parser, HtmlRenderer } from "commonmark";

const parser = new Parser({ smart: true });
const renderer = new HtmlRenderer({ safe: false });

function markdownToHTML(markdown: string): string {
  return renderer.render(parser.parse(markdown));
}

export { markdownToHTML };
