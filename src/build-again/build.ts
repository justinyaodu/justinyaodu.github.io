type Serializable =
  | boolean
  | null
  | number
  | string
  | readonly Serializable[]
  | { readonly [k: string]: Serializable };

type ServiceResult<O> =
  | { status: "ok" | "warned"; value: O; logs: string }
  | { status: "failed"; logs: string };

type TargetResult<O> = ServiceResult<O> | { status: "skipped" };

type Service<in I, out O> = {
  readonly id: string;
  readonly _SERVICE_TYPE_ONLY?: (input: I) => O;
};

class ServiceInstance<in I extends Serializable, out O extends Serializable>
  implements Service<I, O>
{
  readonly id: string;
  readonly pure: boolean;
  readonly run: (context: ServiceRunContext<I>) => O | Promise<O>;

  constructor(definition: ServiceDefinition<I, O>) {
    this.id = definition.id;
    this.pure = definition.pure;
    this.run = definition.run;
  }
}

type Runner = {
  build<O>(target: Target<O>): Promise<TargetResult<O>>;
  tryBuild<O>(target: Target<O>): Promise<O>;

  reset(target: Target): Promise<TargetResult<void>>;
  tryReset(target: Target): Promise<void>;

  // TODO: maybe implement later if motivated?
  call<I, O>(service: Service<I, O>, input: I): Promise<ServiceResult<O>>;
  tryCall<I, O>(service: Service<I, O>, input: I): Promise<O>;
};

type ServiceRunContext<I extends Serializable> = {
  readonly input: I;
  readonly log: (...args: unknown[]) => void;
  readonly warn: (...args: unknown[]) => void;
  readonly call: <J, P>(
    service: Service<J, P>,
    input: J,
  ) => Promise<ServiceResult<P>>;
  readonly tryCall: <J, P>(service: Service<J, P>, input: J) => Promise<P>;
};

type ServiceDefinition<
  in I extends Serializable,
  out O extends Serializable,
> = {
  readonly id: string;
  readonly pure: boolean;
  readonly run: (context: ServiceRunContext<I>) => O | Promise<O>;
};

function defineService<I extends Serializable, O extends Serializable>(
  definition: ServiceDefinition<I, O>,
): Service<I, O> {
  return new ServiceInstance(definition);
}

type Target<out O = Serializable> = {
  readonly id: string;
  readonly _TARGET_TYPE_ONLY?: () => O;
};

type TryBuildRestReturn<T extends readonly Target[]> = T extends readonly [
  Target<infer O>,
  ...infer R extends readonly [],
]
  ? [O, ...TryBuildRestReturn<R>]
  : [];

type TryBuildObjectReturn<T extends { readonly [k: string]: Target }> = {
  [K in keyof T]: T[K] extends Target<infer O> ? O : never;
};

type TargetInputsContext = {
  tryBuild: {
    <O>(target: Target<O>): Promise<O>;
    <T extends readonly Target[]>(targets: T): Promise<TryBuildRestReturn<T>>;
    <T extends { readonly [k: string]: Target }>(
      targets: T,
    ): Promise<TryBuildObjectReturn<T>>;
  };
  // TODO: add non-try variants?
  // TODO: add logging?
};

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
    readonly inputs: (
      config: C,
      context: TargetInputsContext,
    ) => I | Promise<I>;
  };

  readonly reset?:
    | {
        readonly service: Service<J, Serializable>;
        readonly inputs: (
          config: C,
          context: TargetInputsContext,
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
}

function defineTarget<
  C,
  I extends Serializable,
  O extends Serializable,
  J extends Serializable,
>(definition: TargetDefinition<C, I, O, J>): Target<O> {
  return new TargetInstance(definition);
}

type Rule<C, O> = (id: string, config: C) => Target<O>;

function defineRule<C, I extends Serializable, O extends Serializable>(
  buildService: Service<I, O>,
  buildInputs: (config: C, context: TargetInputsContext) => I | Promise<I>,
): Rule<C, O>;

function defineRule<
  C,
  I extends Serializable,
  O extends Serializable,
  J extends Serializable,
>(
  buildService: Service<I, O>,
  buildInputs: (config: C, context: TargetInputsContext) => I | Promise<I>,
  resetService: Service<J, O>,
  resetInputs: (config: C, context: TargetInputsContext) => J | Promise<J>,
): Rule<C, O>;

function defineRule<
  C,
  I extends Serializable,
  O extends Serializable,
  J extends Serializable,
>(
  buildService: Service<I, O>,
  buildInputs: (config: C, context: TargetInputsContext) => I | Promise<I>,
  resetService?: Service<J, O>,
  resetInputs?: (config: C, context: TargetInputsContext) => J | Promise<J>,
): Rule<C, O> {
  return (id, config) =>
    defineTarget({
      id,
      config,
      build: {
        service: buildService,
        inputs: buildInputs,
      },
      reset:
        resetService && resetInputs
          ? {
              service: resetService,
              inputs: resetInputs,
            }
          : undefined,
    });
}

/*
type ServiceInput<I extends Serializable> =
  | Target<I>
  | (I extends readonly (infer J extends Serializable)[]
      ? ServiceInput<J>[]
      : I extends { readonly [k: string]: Serializable }
      ? { [K in keyof I]: ServiceInput<I[K]> }
      : I);

type Foo = { html: string };

const bar: ServiceInput<Foo> = {
  id: "hi",
  tryBuild: async () => ({ html: "oops" }),
};

const baz: ServiceInput<Foo> = {
  html: { id: "hi", tryBuild: async () => "oops" },
};

type ServiceCallContext<I> = {
  input: I;
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
};

type ServiceResult<O> =
  | { status: "ok" | "warned"; value: O; logs: string }
  | { status: "failed"; logs: string };

type Service<in I extends Serializable, out O extends Serializable> = {
  id: string;
  pure: boolean;
};

type Target<out O extends Serializable = Serializable> = {
  id: string;
  tryBuild(): Promise<O>;
};

type RunnerBuildAllReturn<T extends readonly Target[]> = T extends readonly [
  Target<infer O>,
  ...infer R extends readonly [],
]
  ? [O, ...RunnerBuildAllReturn<R>]
  : [];

type Runner = {
  call<I extends Serializable, O extends Serializable>(
    service: Service<I, O>,
    input: I
  ): Promise<O>;

  build<O extends Serializable>(target: Target<O>): Promise<O>;

  buildAll<T extends readonly Target[]>(
    ...targets: T
  ): Promise<RunnerBuildAllReturn<T>>;

  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  fail(...args: unknown[]): never;
};
*/
