import { compileString } from "sass";

import { PureTarget, Target, type TargetBuildArgs } from "./Target.js";

type SassTargetInputs = { source: string };
class SassTarget extends PureTarget<SassTargetInputs, string> {
  constructor(source: Target<never, string>) {
    super(`Sass@${source.key}`, { source });
  }

  override async build({
    inputs: { source },
  }: TargetBuildArgs<SassTargetInputs>): Promise<string> {
    return compileString(source).css;
  }
}

export { SassTarget };
