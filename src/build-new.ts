import child_process from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

import chokidar from "chokidar";

import { LocalRunner, type Target } from "./build/index.js";
import {
  copyFileMacro,
  readTextFileMacro,
  writeTextFileMacro,
} from "./rules/file.js";
import { sassMacro } from "./rules/sass.js";

import type { FileAllow } from "./services/file.js";

// https://blog.logrocket.com/alternatives-dirname-node-js-es-modules/
const __filename = url.fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.dirname(path.dirname(__filename));

function projectPathToAbsolutePath(projectPath: string): string {
  return path.join(PROJECT_ROOT, projectPath);
}

function absolutePathToProjectPath(absolutePath: string): string {
  return path.relative(PROJECT_ROOT, absolutePath);
}

function findFiles(projectPath: string): string[] {
  const absolutePath = projectPathToAbsolutePath(projectPath);
  return fs
    .readdirSync(absolutePath, { recursive: true, withFileTypes: true })
    .map((e) => absolutePathToProjectPath(path.join(e.path, e.name)));
}

const readPathPrefixes = [
  "/layouts",
  "/pages",
  "/node_modules/katex/dist",
  "/static",
  "/styles",
].map(projectPathToAbsolutePath);

const writePathPrefixes = ["/public"].map(projectPathToAbsolutePath);

const watchPathPrefixes = readPathPrefixes.concat(
  ["/src"].map(projectPathToAbsolutePath),
);

const allow: FileAllow = {
  readPathPrefixes,
  writePathPrefixes,
};

async function main() {
  const r = new LocalRunner();
  const fileReadTargets = new Map<string, Target>();
  const fileWriteTargets = new Map<string, Target>();

  const copyFile = (src: string, dest: string) => {
    const id = "CopyFile:" + dest;
    src = projectPathToAbsolutePath(src);
    dest = projectPathToAbsolutePath(dest);
    const target = copyFileMacro(r, {
      id,
      allow,
      src,
      dest,
    });
    fileReadTargets.set(src, target);
    fileWriteTargets.set(dest, target);
    return target;
  };

  const readTextFile = (path: string) => {
    const id = "ReadTextFile:" + path;
    path = projectPathToAbsolutePath(path);
    const target = readTextFileMacro(r, {
      id,
      allow,
      path,
    });
    fileReadTargets.set(path, target);
    return target;
  };

  const writeTextFile = (path: string, data: Target<string>) => {
    const id = "WriteTextFile:" + path;
    path = projectPathToAbsolutePath(path);
    const target = writeTextFileMacro(r, {
      id,
      allow,
      path,
      data,
    });
    fileWriteTargets.set(path, target);
    return target;
  };

  const publicDirs = ["public"];

  for (const src of findFiles("/styles")) {
    const sassTarget = sassMacro(r, {
      id: `Sass:${src}`,
      sass: readTextFile(src),
    });
    for (const publicDir of publicDirs) {
      const dest = path.join(
        publicDir,
        "assets",
        src.replace(/[.]scss$/, ".css"),
      );
      writeTextFile(dest, sassTarget);
    }
  }

  for (const publicDir of publicDirs) {
    for (const src of findFiles("static")) {
      const dest = src.replace(/^static/, publicDir);
      copyFile(src, dest);
    }

    copyFile(
      "/node_modules/katex/dist/katex.min.css",
      publicDir + "/assets/katex/katex.min.css",
    );

    for (const src of findFiles("node_modules/katex/dist/fonts")) {
      const dest = path.join(
        publicDir,
        "assets/katex/fonts",
        path.basename(src),
      );
      copyFile(src, dest);
    }
  }

  const build = async () => {
    for (const target of fileWriteTargets.values()) {
      await target.get();
    }
  };

  let events: { type: string; path: string }[] = [];
  let resolve: () => void;
  let promise: Promise<void> = new Promise((r) => (resolve = r));

  chokidar
    .watch(watchPathPrefixes, { ignoreInitial: true })
    .on("all", (type, path) => {
      events.push({ type, path });
      resolve();
    });

  outer: while (true) {
    await build();
    await promise;
    const batch = events;
    events = [];
    promise = new Promise((r) => (resolve = r));

    for (const { type, path } of batch) {
      if (type === "change" && fileReadTargets.has(path)) {
        await fileReadTargets.get(path)!.reset();
      } else {
        child_process.fork(__filename, { detached: true }).unref();
        break outer;
      }
    }
  }
}

await main();
