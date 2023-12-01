import {
  type Service,
  type ServiceResult,
  identityService,
} from "./service.js";

import type { Serializable } from "./serializable.js";

type Target<out O extends Serializable = Serializable> = {
  readonly id: string;
  then<P extends Serializable>(
    id: string,
    callback: (value: O) => P,
  ): Target<P>;
  readonly _TARGET_TYPE_ONLY?: () => O;
};

type TargetResult<O extends Serializable> =
  | ServiceResult<O>
  | { status: "skipped"; logs: string };

type TryBuildRestReturn<T extends readonly Target[]> = T extends readonly [
  Target<infer O>,
  ...infer R extends readonly [],
]
  ? [O, ...TryBuildRestReturn<R>]
  : [];

type TryBuildObjectReturn<T extends { readonly [k: string]: Target }> = {
  [K in keyof T]: T[K] extends Target<infer O> ? O : never;
};

type TargetBuildInputContext = {
  tryBuild: {
    <O extends Serializable>(target: Target<O>): Promise<O>;
    <T extends readonly Target[]>(targets: T): Promise<TryBuildRestReturn<T>>;
    <T extends { readonly [k: string]: Target }>(
      targets: T,
    ): Promise<TryBuildObjectReturn<T>>;
  };
  // TODO: add non-try variants?
  // TODO: add logging?
};

type TargetResetInputContext = Record<string, never>;

type TargetDefinition<
  in out C,
  in out I extends Serializable,
  out O extends Serializable,
  in out J extends Serializable,
> = {
  readonly id: string;
  readonly config: C;

  readonly build: {
    readonly service: Service<I, O>;
    readonly input: (
      config: C,
      context: TargetBuildInputContext,
    ) => I | Promise<I>;
  };

  readonly reset?:
    | {
        readonly service: Service<J, Serializable>;
        readonly input: (
          config: C,
          context: TargetResetInputContext,
        ) => J | Promise<J>;
      }
    | undefined;
};

class TargetInstance<
  in out C,
  in out I extends Serializable,
  out O extends Serializable,
  in out J extends Serializable,
> implements Target<O>
{
  readonly id: string;
  readonly config: C;
  readonly build: TargetDefinition<C, I, O, J>["build"];
  readonly reset: TargetDefinition<C, I, O, J>["reset"] | undefined;

  constructor(definition: TargetDefinition<C, I, O, J>) {
    this.id = definition.id;
    this.config = definition.config;
    this.build = definition.build;
    this.reset = definition.reset;
  }

  then<P extends Serializable>(
    id: string,
    callback: (value: O) => P,
  ): Target<P> {
    return defineTarget({
      id,
      config: this,
      build: {
        service: identityService(),
        input: async (target, { tryBuild }) => callback(await tryBuild(target)),
      },
    });
  }
}

function defineTarget<
  C,
  I extends Serializable,
  O extends Serializable,
  J extends Serializable,
>(definition: TargetDefinition<C, I, O, J>): Target<O> {
  return new TargetInstance(definition);
}

export {
  type Target,
  type TargetDefinition,
  type TargetBuildInputContext,
  type TargetResetInputContext,
  type TargetResult,
  type TryBuildObjectReturn,
  type TryBuildRestReturn,
  defineTarget,
  TargetInstance,
};
