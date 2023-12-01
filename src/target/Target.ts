import util from "node:util";

type TargetOutput = number | object | string | undefined;

type InputTargets<I extends Record<string, TargetOutput>> = {
  [K in keyof I]: I[K] extends infer O extends TargetOutput
    ? Target<never, O>
    : never;
};

type TargetStatus = "ok" | "warn" | "fail" | "skip";
type TargetFreshness = "fresh" | "maybe-stale" | "stale";

type TargetBuildArgs<I> = {
  inputs: I;
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
};

abstract class Target<
  I extends Record<string, TargetOutput> = never,
  O extends TargetOutput = TargetOutput,
> {
  static instancesByKey = new Map<string, Target>();

  protected readonly buildIsPureFunction: boolean = false;

  readonly key: string;
  readonly inputTargets: Record<string, Target>;
  readonly dependents: Set<Target>;
  version: number;
  status: TargetStatus;
  private freshness: TargetFreshness;
  private value: O | null;
  private activeBuild: Promise<O | null> | null;

  constructor(key: string, inputTargets: InputTargets<I>) {
    this.key = key;
    this.inputTargets = inputTargets;
    this.dependents = new Set();
    this.version = 0;
    this.status = "ok";
    this.freshness = "stale";
    this.value = null;
    this.activeBuild = null;

    for (const target of Object.values(this.inputTargets)) {
      target.dependents.add(this);
    }

    if (Target.instancesByKey.has(key)) {
      throw new Error(`Another target with this key already exists: ${key}`);
    }
    Target.instancesByKey.set(key, this);
  }

  private setState(state: TargetFreshness) {
    if (state === "maybe-stale" && !this.buildIsPureFunction) {
      state = "stale";
    }

    this.freshness = state;

    if (this.freshness === "stale") {
      this.onStale();
    }
  }

  protected onStale(): void {}

  markStale(): void {
    if (this.freshness !== "fresh") {
      return;
    }

    this.setState("maybe-stale");
    for (const target of this.dependents) {
      target.markStale();
    }
  }

  async get(): Promise<O | null> {
    if (this.freshness === "fresh") {
      return this.value;
    }

    if (this.activeBuild === null) {
      this.activeBuild = this.runBuild();
    }
    return this.activeBuild;
  }

  async runBuild(): Promise<O | null> {
    const newValue = await this.buildWrapper();
    const changed = this.value !== newValue;

    if (changed) {
      this.version++;
      this.value = newValue;
    }

    this.setState("fresh");
    this.activeBuild = null;
    return this.value;
  }

  private async buildWrapper(): Promise<O | null> {
    const logs: unknown[][] = [];
    let startTimeMs: number | null = null;
    try {
      const inputs: Record<string, TargetOutput> = {};
      for (const [name, target] of Object.entries(this.inputTargets)) {
        const buildResult = await target.get();
        if (buildResult === null) {
          this.status = "skip";
          return null;
        }
        inputs[name] = buildResult;
      }

      if (this.freshness === "maybe-stale") {
        if (this.isStillFresh()) {
          this.setState("fresh");
          return this.value;
        } else {
          this.setState("stale");
        }
      }

      this.beforeBuild();

      this.status = "ok";
      startTimeMs = Date.now();
      try {
        return await this.build({
          inputs: inputs as I,
          log: (...args) => {
            logs.push(args);
          },
          warn: (...args) => {
            this.status = "warn";
            logs.push(args);
          },
        });
      } catch (e) {
        this.status = "fail";
        logs.push([e]);
        return null;
      }
    } finally {
      const endTimeMs = Date.now();
      const elapsedTimeMs = startTimeMs === null ? 0 : endTimeMs - startTimeMs;
      const timingInfo = `${String(elapsedTimeMs).padStart(5)}`;
      console.log(
        `[${this.status.replace("ok", " ok ")}]${timingInfo} ${this.key}`,
      );
      for (const log of logs) {
        console.log(util.format(...log).replace(/^/gm, " ".repeat(16)));
      }
    }
  }

  protected isStillFresh(): boolean {
    return false;
  }

  protected beforeBuild(): void {}

  protected abstract build(args: TargetBuildArgs<I>): Promise<O | null>;
}

abstract class PureTarget<
  I extends Record<string, TargetOutput>,
  O extends TargetOutput,
> extends Target<I, O> {
  protected override readonly buildIsPureFunction = true;

  private readonly cachedInputVersions = new Map<string, number>();

  protected override isStillFresh(): boolean {
    for (const [name, target] of Object.entries(this.inputTargets)) {
      if (this.cachedInputVersions.get(name) !== target.version) {
        return false;
      }
    }
    return true;
  }

  protected override beforeBuild(): void {
    for (const [name, target] of Object.entries(this.inputTargets)) {
      this.cachedInputVersions.set(name, target.version);
    }
  }
}

export { PureTarget, Target };
export type { InputTargets, TargetBuildArgs, TargetOutput };
