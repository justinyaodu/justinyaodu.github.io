import { compileString } from "sass";

import { PureTarget, Target } from "./Target.js";

class SassTarget extends PureTarget<{ source: string }, string> {
  constructor(source: Target<any, string>) {
    super(`Sass@${source.key}`, { source });
  }

  override async build({ source }: { source: string }): Promise<string> {
    return compileString(source).css;
  }
}

export { SassTarget };
