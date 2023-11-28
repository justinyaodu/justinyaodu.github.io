import type { Serializable } from "./Serializable.js";
import type { ServiceDefinition, ServiceResult } from "./Service.js";

type RuleDefinitionForService<
  C,
  B extends ServiceDefinition<any, any>,
  R extends ServiceDefinition<any, any> | null = null,
> = RuleDefinition<
  C,
  B extends ServiceDefinition<infer I, infer _> ? I : never,
  B extends ServiceDefinition<infer _, infer O> ? O : never,
  R extends ServiceDefinition<infer J, infer _> ? J : Serializable
> extends infer D
  ? R extends null
    ? D
    : D & { reset: unknown }
  : never;

type RuleDefinition<
  C,
  I extends Serializable,
  O extends Serializable,
  J extends Serializable = Serializable,
> = {
  build: {
    service: ServiceDefinition<I, O>;
    args: (config: C) => I | Promise<I>;
  };
  reset?: {
    service: ServiceDefinition<J, Serializable>;
    args: (config: C) => J | Promise<J>;
  };
};

type Rule<C, O extends Serializable> = {
  target(id: string, config: C): Target<O>;
};

type TargetResult<O> = ServiceResult<O> | { status: "skipped"; logs: string[] };

type Target<O extends Serializable = Serializable> = {
  readonly id: string;
  reset(): Promise<void>;
  get(): Promise<TargetResult<O>>;
  tryGet(): Promise<O>;
};

export {
  type Rule,
  type RuleDefinition,
  type RuleDefinitionForService,
  type Target,
  type TargetResult,
};
