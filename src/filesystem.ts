import fs from "node:fs";
import path from "node:path";

import chokidar from "chokidar";

import { AsyncBatcher } from "./util/AsyncBatcher.js";
import { AsyncQueue } from "./util/AsyncQueue.js";

const PROJECT_ROOT = path.resolve();

function absolutePathToProjectPath(absolutePath: string): string {
  return "/" + path.relative(PROJECT_ROOT, absolutePath);
}

function findFiles(dir: string): string[] {
  const absolutePath = resolveProjectPath(dir);
  const absoluteFilePaths = findFilesRecursively(absolutePath);
  return absoluteFilePaths.map(absolutePathToProjectPath);
}

function findFilesRecursively(absoluteDirectoryPath: string): string[] {
  const absolutePaths: string[] = [];

  const entries = fs.readdirSync(absoluteDirectoryPath, {
    withFileTypes: true,
  });
  for (const entry of entries) {
    const absolutePath = path.join(absoluteDirectoryPath, entry.name);
    if (entry.isFile()) {
      absolutePaths.push(absolutePath);
    } else if (entry.isDirectory()) {
      absolutePaths.push(...findFilesRecursively(absolutePath));
    }
  }

  return absolutePaths;
}

function resolveProjectPath(
  projectPath: string,
  additionalPrefix: string = "",
) {
  if (!projectPath.startsWith("/")) {
    const message = [
      "Project path does not start with /:",
      JSON.stringify(projectPath),
    ].join(" ");
    throw new Error(message);
  }
  const resolved = path.resolve(PROJECT_ROOT, projectPath.substring(1));

  const allowedPathPrefix = PROJECT_ROOT + additionalPrefix;
  if (!resolved.startsWith(allowedPathPrefix)) {
    const message = [
      "Cannot access path",
      JSON.stringify(resolved),
      "because it does not start with",
      JSON.stringify(allowedPathPrefix),
    ].join(" ");
    throw new Error(message);
  }

  return resolved;
}

function deleteFileSync(projectPath: string): void {
  const absolutePath = resolveProjectPath(projectPath, "/public");
  if (stat(projectPath)?.isFile) {
    fs.unlinkSync(absolutePath);
  }
}

async function readBinaryFile(projectPath: string): Promise<Buffer> {
  const absolutePath = resolveProjectPath(projectPath);
  return await fs.promises.readFile(absolutePath);
}

async function readTextFile(projectPath: string): Promise<string> {
  const absolutePath = resolveProjectPath(projectPath);
  return await fs.promises.readFile(absolutePath, { encoding: "utf-8" });
}

async function writeFile(projectPath: string, data: string | Buffer): Promise<void> {
  const absolutePath = resolveProjectPath(projectPath, "/public");
  await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.promises.writeFile(absolutePath, data);
}

function stat(projectPath: string): fs.Stats | undefined {
  const absolutePath = resolveProjectPath(projectPath);
  return fs.statSync(absolutePath, { throwIfNoEntry: false });
}

function watchPaths(
  projectPaths: string[],
  changeHandler: (path: string) => void,
  otherHandler: () => void,
): void {
  chokidar
    .watch(projectPaths.map((p) => resolveProjectPath(p)))
    .on("change", (absolutePath) => {
      const projectPath = absolutePathToProjectPath(absolutePath);
      console.log("changed: " + projectPath);
      changeHandler(projectPath);
    })
    .on("add", otherHandler)
    .on("addDir", otherHandler)
    .on("unlink", otherHandler)
    .on("unlinkDir", otherHandler);
}

type ChokidarEventName = "change" | "add" | "addDir" | "unlink" | "unlinkDir";

type ChokidarEvent = {
  eventName: ChokidarEventName;
  path: string;
};

function chokidarEventStream(
  projectPaths: string[],
): AsyncIterableIterator<ChokidarEvent[]> {
  const watcher = chokidar.watch(
    projectPaths.map((p) => resolveProjectPath(p)),
    {  }
  );
  const queue = new AsyncQueue<ChokidarEvent>();
  watcher.on("all", (eventName, absolutePath) => {
    const event = { eventName, path: absolutePathToProjectPath(absolutePath) };
    queue.enqueue(event);
  });
  return new AsyncBatcher(queue, 50);
}

export {
  chokidarEventStream,
  findFiles,
  deleteFileSync,
  readBinaryFile,
  readTextFile,
  stat,
  watchPaths,
  writeFile,
};
