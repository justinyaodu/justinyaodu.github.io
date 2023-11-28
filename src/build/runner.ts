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

class LocalRunner implements Runner {
  private _targets = new Map<string, Target>();
  private _services = new Map<string, LocalService<any, any>>();

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

  _reportReset(target: Target, result: TargetResult<Serializable>) {
    // console.log(`reset ${target.id}`);
  }

  _reportBuild<O extends Serializable>(
    target: Target<O>,
    result: TargetResult<O>,
    usedCache: boolean,
  ) {
    console.log(`built ${target.id}${usedCache ? " (unchanged)" : ""}`);
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

    const log = (...args: unknown[]) => {
      logs.push(util.format(args));
    };

    const warn = (...args: unknown[]) => {
      log(args);
      warned = true;
    };

    try {
      const value = await this._definition.call({ args, log, warn });
      return {
        status: warned ? "warned" : "ok",
        value,
        logs,
      };
    } catch (e) {
      logs.push(util.inspect(e));
      return {
        status: "failed",
        logs,
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

  private _proposeState(state: LocalTargetState<O>) {
    if (this._state.clock + 1 === state.clock) {
      this._state = state;
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
      case "building": {
        return state.promise;
      }
      case "fresh": {
        return Promise.resolve(state.cachedResult);
      }
    }

    let resetPromise: Promise<void>;
    switch (state.id) {
      case "initial":
        resetPromise = this._doReset();
        break;

      case "resetting":
        resetPromise = state.promise;
        break;

      case "stale":
        resetPromise = Promise.resolve();
        break;
    }

    const buildingClock = state.clock + 1;
    const freshClock = state.clock + 2;

    const buildPromise = resetPromise.then(() =>
      this._doBuild(state.cachedSerializedInputs, state.cachedResult),
    );
    const resultPromise = buildPromise.then((s) => s.cachedResult);

    this._state = {
      id: "building",
      clock: buildingClock,
      promise: resultPromise,
      cachedSerializedInputs: state.cachedSerializedInputs,
      cachedResult: state.cachedResult,
    };

    void buildPromise.then(({ cachedSerializedInputs, cachedResult }) => {
      if (this._state.clock === buildingClock) {
        this._proposeState({
          id: "fresh",
          clock: freshClock,
          cachedSerializedInputs,
          cachedResult,
        });
      }
    });

    return resultPromise;
  }

  private async _doBuild(
    cachedSerializedInputs: string | null,
    cachedResult: TargetResult<O> | null,
  ): Promise<{
    cachedSerializedInputs: string | null;
    cachedResult: TargetResult<O>;
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
        result = await this._buildService.call(inputs);
      }
    } catch (e) {
      result = {
        status: e instanceof TargetUnavailableError ? "skipped" : "failed",
        logs: [util.inspect(e)],
      };
    }

    this._runner._reportBuild(this, result, usedCache);
    return {
      cachedSerializedInputs: serializedInputs,
      cachedResult: result,
    };
  }

  async reset(): Promise<void> {
    const promises: Promise<void>[] = [];
    this._recursiveReset(promises);
    await Promise.all(promises);
  }

  private _recursiveReset(promises: Promise<void>[]): void {
    const state = this._state;
    switch (state.id) {
      case "resetting":
        promises.push(state.promise);
        return;
      case "stale":
        return;
    }

    const buildPromise =
      state.id === "building" ? state.promise : Promise.resolve();
    const resetPromise = buildPromise.then(() => this._doReset());

    const resettingClock = state.clock + 1;
    const staleClock = state.clock + 2;

    this._state = {
      id: "resetting",
      clock: resettingClock,
      promise: resetPromise,
      cachedSerializedInputs: state.cachedSerializedInputs,
      cachedResult: state.cachedResult,
    };

    void resetPromise.then(() => {
      this._proposeState({
        id: "stale",
        clock: staleClock,
        cachedSerializedInputs: state.cachedSerializedInputs,
        cachedResult: state.cachedResult,
      });
    });

    promises.push(resetPromise);

    for (const dependent of this._dependents) {
      dependent._recursiveReset(promises);
    }
  }

  private async _doReset(): Promise<void> {
    if (this._resetService.pure) {
      return;
    }

    let result: TargetResult<Serializable>;
    try {
      const inputs = await this._resetInputs(this._args);
      result = await this._resetService.call(inputs);
    } catch (e) {
      result = {
        status: "failed",
        logs: [util.inspect(e)],
      };
    }

    this._runner._reportReset(this, result);
  }
}

export { type Runner, LocalRunner };
