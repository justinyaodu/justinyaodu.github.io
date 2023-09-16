import fs from "node:fs";
import path from "node:path";

const PROJECT_ROOT = path.resolve();

function findFiles(dir: string): string[] {
  const absolutePath = resolveProjectPath(dir);
  const absoluteFilePaths = findFilesRecursively(absolutePath);
  return absoluteFilePaths.map(
    (absoluteFilePath) => "/" + path.relative(PROJECT_ROOT, absoluteFilePath),
  );
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

function readFile(projectPath: string): string {
  const absolutePath = resolveProjectPath(projectPath);
  return fs.readFileSync(absolutePath, { encoding: "utf-8" });
}

function writeFile(projectPath: string, data: string): void {
  const absolutePath = resolveProjectPath(projectPath, "/public");
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, data);
}

function stat(projectPath: string): fs.Stats | undefined {
  const absolutePath = resolveProjectPath(projectPath);
  return fs.statSync(absolutePath, { throwIfNoEntry: false });
}

export { findFiles, readFile, stat, writeFile };
