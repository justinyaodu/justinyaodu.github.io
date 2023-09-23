import { Parser, HtmlRenderer } from "commonmark";

import { PureTarget, Target, type TargetBuildArgs } from "./Target.js";

const parser = new Parser({ smart: true });
const renderer = new HtmlRenderer({ safe: false });

type MarkdownTargetInputs = { source: string };
class MarkdownTarget extends PureTarget<MarkdownTargetInputs, string> {
  constructor(source: Target<never, string>) {
    super(`Markdown@${source.key}`, { source });
  }

  override async build({
    inputs: { source },
  }: TargetBuildArgs<MarkdownTargetInputs>): Promise<string> {
    return renderer.render(parser.parse(source));
  }
}

export { MarkdownTarget };
