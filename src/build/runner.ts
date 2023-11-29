import util from "node:util";

import { serialize, type Serializable } from "./serializable.js";

import type { Service, ServiceDefinition, ServiceResult } from "./service.js";
import type { Target, TargetResult, TargetDefinition } from "./target.js";

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

  service<I extends Serializable, O extends Serializable>(
    definition: ServiceDefinition<I, O>,
  ): Service<I, O>;

  target<
    A,
    I extends Serializable,
    O extends Serializable,
    J extends Serializable,
  >(
    definition: TargetDefinition<A, I, O, J>,
  ): Target<O>;
};

type RawRunnerEvent =
  | {
      readonly type: "targetResetStart";
      readonly target: Target;
    }
  | {
      readonly type: "targetResetExecute";
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
      readonly type: "targetBuildExecute";
      readonly target: Target;
    }
  | {
      readonly type: "targetBuildEnd";
      readonly target: Target;
      readonly result: TargetResult<Serializable>;
      readonly cached: boolean;
      readonly obsolete: boolean;
    };

type RunnerEvent = RawRunnerEvent & {
  readonly sequence: number;
  readonly timestampMs: number;
} extends infer I
  ? { [K in keyof I]: I[K] }
  : never;

class LocalRunner implements Runner {
  private _listeners: {
    type: "all" | RunnerEvent["type"];
    listener: (event: RunnerEvent) => void;
  }[] = [];
  private _services = new Map<string, LocalService<any, any>>();
  private _targets = new Map<string, Target>();
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

  _emit(event: RawRunnerEvent): void {
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

  service<I extends Serializable, O extends Serializable>(
    definition: ServiceDefinition<I, O>,
  ): Service<I, O> {
    const id = definition.id;
    if (this._services.has(id)) {
      const existing = this._services.get(id)!;
      if (Object.is(existing._definition, definition)) {
        return existing;
      }

      const msg = `Cannot redefine service with id ${JSON.stringify(id)}`;
      throw new Error(msg);
    }

    const service = new LocalService(definition);
    this._services.set(id, service);
    return service;
  }

  target<
    A,
    I extends Serializable,
    O extends Serializable,
    J extends Serializable,
  >(definition: TargetDefinition<A, I, O, J>): Target<O> {
    const id = definition.id;
    if (this._targets.has(id)) {
      const msg = `Cannot redefine target with id ${JSON.stringify(id)}`;
      throw new Error(msg);
    }

    const target = new LocalTarget(this, definition);
    this._targets.set(id, target);
    return target;
  }
}

class LocalService<I extends Serializable, O extends Serializable>
  implements Service<I, O>
{
  readonly id: string;
  readonly pure: boolean;

  constructor(readonly _definition: ServiceDefinition<I, O>) {
    this.id = _definition.id;
    this.pure = _definition.pure;
  }

  async call(args: I): Promise<ServiceResult<O>> {
    let warned = false as boolean;
    const logs: string[] = [];

    const log = (...values: unknown[]) => {
      logs.push(util.format(...values));
    };

    const warn = (...values: unknown[]) => {
      log(...values);
      warned = true;
    };

    try {
      const value = await this._definition.call({ args, log, warn });
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
}

type LocalTargetState<O> =
  | {
      readonly id: "initial";
      readonly clock: 0;
      readonly cachedSerializedInputs: null;
      readonly cachedResult: null;
    }
  | {
      readonly id: "resetting";
      readonly clock: number;
      readonly promise: Promise<void>;
      readonly cachedSerializedInputs: string | null;
      readonly cachedResult: TargetResult<O> | null;
    }
  | {
      readonly id: "stale";
      readonly clock: number;
      readonly cachedSerializedInputs: string | null;
      readonly cachedResult: TargetResult<O> | null;
    }
  | {
      readonly id: "building";
      readonly clock: number;
      readonly promise: Promise<TargetResult<O>>;
      readonly cachedSerializedInputs: string | null;
      readonly cachedResult: TargetResult<O> | null;
    }
  | {
      readonly id: "fresh";
      readonly clock: number;
      readonly cachedSerializedInputs: string | null;
      readonly cachedResult: TargetResult<O>;
    };

class LocalTarget<
  A,
  I extends Serializable,
  O extends Serializable,
  J extends Serializable,
> implements Target<O>
{
  private _dependents = new Set<LocalTarget<any, any, any, any>>();
  private _state: LocalTargetState<O> = {
    id: "initial",
    clock: 0,
    cachedSerializedInputs: null,
    cachedResult: null,
  };

  readonly id: string;
  private readonly _args: A;
  private readonly _buildService: Service<I, O>;
  private readonly _buildInputs: (args: A) => I | Promise<I>;
  private readonly _resetService: Service<J, Serializable>;
  private readonly _resetInputs: (args: A) => J | Promise<J>;

  constructor(
    private readonly _runner: LocalRunner,
    _definition: TargetDefinition<A, I, O, J>,
  ) {
    this.id = _definition.id;
    this._args = _definition.args;
    this._buildService = _runner.service(_definition.buildService);
    this._resetService = _runner.service(_definition.resetService);
    this._buildInputs = _definition.buildInputs;
    this._resetInputs = _definition.resetInputs;
    this._registerDependencies(this._args);
  }

  private _registerDependencies(args: unknown): void {
    if (typeof args !== "object" || args === null) {
      return;
    }

    if (args instanceof LocalTarget) {
      args._dependents.add(this);
    } else if (Array.isArray(args)) {
      for (const child of args) {
        this._registerDependencies(child);
      }
    } else {
      for (const key of Reflect.ownKeys(args)) {
        this._registerDependencies(args[key as keyof typeof args]);
      }
    }
  }

  private _proposeState(state: LocalTargetState<O>): boolean {
    const successful = this._state.clock + 1 === state.clock;
    if (successful) {
      this._state = state;
    }
    return successful;
  }

  private _setState(state: LocalTargetState<O>): void {
    const successful = this._proposeState(state);
    if (!successful) {
      const msg = `Internal error: _proposeState unsuccessful. Current state is ${util.inspect(
        this._state,
      )}; proposed ${util.inspect(state)}`;
      throw new Error(msg);
    }
  }

  async tryBuild(): Promise<O> {
    const result = await this.build();
    switch (result.status) {
      case "ok":
      case "warned":
        return result.value;
      case "failed":
      case "skipped":
        throw new TargetUnavailableError(this, result.status);
    }
  }

  build(): Promise<TargetResult<O>> {
    const state = this._state;
    switch (state.id) {
      case "initial":
        // Don't do a recursive reset here because this initial build might be
        // triggered by a dependent's initial build, and trying to reset the
        // dependent would be bad.
        // Since all dependents would have to build this target before building
        // themselves, and this target has never been built, we don't need a
        // recursive reset anyway.
        return this._resetSelf().then(() => this.build());

      case "building":
        return state.promise;

      case "fresh":
        return Promise.resolve(state.cachedResult);
    }

    let resetPromise: Promise<void>;
    switch (state.id) {
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
      const { serializedInputs, result, usedCache } = await this._doBuild(
        state.cachedSerializedInputs,
        state.cachedResult,
      );

      const obsolete = !this._proposeState({
        id: "fresh",
        clock: freshClock,
        cachedSerializedInputs: serializedInputs,
        cachedResult: result,
      });

      this._runner._emit({
        type: "targetBuildEnd",
        target: this,
        result,
        cached: usedCache,
        obsolete,
      });

      return result;
    });

    this._setState({
      id: "building",
      clock: buildingClock,
      promise: buildPromise,
      cachedSerializedInputs: state.cachedSerializedInputs,
      cachedResult: state.cachedResult,
    });

    this._runner._emit({
      type: "targetBuildStart",
      target: this,
    });

    return buildPromise;
  }

  private async _doBuild(
    cachedSerializedInputs: string | null,
    cachedResult: TargetResult<O> | null,
  ): Promise<{
    serializedInputs: string | null;
    result: TargetResult<O>;
    usedCache: boolean;
  }> {
    let serializedInputs: string | null = null;
    let result: TargetResult<O>;
    let usedCache = false;

    try {
      const inputs = await this._buildInputs(this._args);
      if (
        this._buildService.pure &&
        (serializedInputs = serialize(inputs)) === cachedSerializedInputs &&
        cachedResult !== null
      ) {
        result = cachedResult;
        usedCache = true;
      } else {
        this._runner._emit({
          type: "targetBuildExecute",
          target: this,
        });
        result = await this._buildService.call(inputs);
      }
    } catch (e) {
      result = {
        status: e instanceof TargetUnavailableError ? "skipped" : "failed",
        logs: util.inspect(e),
      };
    }

    return {
      serializedInputs,
      result,
      usedCache,
    };
  }

  async reset(): Promise<void> {
    const promises: Promise<void>[] = [];
    this._resetSelfAndDependents(promises);
    await Promise.all(promises);
  }

  private _resetSelf(): Promise<void> {
    const state = this._state;
    switch (state.id) {
      case "resetting":
      case "stale": {
        const msg = `Internal error: _resetSelf called in state ${state.id}`;
        throw new Error(msg);
      }
    }

    const buildPromise =
      state.id === "building" ? state.promise : Promise.resolve();

    const resettingClock = state.clock + 1;
    const staleClock = state.clock + 2;

    const resetPromise = buildPromise.then(async () => {
      const result = await this._doReset();

      this._setState({
        id: "stale",
        clock: staleClock,
        cachedSerializedInputs: state.cachedSerializedInputs,
        cachedResult: state.cachedResult,
      });

      this._runner._emit({
        type: "targetResetEnd",
        target: this,
        result,
      });
    });

    this._setState({
      id: "resetting",
      clock: resettingClock,
      promise: resetPromise,
      cachedSerializedInputs: state.cachedSerializedInputs,
      cachedResult: state.cachedResult,
    });

    this._runner._emit({
      type: "targetResetStart",
      target: this,
    });

    return resetPromise;
  }

  private _resetSelfAndDependents(promises: Promise<void>[]): void {
    const state = this._state;
    switch (state.id) {
      case "resetting":
        promises.push(state.promise);
        return;
      case "stale":
        return;
    }

    promises.push(this._resetSelf());
    for (const dependent of this._dependents) {
      dependent._resetSelfAndDependents(promises);
    }
  }

  private async _doReset(): Promise<ServiceResult<Serializable>> {
    let result: ServiceResult<Serializable>;
    try {
      const inputs = await this._resetInputs(this._args);
      this._runner._emit({
        type: "targetResetExecute",
        target: this,
      });
      result = await this._resetService.call(inputs);
    } catch (e) {
      result = {
        status: "failed",
        logs: util.inspect(e),
      };
    }
    return result;
  }
}

export { type Runner, LocalRunner };
