import util from "node:util";

import { serialize, type Serializable } from "./Serializable.js";

import type { RuleDefinition, Rule, Target, TargetResult } from "./Rule.js";
import type { Service, ServiceDefinition, ServiceResult } from "./Service.js";

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

  rule<
    C,
    I extends Serializable,
    O extends Serializable,
    J extends Serializable,
  >(
    definition: RuleDefinition<C, I, O, J>,
  ): Rule<C, O>;
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

  rule<
    C,
    I extends Serializable,
    O extends Serializable,
    J extends Serializable,
  >(definition: RuleDefinition<C, I, O, J>): Rule<C, O> {
    return {
      target: (id, config) => this._createTarget(id, config, definition),
    };
  }

  private _createTarget<
    C,
    I extends Serializable,
    O extends Serializable,
    J extends Serializable,
  >(
    id: string,
    config: C,
    ruleDefinition: RuleDefinition<C, I, O, J>,
  ): Target<O> {
    if (this._targets.has(id)) {
      const msg = `Cannot redefine target with id ${JSON.stringify(id)}`;
      throw new Error(msg);
    }

    return new LocalTarget(id, config, ruleDefinition, this);
  }

  _reportReset(target: Target, result: TargetResult<Serializable>) {
    console.log(`reset ${target.id}`);
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
      readonly cachedSerializedArgs: null;
      readonly cachedResult: null;
    }
  | {
      readonly id: "resetting";
      readonly clock: number;
      readonly promise: Promise<void>;
      readonly cachedSerializedArgs: string | null;
      readonly cachedResult: TargetResult<O> | null;
    }
  | {
      readonly id: "stale";
      readonly clock: number;
      readonly cachedSerializedArgs: string | null;
      readonly cachedResult: TargetResult<O> | null;
    }
  | {
      readonly id: "building";
      readonly clock: number;
      readonly promise: Promise<TargetResult<O>>;
      readonly cachedSerializedArgs: string | null;
      readonly cachedResult: TargetResult<O> | null;
    }
  | {
      readonly id: "fresh";
      readonly clock: number;
      readonly cachedSerializedArgs: string | null;
      readonly cachedResult: TargetResult<O>;
    };

class LocalTarget<
  C,
  I extends Serializable,
  O extends Serializable,
  J extends Serializable,
> implements Target<O>
{
  private _dependents = new Set<LocalTarget<any, any, any, any>>();
  private _state: LocalTargetState<O> = {
    id: "initial",
    clock: 0,
    cachedSerializedArgs: null,
    cachedResult: null,
  };

  constructor(
    public readonly id: string,
    private readonly _config: C,
    private readonly _ruleDefinition: RuleDefinition<C, I, O, J>,
    private readonly _runner: LocalRunner,
  ) {
    this._registerDependencies(_config);
  }

  private _registerDependencies(config: unknown): void {
    if (typeof config !== "object" || config === null) {
      return;
    }

    if (config instanceof LocalTarget) {
      config._dependents.add(this);
    } else if (Array.isArray(config)) {
      for (const child of config) {
        this._registerDependencies(child);
      }
    } else {
      for (const key of Reflect.ownKeys(config)) {
        this._registerDependencies(config[key as keyof typeof config]);
      }
    }
  }

  private _proposeState(state: LocalTargetState<O>) {
    if (this._state.clock + 1 === state.clock) {
      this._state = state;
    }
  }

  async tryGet(): Promise<O> {
    const result = await this.get();
    switch (result.status) {
      case "ok":
      case "warned":
        return result.value;
      case "failed":
      case "skipped":
        throw new TargetUnavailableError(this, result.status);
    }
  }

  get(): Promise<TargetResult<O>> {
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
      this._doBuild(state.cachedSerializedArgs, state.cachedResult),
    );
    const resultPromise = buildPromise.then((s) => s.cachedResult);

    this._state = {
      id: "building",
      clock: buildingClock,
      promise: resultPromise,
      cachedSerializedArgs: state.cachedSerializedArgs,
      cachedResult: state.cachedResult,
    };

    void buildPromise.then(({ cachedSerializedArgs, cachedResult }) => {
      if (this._state.clock === buildingClock) {
        this._proposeState({
          id: "fresh",
          clock: freshClock,
          cachedSerializedArgs,
          cachedResult,
        });
      }
    });

    return resultPromise;
  }

  private async _doBuild(
    cachedSerializedArgs: string | null,
    cachedResult: TargetResult<O> | null,
  ): Promise<{
    cachedSerializedArgs: string | null;
    cachedResult: TargetResult<O>;
  }> {
    const build = this._ruleDefinition.build;

    let serializedArgs: string | null = null;
    let result: TargetResult<O>;
    let usedCache = false;
    try {
      const service = this._runner.service(build.service);
      const args = await build.args(this._config);
      if (
        service.pure &&
        (serializedArgs = serialize(args)) === cachedSerializedArgs &&
        cachedResult !== null
      ) {
        result = cachedResult;
        usedCache = true;
      } else {
        result = await service.call(args);
      }
    } catch (e) {
      result = {
        status: e instanceof TargetUnavailableError ? "skipped" : "failed",
        logs: [util.inspect(e)],
      };
    }

    this._runner._reportBuild(this, result, usedCache);
    return {
      cachedSerializedArgs: serializedArgs,
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
      cachedSerializedArgs: state.cachedSerializedArgs,
      cachedResult: state.cachedResult,
    };

    void resetPromise.then(() => {
      this._proposeState({
        id: "stale",
        clock: staleClock,
        cachedSerializedArgs: state.cachedSerializedArgs,
        cachedResult: state.cachedResult,
      });
    });

    promises.push(resetPromise);

    for (const dependent of this._dependents) {
      dependent._recursiveReset(promises);
    }
  }

  private async _doReset(): Promise<void> {
    const reset = this._ruleDefinition.reset;
    if (reset === undefined) {
      return;
    }

    let result: TargetResult<Serializable>;
    try {
      const service = this._runner.service(reset.service);
      const args = await reset.args(this._config);
      result = await service.call(args);
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
