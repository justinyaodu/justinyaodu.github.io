import { deleteFileSync, writeFile } from "../filesystem.js";

import { Target } from "./Target.js";

class FileOutputTarget extends Target<{ data: Buffer | string }, number> {
  static instancesByPath: Map<string, FileOutputTarget> = new Map();

  private counter: number = 0;

  constructor(
    public projectPath: string,
    data: Target<never, Buffer | string>,
  ) {
    super(`FileOutput@${projectPath}`, { data });

    if (FileOutputTarget.instancesByPath.get(projectPath) !== undefined) {
      throw new Error(
        `FileOutputTarget already exists for path: ${projectPath}`,
      );
    }
    FileOutputTarget.instancesByPath.set(projectPath, this);
  }

  override async build({ data }: { data: string }): Promise<number> {
    await writeFile(this.projectPath, data);
    return this.counter++;
  }

  protected override onStale(): void {
    deleteFileSync(this.projectPath);
  }
}

export { FileOutputTarget };
