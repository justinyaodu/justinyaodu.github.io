import { Parser, HtmlRenderer } from "commonmark";

import { PureTarget, Target } from "./Target.js";

const parser = new Parser({ smart: true });
const renderer = new HtmlRenderer({ safe: false });

class MarkdownTarget extends PureTarget<{ source: string }, string> {
  constructor(source: Target<any, string>) {
    super(`Markdown@${source.key}`, { source });
  }

  override async build({ source }: { source: string }): Promise<string> {
    return renderer.render(parser.parse(source));
  }
}

export { MarkdownTarget };
