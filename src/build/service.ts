import type { Serializable } from "./serializable.js";

type ServiceCallContext<I> = {
  args: I;
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  // TODO: "merge" another service's result into current context
};

type ServiceResult<O> =
  | { status: "ok" | "warned"; value: O; logs: string }
  | { status: "failed"; logs: string };

type ServiceDefinition<
  in I extends Serializable,
  out O extends Serializable,
> = {
  readonly id: string;
  readonly pure: boolean;
  call(context: ServiceCallContext<I>): O | Promise<O>;
};

type Service<I extends Serializable, O extends Serializable> = {
  readonly id: string;
  readonly pure: boolean;
  call(args: I): Promise<ServiceResult<O>>;
};

export {
  type Service,
  type ServiceCallContext,
  type ServiceDefinition,
  type ServiceResult,
};
