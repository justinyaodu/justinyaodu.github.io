import {
  type Target,
  type TargetBuildInputContext,
  type TargetResetInputContext,
  defineTarget,
} from "./target.js";

import type { Serializable } from "./serializable.js";
import type { Service } from "./service.js";

type Rule<C, O extends Serializable> = (id: string, config: C) => Target<O>;

function defineRule<I extends Serializable, O extends Serializable>(
  buildService: Service<I, O>,
): Rule<I, O>;

function defineRule<C, I extends Serializable, O extends Serializable>(
  buildService: Service<I, O>,
  buildInput: (config: C, context: TargetBuildInputContext) => I | Promise<I>,
): Rule<C, O>;

function defineRule<
  C,
  I extends Serializable,
  O extends Serializable,
  J extends Serializable,
>(
  buildService: Service<I, O>,
  buildInput: (config: C, context: TargetBuildInputContext) => I | Promise<I>,
  resetService: Service<J, O>,
  resetInput: (config: C, context: TargetResetInputContext) => J | Promise<J>,
): Rule<C, O>;

function defineRule<
  C,
  I extends Serializable,
  O extends Serializable,
  J extends Serializable,
>(
  buildService: Service<I, O>,
  buildInput?: (config: C, context: TargetBuildInputContext) => I | Promise<I>,
  resetService?: Service<J, O>,
  resetInput?: (config: C, context: TargetResetInputContext) => J | Promise<J>,
): Rule<C, O> {
  return (id, config) =>
    defineTarget({
      id,
      config,
      build: {
        service: buildService,
        input: buildInput ?? ((c: C) => c as unknown as I),
      },
      reset:
        resetService && resetInput
          ? {
              service: resetService,
              input: resetInput,
            }
          : undefined,
    });
}

export { type Rule, defineRule };
