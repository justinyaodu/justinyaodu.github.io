import {
  PureTarget,
  Target,
  type TargetBuildArgs,
  type TargetOutput,
} from "./Target.js";

type PropertyTargetInputs<T, K extends string> = {
  object: Readonly<Record<K, T>>;
};
class PropertyTarget<
  T extends TargetOutput,
  K extends string,
> extends PureTarget<PropertyTargetInputs<T, K>, T> {
  constructor(
    object: Target<never, Readonly<Record<K, T>>>,
    private readonly propertyName: K,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    super(`Property[${JSON.stringify(propertyName)}]@${object.key}`, {
      object,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  }

  protected override async build({
    inputs: { object },
  }: TargetBuildArgs<PropertyTargetInputs<T, K>>): Promise<T> {
    return object[this.propertyName];
  }
}

export { PropertyTarget };
