import type { Serializable } from "./serializable.js";

type Service<in I extends Serializable, out O extends Serializable> = {
  readonly id: string;
  readonly _SERVICE_TYPE_ONLY?: (input: I) => O;
};

type ServiceResult<O extends Serializable> =
  | { status: "ok" | "warned"; value: O; logs: string }
  | { status: "failed"; logs: string };

type ServiceRunContext<I extends Serializable> = {
  readonly log: (...args: unknown[]) => void;
  readonly warn: (...args: unknown[]) => void;
  // readonly call: <J, P>(
  //   service: Service<J, P>,
  //   input: J
  // ) => Promise<ServiceResult<P>>;
  // readonly tryCall: <J, P>(service: Service<J, P>, input: J) => Promise<P>;
};

type ServiceDefinition<
  in I extends Serializable,
  out O extends Serializable,
> = {
  readonly id: string;
  readonly pure: boolean;
  readonly run: (input: I, context: ServiceRunContext<I>) => O | Promise<O>;
};

class ServiceInstance<in I extends Serializable, out O extends Serializable>
  implements Service<I, O>
{
  readonly id: string;
  readonly pure: boolean;
  readonly run: (input: I, context: ServiceRunContext<I>) => O | Promise<O>;

  constructor(definition: ServiceDefinition<I, O>) {
    this.id = definition.id;
    this.pure = definition.pure;
    this.run = definition.run;
  }

  static cast<I extends Serializable, O extends Serializable>(
    service: Service<I, O>,
  ): ServiceInstance<I, O> {
    if (service instanceof ServiceInstance) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return service;
    }
    throw new TypeError("Not a ServiceInstance");
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
  type ServiceResult,
  type ServiceRunContext,
  defineService,
  identityService,
  ServiceInstance,
};
