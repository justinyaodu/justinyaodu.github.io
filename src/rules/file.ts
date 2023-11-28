import { targetMacro, type Target } from "../build/index.js";
import {
  readTextFileService,
  writeTextFileService,
  deleteFileService,
  copyFileService,
  type FileWriteAllow,
  type FileAllow,
  type FileReadAllow,
} from "../services/file.js";

type CopyFileMacroArgs = {
  id: string;
  allow: FileAllow;
  src: string;
  dest: string;
};
const copyFileMacro = targetMacro(
  copyFileService,
  ({ allow, src, dest }: CopyFileMacroArgs) => ({ allow, src, dest }),
);

type ReadTextFileMacroArgs = {
  id: string;
  allow: FileReadAllow;
  path: string;
};
const readTextFileMacro = targetMacro(
  readTextFileService,
  ({ allow, path }: ReadTextFileMacroArgs) => ({ allow, path }),
);

type WriteTextFileMacroArgs = {
  id: string;
  allow: FileWriteAllow;
  path: string;
  data: Target<string>;
};
const writeTextFileMacro = targetMacro(
  writeTextFileService,
  async ({ allow, path, data }: WriteTextFileMacroArgs) => ({
    allow,
    path,
    data: await data.tryGet(),
  }),
  deleteFileService,
  ({ allow, path }) => ({ allow, path }),
);

export { copyFileMacro, readTextFileMacro, writeTextFileMacro };
