import type { Serializable } from "./serializable.js";

type Service<in I extends Serializable, out O extends Serializable> = {
  readonly id: string;
  readonly _SERVICE_TYPE_ONLY?: (input: I) => O;
};

type ServiceInput<S extends Service<any, any>> = S extends Service<
  infer I,
  infer _
>
  ? I
  : never;

type ServiceOutput<S extends Service<any, any>> = S extends Service<
  infer _,
  infer O
>
  ? O
  : never;

type ServiceResult<O extends Serializable> =
  | { status: "ok" | "warned"; value: O; logs: string }
  | { status: "failed"; logs: string };

type ServiceRunContext = {
  readonly log: (...args: unknown[]) => void;
  readonly warn: (...args: unknown[]) => void;
  readonly call: <I extends Serializable, O extends Serializable>(
    service: Service<I, O>,
    input: I,
  ) => Promise<ServiceResult<O>>;
  readonly tryCall: <I extends Serializable, O extends Serializable>(
    service: Service<I, O>,
    input: I,
  ) => Promise<O>;
};

type ServiceDefinition<
  in I extends Serializable,
  out O extends Serializable,
> = {
  readonly id: string;
  readonly pure: boolean;
  readonly run: (input: I, context: ServiceRunContext) => O | Promise<O>;
};

class ServiceInstance<in I extends Serializable, out O extends Serializable>
  implements Service<I, O>
{
  readonly id: string;
  readonly pure: boolean;
  readonly run: (input: I, context: ServiceRunContext) => O | Promise<O>;

  constructor(definition: ServiceDefinition<I, O>) {
    this.id = definition.id;
    this.pure = definition.pure;
    this.run = definition.run;
  }
}

function defineService<I extends Serializable, O extends Serializable>(
  definition: ServiceDefinition<I, O>,
): Service<I, O> {
  return new ServiceInstance(definition);
}

const _identityService = defineService({
  id: "Identity",
  pure: true,
  run: (input) => input,
});

function identityService<T extends Serializable>(): Service<T, T> {
  return _identityService as unknown as Service<T, T>;
}

export {
  type Service,
  type ServiceDefinition,
  type ServiceInput,
  type ServiceOutput,
  type ServiceResult,
  type ServiceRunContext,
  defineService,
  identityService,
  ServiceInstance,
};
