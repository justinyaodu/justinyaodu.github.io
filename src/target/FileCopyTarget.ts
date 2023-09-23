import { copyFile, deleteFileSync } from "../util/filesystem.js";

import { Target } from "./Target.js";

class FileCopyTarget extends Target<Record<never, never>, undefined> {
  constructor(
    public srcProjectPath: string,
    public destProjectPath: string,
  ) {
    super(`FileCopy@${destProjectPath}@${srcProjectPath}`, {});
  }

  override async build(): Promise<undefined> {
    await copyFile(this.srcProjectPath, this.destProjectPath);
  }

  protected override onStale(): void {
    deleteFileSync(this.destProjectPath);
  }
}

export { FileCopyTarget };
