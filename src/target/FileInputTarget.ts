import { readBinaryFile, readTextFile } from "../filesystem.js";

import { Target } from "./Target.js";

abstract class FileInputTarget<T extends Buffer | string> extends Target<
  Record<string, never>,
  T
> {
  static instancesByPath: Map<string, FileInputTarget<Buffer | string>> =
    new Map();

  constructor(
    public projectPath: string,
    keyPrefix: string,
  ) {
    super(`${keyPrefix}@${projectPath}`, {});

    if (FileInputTarget.instancesByPath.get(projectPath) !== undefined) {
      throw new Error(
        `FileInputTarget already exists for path: ${projectPath}`,
      );
    }
    FileInputTarget.instancesByPath.set(projectPath, this);
  }
}

class BinaryFileInputTarget extends FileInputTarget<Buffer> {
  constructor(projectPath: string) {
    super(projectPath, "BinaryFileInput");
  }

  override async build(): Promise<Buffer> {
    return await readBinaryFile(this.projectPath);
  }
}

class TextFileInputTarget extends FileInputTarget<string> {
  constructor(projectPath: string) {
    super(projectPath, "TextFileInput");
  }

  override async build(): Promise<string> {
    return await readTextFile(this.projectPath);
  }
}

export { FileInputTarget, BinaryFileInputTarget, TextFileInputTarget };
