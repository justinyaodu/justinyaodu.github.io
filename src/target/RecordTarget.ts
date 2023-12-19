import { PureTarget } from "./Target.js";

import type { InputTargets, TargetBuildArgs, TargetOutput } from "./Target.js";

class RecordTarget<T extends TargetOutput> extends PureTarget<
  Record<string, T>,
  Readonly<Record<string, T>>
> {
  static numInstances = 0;
  constructor(inputTargets: InputTargets<Record<string, T>>) {
    super(`Record@${RecordTarget.numInstances++}`, inputTargets);
  }

  protected override async build({
    inputs,
  }: TargetBuildArgs<Record<string, T>>): Promise<Readonly<
    Record<string, T>
  > | null> {
    return inputs;
  }
}

export { RecordTarget };
