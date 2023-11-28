import type { Runner } from "./runner.js";
import type { Serializable } from "./serializable.js";
import type { ServiceDefinition, ServiceResult } from "./service.js";

type TargetResult<O> = ServiceResult<O> | { status: "skipped"; logs: string[] };

type Target<out O extends Serializable = Serializable> = {
  readonly id: string;
  reset(): Promise<void>;
  build(): Promise<TargetResult<O>>;
  tryBuild(): Promise<O>;
};

type TargetDefinition<
  in out A,
  in out I extends Serializable,
  out O extends Serializable,
  in out J extends Serializable,
> = {
  readonly id: string;
  readonly args: A;
  readonly buildService: ServiceDefinition<I, O>;
  readonly buildInputs: (args: A) => I | Promise<I>;
  readonly resetService: ServiceDefinition<J, Serializable>;
  readonly resetInputs: (args: A) => J | Promise<J>;
};

type Macro<A, R> = (r: Runner, args: A) => R;

function macroCompose<A, R, B extends readonly unknown[]>(
  macro: Macro<A, R>,
  transform: (...beforeArgs: B) => A,
): (r: Runner, ...beforeArgs: B) => R {
  return (r, ...beforeArgs) => macro(r, transform(...beforeArgs));
}

function targetMacro<
  A extends { readonly id: string },
  I extends Serializable,
  O extends Serializable,
>(
  buildService: ServiceDefinition<I, O>,
  buildArgs: (args: A) => I | Promise<I>,
): (r: Runner, args: A) => Target<O>;

function targetMacro<
  A extends { readonly id: string },
  I extends Serializable,
  O extends Serializable,
  J extends Serializable,
>(
  buildService: ServiceDefinition<I, O>,
  buildArgs: (args: A) => I | Promise<I>,
  resetService: ServiceDefinition<J, Serializable>,
  resetArgs: (args: A) => J | Promise<J>,
): (r: Runner, args: A) => Target<O>;

function targetMacro<
  A extends { readonly id: string },
  I extends Serializable,
  O extends Serializable,
  J extends Serializable,
>(
  buildService: ServiceDefinition<I, O>,
  buildArgs: (args: A) => I | Promise<I>,
  resetService?: ServiceDefinition<J, Serializable>,
  resetArgs?: (args: A) => J | Promise<J>,
): (r: Runner, args: A) => Target<O> {
  return (r, args) => {
    const targetDefinition: TargetDefinition<A, I, O, J> = {
      id: args.id,
      args,
      buildService,
      buildInputs: buildArgs,
      resetService:
        resetService ??
        (noOpServiceDefinition as ServiceDefinition<J, Serializable>),
      resetInputs: resetArgs ?? ((() => null) as () => J),
    };
    return r.target(targetDefinition);
  };
}

const noOpServiceDefinition: ServiceDefinition<null, null> = {
  id: "NoOp",
  pure: true,
  call: () => null,
};

export {
  type Target,
  type TargetDefinition,
  type TargetResult,
  targetMacro,
  macroCompose,
};
