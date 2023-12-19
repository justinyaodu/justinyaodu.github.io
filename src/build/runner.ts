import util from "node:util";

import { serialize } from "./serializable.js";
import { ServiceInstance } from "./service.js";
import { TargetInstance } from "./target.js";

import type { Serializable } from "./serializable.js";
import type { Service, ServiceResult, ServiceRunContext } from "./service.js";
import type {
  Target,
  TargetBuildInputContext,
  TargetResetInputContext,
  TargetResult,
  TryBuildObjectReturn,
  TryBuildRestReturn,
} from "./target.js";

class TargetUnavailableError extends Error {
  constructor(
    public readonly target: Target,
    public readonly status: "failed" | "skipped",
  ) {
    super(`${JSON.stringify(target.id)} ${status}`);
    this.name = "TargetUnavailableError";
  }
}

type Runner = {
  on(type: "all", listener: (event: RunnerEvent) => void): void;
  on<T extends RunnerEvent["type"]>(
    type: T,
    listener: (event: RunnerEvent & { type: T }) => void,
  ): void;

  call<I extends Serializable, O extends Serializable>(
    service: Service<I, O>,
    input: I,
  ): Promise<ServiceResult<O>>;
  // tryCall<I, O>(service: Service<I, O>, input: I): Promise<O>;

  build<O extends Serializable>(target: Target<O>): Promise<TargetResult<O>>;
  tryBuild<O extends Serializable>(target: Target<O>): Promise<O>;
  tryBuild<T extends readonly Target[]>(
    targets: T,
  ): Promise<TryBuildRestReturn<T>>;
  tryBuild<T extends Readonly<Record<string, Target>>>(
    targets: T,
  ): Promise<TryBuildObjectReturn<T>>;

  reset(target: Target): Promise<ServiceResult<Serializable>>;
  // tryReset(target: Target): Promise<Serializable>;
};

type RawRunnerEvent =
  | {
      readonly type: "targetResetStart";
      readonly target: Target;
    }
  | {
      readonly type: "targetResetCall";
      readonly target: Target;
    }
  | {
      readonly type: "targetResetEnd";
      readonly target: Target;
      readonly result: ServiceResult<Serializable>;
    }
  | {
      readonly type: "targetBuildStart";
      readonly target: Target;
    }
  | {
      readonly type: "targetBuildCall";
      readonly target: Target;
    }
  | {
      readonly type: "targetBuildEnd";
      readonly target: Target;
      readonly result: TargetResult<Serializable>;
      readonly obsolete: boolean;
      readonly cached: boolean;
      // TODO: startToEndMs and callToEndMs?
    };

type RunnerEvent = RawRunnerEvent & {
  readonly sequence: number;
  readonly timestampMs: number;
} extends infer I
  ? { [K in keyof I]: I[K] }
  : never;

type TargetState<O extends Serializable> =
  | {
      readonly type: "initial";
      readonly clock: 0;
      readonly cachedSerializedInput: null;
      readonly cachedResult: null;
    }
  | {
      readonly type: "resetting";
      readonly clock: number;
      readonly promise: Promise<ServiceResult<Serializable>>;
      readonly cachedSerializedInput: string | null;
      readonly cachedResult: TargetResult<O> | null;
    }
  | {
      readonly type: "stale";
      readonly clock: number;
      readonly resetResult: ServiceResult<Serializable>;
      readonly cachedSerializedInput: string | null;
      readonly cachedResult: TargetResult<O> | null;
    }
  | {
      readonly type: "building";
      readonly clock: number;
      readonly promise: Promise<TargetResult<O>>;
      readonly cachedSerializedInput: string | null;
      readonly cachedResult: TargetResult<O> | null;
    }
  | {
      readonly type: "fresh";
      readonly clock: number;
      readonly cachedSerializedInput: string | null;
      readonly cachedResult: TargetResult<O>;
    };

class LocalRunner implements Runner {
  private readonly _listeners: {
    type: "all" | RunnerEvent["type"];
    listener: (event: RunnerEvent) => void;
  }[] = [];
  private readonly _services = new Map<string, ServiceInstance<any, any>>();
  private readonly _targets = new Map<
    string,
    TargetInstance<any, any, any, any>
  >();
  private readonly _targetStates = new Map<string, TargetState<Serializable>>();
  private readonly _targetDependents = new Map<
    string,
    Set<TargetInstance<any, any, any, any>>
  >();
  private _sequence = 0;

  on(type: "all", listener: (event: RunnerEvent) => void): void;
  on<T extends RunnerEvent["type"]>(
    type: T,
    listener: (event: RunnerEvent & { type: T }) => void,
  ): void;
  on(
    type: "all" | RunnerEvent["type"],
    listener: (event: RunnerEvent) => void,
  ): void {
    this._listeners.push({ type, listener });
  }

  private _emit(event: RawRunnerEvent): void {
    const sequence = this._sequence++;
    const timestampMs = Date.now();

    for (const { type, listener } of this._listeners) {
      if (type === event.type || type === "all") {
        try {
          listener({
            ...event,
            sequence,
            timestampMs,
          });
        } catch (e) {
          console.log("Runner listener threw", e);
        }
      }
    }
  }

  private _asServiceInstance<I extends Serializable, O extends Serializable>(
    service: Service<I, O>,
  ): ServiceInstance<I, O> {
    if (!(service instanceof ServiceInstance)) {
      throw new TypeError("Not a ServiceInstance");
    }

    const existing = this._services.get(service.id);
    if (existing === undefined) {
      this._services.set(service.id, service);
    } else if (existing !== service) {
      const msg = `Cannot have more than one service with id ${JSON.stringify(
        service.id,
      )}.`;
      throw new Error(msg);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return service;
  }

  private _asTargetInstance<
    C,
    I extends Serializable,
    O extends Serializable,
    J extends Serializable,
  >(target: Target<O>): TargetInstance<C, I, O, J> {
    if (!(target instanceof TargetInstance)) {
      throw new TypeError("Not a TargetInstance");
    }

    const existing = this._targets.get(target.id);
    if (existing === undefined) {
      this._targets.set(target.id, target);
      this._targetStates.set(target.id, {
        type: "initial",
        clock: 0,
        cachedSerializedInput: null,
        cachedResult: null,
      });
      this._targetDependents.set(target.id, new Set());
    } else if (existing !== target) {
      const msg = `Cannot have more than one target with id ${JSON.stringify(
        target.id,
      )}.`;
      throw new Error(msg);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return target;
  }

  private _getTargetState<
    C,
    I extends Serializable,
    O extends Serializable,
    J extends Serializable,
  >(target: TargetInstance<C, I, O, J>): TargetState<O> {
    return this._targetStates.get(target.id) as TargetState<O>;
  }

  private _proposeTargetState<
    C,
    I extends Serializable,
    O extends Serializable,
    J extends Serializable,
  >(target: TargetInstance<C, I, O, J>, state: TargetState<O>): boolean {
    const successful =
      this._targetStates.get(target.id)!.clock + 1 === state.clock;
    if (successful) {
      this._targetStates.set(target.id, state);
    }
    return successful;
  }

  private _setTargetState<
    C,
    I extends Serializable,
    O extends Serializable,
    J extends Serializable,
  >(target: TargetInstance<C, I, O, J>, state: TargetState<O>): void {
    if (!this._proposeTargetState(target, state)) {
      const currentStr = JSON.stringify(this._getTargetState(target));
      const proposedStr = JSON.stringify(state);
      const msg = `Internal error: proposed target state was rejected. Currently ${currentStr}, proposed ${proposedStr}.`;
      throw new Error(msg);
    }
  }

  async call<I extends Serializable, O extends Serializable>(
    service: Service<I, O>,
    input: I,
  ): Promise<ServiceResult<O>> {
    let warned = false as boolean;
    const logs: string[] = [];

    const log = (...values: unknown[]) => {
      logs.push(util.format(...values));
    };

    const warn = (...values: unknown[]) => {
      log(...values);
      warned = true;
    };

    const call: ServiceRunContext["call"] = this.call.bind(this);

    // eslint-disable-next-line @typescript-eslint/no-shadow
    const tryCall: ServiceRunContext["tryCall"] = async (service, input) => {
      const result = await this.call(service, input);
      logs.push(result.logs);
      switch (result.status) {
        case "ok":
          break;
        case "warned":
          warned = true;
          break;
        case "failed":
          throw new Error(
            `Call to service ${JSON.stringify(service.id)} failed.`,
          );
      }
      return result.value;
    };

    try {
      const serviceInstance = this._asServiceInstance(service);
      const value = await serviceInstance.run(input, {
        log,
        warn,
        call,
        tryCall,
      });
      return {
        status: warned ? "warned" : "ok",
        value,
        logs: logs.join("\n"),
      };
    } catch (e) {
      logs.push(util.inspect(e));
      return {
        status: "failed",
        logs: logs.join("\n"),
      };
    }
  }

  build<O extends Serializable>(target: Target<O>): Promise<TargetResult<O>> {
    const targetInstance = this._asTargetInstance(target);
    const state = this._getTargetState(targetInstance);

    switch (state.type) {
      case "initial":
        // We want the state to be "building" when this method returns, so
        // we can't wait for the reset promise. But we don't have to, because
        // reset sets the state to "resetting" when it returns, and we already
        // have a way to handle that. The reset promise never rejects anyway.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.reset(target);
        return this.build(target);
      case "building":
        return state.promise;
      case "fresh":
        return Promise.resolve(state.cachedResult);
      default:
        break;
    }

    let resetPromise;
    switch (state.type) {
      case "resetting":
        resetPromise = state.promise;
        break;
      case "stale":
        resetPromise = Promise.resolve();
        break;
    }

    const buildingClock = state.clock + 1;
    const freshClock = state.clock + 2;

    const buildPromise = resetPromise.then(async () => {
      const { result, serializedInput, usedCache } = await this._doBuild(
        targetInstance,
        state.cachedSerializedInput,
        state.cachedResult,
      );

      const obsolete = !this._proposeTargetState(targetInstance, {
        type: "fresh",
        clock: freshClock,
        cachedSerializedInput: serializedInput,
        cachedResult: result,
      });

      this._emit({
        type: "targetBuildEnd",
        target,
        result,
        obsolete,
        cached: usedCache,
      });

      return result;
    });

    this._setTargetState(targetInstance, {
      type: "building",
      clock: buildingClock,
      promise: buildPromise,
      cachedSerializedInput: state.cachedSerializedInput,
      cachedResult: state.cachedResult,
    });

    this._emit({
      type: "targetBuildStart",
      target,
    });

    return buildPromise;
  }

  reset(target: Target): Promise<ServiceResult<Serializable>> {
    const targetInstance = this._asTargetInstance(target);
    const state = this._getTargetState(targetInstance);

    switch (state.type) {
      case "resetting":
        return state.promise;
      case "stale":
        return Promise.resolve(state.resetResult);
      default:
        break;
    }

    let buildPromise;
    switch (state.type) {
      case "initial":
      case "fresh":
        buildPromise = Promise.resolve();
        break;
      case "building":
        buildPromise = state.promise;
        break;
    }

    const resettingClock = state.clock + 1;
    const staleClock = state.clock + 2;

    const resetPromise = buildPromise.then(async () => {
      const resetResult = await this._doReset(targetInstance);

      this._proposeTargetState(targetInstance, {
        type: "stale",
        clock: staleClock,
        resetResult,
        cachedSerializedInput: state.cachedSerializedInput,
        cachedResult: state.cachedResult,
      });

      this._emit({
        type: "targetResetEnd",
        target,
        result: resetResult,
      });

      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      await resetDependents;

      return resetResult;
    });

    this._setTargetState(targetInstance, {
      type: "resetting",
      clock: resettingClock,
      promise: resetPromise,
      cachedSerializedInput: state.cachedSerializedInput,
      cachedResult: state.cachedResult,
    });

    this._emit({
      type: "targetResetStart",
      target,
    });

    // Define this here so that reset events are emitted in topological order.
    const resetDependents = Promise.all(
      [...this._targetDependents.get(target.id)!.values()].map((t) =>
        this.reset(t),
      ),
    );

    return resetPromise;
  }

  private async _doBuild<
    C,
    I extends Serializable,
    O extends Serializable,
    J extends Serializable,
  >(
    targetInstance: TargetInstance<C, I, O, J>,
    cachedSerializedInput: string | null,
    cachedResult: TargetResult<O> | null,
  ): Promise<{
    result: TargetResult<O>;
    serializedInput: string | null;
    usedCache: boolean;
  }> {
    const tryBuild: (
      t: Target | Target[] | Readonly<Record<string, Target>>,
    ) => Promise<
      Serializable | Serializable[] | Record<string, Serializable>
    > = (t) =>
      this._tryBuildWithCallback(t, (dependency) => {
        this._targetDependents
          .get(this._asTargetInstance(dependency).id)!
          .add(targetInstance);
      });

    const inputContext: TargetBuildInputContext = {
      // I tried really hard to make this typecheck, but overloads are hard.
      tryBuild: tryBuild as TargetBuildInputContext["tryBuild"],
    };

    let serializedInput: string | null = null;
    let result: TargetResult<O>;
    let usedCache = false;

    build: {
      let input;
      try {
        input = await targetInstance.build.input(
          targetInstance.config,
          inputContext,
        );
      } catch (e) {
        result = {
          status: e instanceof TargetUnavailableError ? "skipped" : "failed",
          logs: util.inspect(e),
        };
        break build;
      }

      if (
        this._asServiceInstance(targetInstance.build.service).pure &&
        (serializedInput = serialize(input)) === cachedSerializedInput &&
        cachedResult !== null
      ) {
        usedCache = true;
        result = cachedResult;
      } else {
        this._emit({
          type: "targetBuildCall",
          target: targetInstance,
        });

        result = await this.call(targetInstance.build.service, input);
      }
    }

    return {
      result,
      serializedInput,
      usedCache,
    };
  }

  private async _doReset<
    C,
    I extends Serializable,
    O extends Serializable,
    J extends Serializable,
  >(
    targetInstance: TargetInstance<C, I, O, J>,
  ): Promise<ServiceResult<Serializable>> {
    if (targetInstance.reset === undefined) {
      return {
        status: "ok",
        value: null,
        logs: "",
      };
    }

    const inputContext: TargetResetInputContext = {};

    let input;
    try {
      input = await targetInstance.reset.input(
        targetInstance.config,
        inputContext,
      );
    } catch (e) {
      return {
        status: "failed",
        logs: util.inspect(e),
      };
    }

    this._emit({
      type: "targetResetCall",
      target: targetInstance,
    });

    return await this.call(targetInstance.reset.service, input);
  }

  tryBuild<O extends Serializable>(target: Target<O>): Promise<O>;

  tryBuild<T extends readonly Target[]>(
    targets: T,
  ): Promise<TryBuildRestReturn<T>>;

  tryBuild<T extends Readonly<Record<string, Target>>>(
    targets: T,
  ): Promise<TryBuildObjectReturn<T>>;

  async tryBuild(
    t: Target | readonly Target[] | Readonly<Record<string, Target>>,
  ): Promise<Serializable | Serializable[] | Record<string, Serializable>> {
    return this._tryBuildWithCallback(t);
  }

  private async _tryBuildWithCallback(
    t: Target | readonly Target[] | Readonly<Record<string, Target>>,
    callback?: (t: Target) => void,
  ): Promise<Serializable | Serializable[] | Record<string, Serializable>> {
    if ("id" in t && typeof t.id === "string") {
      const target = t as Target;
      const result = await this.build(target);
      callback?.(target);
      if ("value" in result) {
        return result.value;
      } else {
        throw new TargetUnavailableError(target, result.status);
      }
    } else if (Array.isArray(t)) {
      return Promise.all(
        t.map((e: Target) => this._tryBuildWithCallback(e, callback)),
      );
    } else {
      const entryPromises = Object.entries(t).map(
        async ([k, v]: [string, Target]) =>
          [k, await this._tryBuildWithCallback(v, callback)] as const,
      );
      const entries = await Promise.all(entryPromises);
      return Object.fromEntries(entries);
    }
  }
}

function runner(): Runner {
  return new LocalRunner();
}

export { type Runner, type RunnerEvent, runner };
