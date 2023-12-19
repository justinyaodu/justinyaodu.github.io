import { deleteFileSync, writeFile } from "../util/filesystem.js";

import { Target } from "./Target.js";

import type { TargetBuildArgs } from "./Target.js";

type FileOutputTargetInputs = { data: Buffer | string };
class FileOutputTarget extends Target<FileOutputTargetInputs, undefined> {
  static instancesByPath = new Map<string, FileOutputTarget>();

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

  override async build({
    inputs: { data },
  }: TargetBuildArgs<FileOutputTargetInputs>): Promise<undefined> {
    await writeFile(this.projectPath, data);
  }

  protected override onStale(): void {
    deleteFileSync(this.projectPath);
  }
}

export { FileOutputTarget };
