import fs from "node:fs";
import pathlib from "node:path";

import chokidar from "chokidar";

import {
  copyFileMacro,
  readTextFileMacro,
  writeTextFileMacro,
} from "./file.js";

import type { Runner, Target } from "../build/index.js";
import type { FileAllow } from "../services/file.js";

type FilesystemMacroArgs = {
  projectRoot: string;
  readPathPrefixes: string[];
  writePathPrefixes: string[];
  watchPathPrefixes: string[];
};

type FilesystemMacroReturn = {
  toAbsolutePath: (projectPath: string) => string;
  toProjectPath: (absolutePath: string) => string;
  findFiles: (dir: string) => string[];

  readingTargets: Map<string, [Target]>;
  writingTargets: Map<string, [Target]>;

  copyFile: (src: string, dest: string) => Target<null>;
  readTextFile: (path: string) => Target<string>;
  writeTextFile: (path: string, data: Target<string>) => Target<null>;

  buildFiles: () => Promise<void>;
  watchFiles: () => Promise<void>;
};

function filesystem(
  r: Runner,
  args: FilesystemMacroArgs,
): FilesystemMacroReturn {
  const { projectRoot } = args;

  const readingTargets = new Map<string, [Target]>();
  const writingTargets = new Map<string, [Target]>();

  const mapGetPush = <K, V>(map: Map<K, V[]>, key: K, value: V): void => {
    let array = map.get(key);
    if (array === undefined) {
      array = [];
      map.set(key, array);
    }
    array.push(value);
  };

  const toAbsolutePath: FilesystemMacroReturn["toAbsolutePath"] = (
    projectPath,
  ) => pathlib.join(projectRoot, projectPath);

  const toProjectPath: FilesystemMacroReturn["toProjectPath"] = (
    absolutePath,
  ) => pathlib.relative(projectRoot, absolutePath);

  const findFiles: FilesystemMacroReturn["findFiles"] = (dir) =>
    fs
      .readdirSync(toAbsolutePath(dir), {
        recursive: true,
        withFileTypes: true,
      })
      .map((e) => toProjectPath(pathlib.join(e.path, e.name)));

  const readPathPrefixes = args.readPathPrefixes.map(toAbsolutePath);
  const writePathPrefixes = args.writePathPrefixes.map(toAbsolutePath);
  const watchPathPrefixes = readPathPrefixes.concat(
    args.watchPathPrefixes.map(toAbsolutePath),
  );

  const allow: FileAllow = {
    readPathPrefixes,
    writePathPrefixes,
  };

  const copyFile: FilesystemMacroReturn["copyFile"] = (src, dest) => {
    const id = `CopyFile:${dest}`;
    const target = copyFileMacro(r, {
      id,
      allow,
      src: toAbsolutePath(src),
      dest: toAbsolutePath(dest),
    });
    mapGetPush(readingTargets, src, target);
    mapGetPush(writingTargets, dest, target);
    return target;
  };

  const readTextFile: FilesystemMacroReturn["readTextFile"] = (path) => {
    const id = `ReadTextFile:${path}`;
    const target = readTextFileMacro(r, {
      id,
      allow,
      path: toAbsolutePath(path),
    });
    mapGetPush(readingTargets, path, target);
    return target;
  };

  const writeTextFile: FilesystemMacroReturn["writeTextFile"] = (
    path,
    data,
  ) => {
    const id = `WriteTextFile:${path}`;
    const target = writeTextFileMacro(r, {
      id,
      allow,
      path: toAbsolutePath(path),
      data,
    });
    mapGetPush(writingTargets, path, target);
    return target;
  };

  const buildFiles: FilesystemMacroReturn["buildFiles"] = async () => {
    await Promise.allSettled(
      Array.from(writingTargets.values()).flatMap((ts) =>
        ts.map((t) => t.build()),
      ),
    );
  };

  const watchFiles: FilesystemMacroReturn["watchFiles"] = async () => {
    let events: { type: string; path: string }[] = [];
    let eventsNonEmptyResolve: () => void;
    let eventsNonEmptyPromise: Promise<void> = new Promise(
      (r) => (eventsNonEmptyResolve = r),
    );

    const watcher = chokidar
      .watch(watchPathPrefixes, { cwd: projectRoot, ignoreInitial: true })
      .on("all", (type, path) => {
        events.push({ type, path });
        eventsNonEmptyResolve();
      });

    outer: while (true) {
      await buildFiles();
      await eventsNonEmptyPromise;

      const batch = events;
      events = [];
      eventsNonEmptyPromise = new Promise((r) => (eventsNonEmptyResolve = r));

      for (const { type, path } of batch) {
        let targets;
        if (
          type === "change" &&
          (targets = readingTargets.get(path)) !== undefined
        ) {
          await Promise.allSettled(targets.map((t) => t.reset()));
        } else {
          break outer;
        }
      }
    }

    await watcher.close();
  };

  return {
    toAbsolutePath,
    toProjectPath,
    findFiles,
    readingTargets,
    writingTargets,
    copyFile,
    readTextFile,
    writeTextFile,
    buildFiles,
    watchFiles,
  };
}

export { type FilesystemMacroArgs, type FilesystemMacroReturn, filesystem };
