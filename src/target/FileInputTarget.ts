import { readBinaryFile, readTextFile } from "../util/filesystem.js";
import { getOrSetComputed } from "../util/map.js";

import { Target } from "./Target.js";

abstract class FileInputTarget<T extends Buffer | string> extends Target<
  Record<never, never>,
  T
> {
  static instances: FileInputTarget<Buffer | string>[] = [];

  protected constructor(
    public projectPath: string,
    keyPrefix: string,
  ) {
    super(`${keyPrefix}@${projectPath}`, {});

    FileInputTarget.instances.push(this);
  }
}

class BinaryFileInputTarget extends FileInputTarget<Buffer> {
  static instancesByPath = new Map<string, BinaryFileInputTarget>();

  protected constructor(projectPath: string) {
    super(projectPath, "BinaryFileInput");
  }

  static from(projectPath: string) {
    return getOrSetComputed(
      BinaryFileInputTarget.instancesByPath,
      projectPath,
      (path) => new BinaryFileInputTarget(path),
    );
  }

  override async build(): Promise<Buffer> {
    return await readBinaryFile(this.projectPath);
  }
}

class TextFileInputTarget extends FileInputTarget<string> {
  static instancesByPath = new Map<string, TextFileInputTarget>();

  protected constructor(projectPath: string) {
    super(projectPath, "TextFileInput");
  }

  static from(projectPath: string) {
    return getOrSetComputed(
      TextFileInputTarget.instancesByPath,
      projectPath,
      (path) => new TextFileInputTarget(path),
    );
  }

  override async build(): Promise<string> {
    return await readTextFile(this.projectPath);
  }
}

export { FileInputTarget, BinaryFileInputTarget, TextFileInputTarget };
