import fs from "node:fs/promises";
import pathlib from "node:path";

import type { ServiceDefinition } from "../build/Service.js";

type FileReadAllow = {
  readPathPrefixes: string[];
};

type FileWriteAllow = {
  writePathPrefixes: string[];
};

type FileAllow = FileReadAllow & FileWriteAllow;

function assertAllowed<T extends "read" | "write">(
  allow: { [k in `${T}PathPrefixes`]: string[] },
  operation: T,
  path: string,
): void {
  if (!pathlib.isAbsolute(path)) {
    const msg = `Path is not absolute: ${JSON.stringify(path)}`;
    throw new Error(msg);
  }

  if (pathlib.normalize(path) !== path) {
    const msg = `Path is not normalized: ${JSON.stringify(path)}`;
    throw new Error(msg);
  }

  const prefixes = allow[`${operation}PathPrefixes`];
  for (const prefix of prefixes) {
    if (path.startsWith(prefix)) {
      return;
    }
  }

  const msg = `Cannot ${operation} path ${JSON.stringify(
    path,
  )} because it does not start with an allowed prefix: ${JSON.stringify(
    prefixes,
  )}`;
  throw new Error(msg);
}

async function ensureParentExists(path: string): Promise<void> {
  await fs.mkdir(pathlib.dirname(path), { recursive: true });
}

const copyFileService: ServiceDefinition<
  { allow: FileAllow; src: string; dest: string },
  null
> = {
  id: "FileCopy",
  pure: false,
  call: async ({ args: { allow, src, dest } }) => {
    assertAllowed(allow, "read", src);
    assertAllowed(allow, "write", dest);
    await ensureParentExists(dest);
    await fs.copyFile(src, dest);
    return null;
  },
};

const deleteFileService: ServiceDefinition<
  {
    allow: FileWriteAllow;
    path: string;
  },
  null
> = {
  id: "FileDelete",
  pure: false,
  call: async ({ args: { allow, path } }) => {
    assertAllowed(allow, "write", path);
    try {
      await fs.unlink(path);
    } catch (e) {
      if (
        typeof e === "object" &&
        e !== null &&
        "code" in e &&
        e.code === "ENOENT"
      ) {
        // Ignore files that don't exist.
      } else {
        throw e;
      }
    }
    return null;
  },
};

const readTextFileService: ServiceDefinition<
  {
    allow: FileReadAllow;
    path: string;
  },
  string
> = {
  id: "FileReadText",
  pure: false,
  call: async ({ args: { allow, path } }) => {
    assertAllowed(allow, "read", path);
    return await fs.readFile(path, "utf8");
  },
};

const writeTextFileService: ServiceDefinition<
  { allow: FileWriteAllow; path: string; data: string },
  null
> = {
  id: "FileWriteText",
  pure: false,
  call: async ({ args: { allow, path, data } }) => {
    assertAllowed(allow, "write", path);
    await ensureParentExists(path);
    await fs.writeFile(path, data);
    return null;
  },
};

export {
  type FileAllow,
  type FileReadAllow,
  type FileWriteAllow,
  copyFileService,
  deleteFileService,
  readTextFileService,
  writeTextFileService,
};
