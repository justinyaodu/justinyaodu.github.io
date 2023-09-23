import fs from "node:fs";
import path from "node:path";

import chokidar from "chokidar";

import { AsyncBatcher } from "./AsyncBatcher.js";
import { AsyncQueue } from "./AsyncQueue.js";

const PROJECT_ROOT = path.resolve();
const WRITABLE_PATH_PREFIXES = ["/public/", "/public-preview/"];

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

function resolveProjectPath(projectPath: string, forWrite = false) {
  if (!projectPath.startsWith("/")) {
    const message = [
      "Project path does not start with /:",
      JSON.stringify(projectPath),
    ].join(" ");
    throw new Error(message);
  }
  const resolved = path.resolve(PROJECT_ROOT, projectPath.substring(1));

  if (
    forWrite &&
    !WRITABLE_PATH_PREFIXES.some((p) => resolved.startsWith(PROJECT_ROOT + p))
  ) {
    const message = [
      "Cannot access path",
      JSON.stringify(projectPath),
      "because it does not start with one of the writable path prefixes:",
      JSON.stringify(WRITABLE_PATH_PREFIXES),
    ].join(" ");
    throw new Error(message);
  }

  return resolved;
}

async function copyFile(
  srcProjectPath: string,
  destProjectPath: string,
): Promise<void> {
  const srcAbsolutePath = resolveProjectPath(srcProjectPath);
  const destAbsolutePath = resolveProjectPath(destProjectPath, true);
  await fs.promises.mkdir(path.dirname(destAbsolutePath), { recursive: true });
  await fs.promises.copyFile(srcAbsolutePath, destAbsolutePath);
}

function deleteFileSync(projectPath: string): void {
  const absolutePath = resolveProjectPath(projectPath, true);
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

async function writeFile(
  projectPath: string,
  data: string | Buffer,
): Promise<void> {
  const absolutePath = resolveProjectPath(projectPath, true);
  await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.promises.writeFile(absolutePath, data);
}

function stat(projectPath: string): fs.Stats | undefined {
  const absolutePath = resolveProjectPath(projectPath);
  return fs.statSync(absolutePath, { throwIfNoEntry: false });
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
    { ignoreInitial: true },
  );
  const queue = new AsyncQueue<ChokidarEvent>();
  watcher.on("all", (eventName, absolutePath) => {
    const event = { eventName, path: absolutePathToProjectPath(absolutePath) };
    queue.enqueue(event);
  });
  return new AsyncBatcher(queue, 50);
}

export {
  copyFile,
  findFiles,
  deleteFileSync,
  readBinaryFile,
  readTextFile,
  stat,
  writeFile,
  chokidarEventStream,
};

export type { ChokidarEventName, ChokidarEvent };
