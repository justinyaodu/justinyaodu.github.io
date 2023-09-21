type TargetOutput = string | number | Buffer;

type InputTargets<I extends Record<string, TargetOutput>> = {
  [K in keyof I]: I[K] extends infer O extends TargetOutput
    ? Target<never, O>
    : never;
};

type BuildResult<O extends TargetOutput> = O | null;

type TargetState = "fresh" | "maybe-stale" | "stale";

abstract class Target<
  I extends Record<string, TargetOutput>,
  O extends TargetOutput,
> {
  static instancesByKey: Map<string, Target<never, TargetOutput>> = new Map();

  protected readonly buildIsPureFunction: boolean = false;

  readonly key: string;
  version: number;
  protected readonly inputTargets: Record<string, Target<never, TargetOutput>>;
  private state: TargetState;
  private value: O | null;
  private readonly dependents: Set<Target<never, TargetOutput>>;

  constructor(key: string, inputTargets: InputTargets<I>) {
    this.key = key;
    this.version = 0;
    this.inputTargets = inputTargets;
    this.state = "stale";
    this.value = null;
    this.dependents = new Set();

    for (const target of Object.values(this.inputTargets)) {
      console.log(`Dependency: ${target.key} -> ${key}`);
      target.dependents.add(this);
    }

    if (Target.instancesByKey.has(key)) {
      throw new Error(`Another target with this key already exists: ${key}`);
    }
    Target.instancesByKey.set(key, this);
  }

  private setState(state: TargetState, reason?: string) {
    if (state === "maybe-stale" && !this.buildIsPureFunction) {
      state = "stale";
    }

    this.state = state;
    console.log(`\t${state}${reason ? ` (${reason})` : ""}: ${this.key}`);

    if (this.state === "stale") {
      this.onStale();
    }
  }

  protected onStale(): void {}

  markStale(reason = "explicitly marked"): void {
    if (this.state !== "fresh") {
      return;
    }
    this.setState("maybe-stale", reason);
    for (const target of this.dependents) {
      target.markStale("dependency");
    }
  }

  async get(): Promise<BuildResult<O>> {
    if (this.state === "fresh") {
      return this.value;
    }

    const newValue = await this.buildWrapper();
    const ok = newValue !== null;
    const changed = this.value !== newValue;

    if (changed) {
      this.version++;
      this.value = newValue;
    }

    // TypeScript doesn't know that buildWrapper can change this.state, so the
    // type of this.state is narrowed incorrectly. Use `as string` to suppress-
    // the resulting error.
    // https://github.com/microsoft/TypeScript/issues/50839
    if ((this.state as string) !== "fresh") {
      this.setState(
        "fresh",
        (ok ? "rebuilt" : "failed") +
          ", " +
          (changed ? "now" : "still") +
          " version " +
          this.version,
      );
    }
    return this.value;
  }

  private async buildWrapper(): Promise<BuildResult<O>> {
    const inputValues: Record<string, TargetOutput> = {};
    for (const [name, target] of Object.entries(this.inputTargets)) {
      const buildResult = await target.get();
      if (buildResult === null) {
        console.warn(`Skipping due to previous failure: ${this.key}`);
        return null;
      }
      inputValues[name] = buildResult;
    }

    console.log(`Building: ${this.key}`);

    if (this.state === "maybe-stale") {
      if (this.isStillFresh()) {
        this.setState("fresh", "inputs unchanged");
        return this.value;
      } else {
        this.setState("stale", "inputs changed");
      }
    }

    this.beforeBuild();

    try {
      return await this.build(inputValues as I);
    } catch (e) {
      console.warn(`Failed: ${this.key}`);
      console.warn(String(e).replaceAll(/^/gm, "\t\t"));
      return null;
    }
  }

  protected isStillFresh(): boolean {
    return false;
  }

  protected beforeBuild(): void {}

  protected abstract build(inputValues: I): Promise<O | null>;
}

abstract class PureTarget<
  I extends Record<string, TargetOutput>,
  O extends TargetOutput,
> extends Target<I, O> {
  protected override readonly buildIsPureFunction = true;

  private readonly cachedInputVersions: Map<string, number> = new Map();

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
