import { type Target, defineRule } from "../build/index.js";
import {
  readTextFileService,
  writeTextFileService,
  deleteFileService,
  copyFileService,
  type FileWriteAllow,
  type FileAllow,
  type FileReadAllow,
} from "../services/file.js";

type CopyFileTargetConfig = {
  allow: FileAllow;
  src: string;
  dest: string;
};
const copyFileRule = defineRule(
  copyFileService,
  (config: CopyFileTargetConfig) => config,
);

type ReadTextFileTargetConfig = {
  allow: FileReadAllow;
  path: string;
};
const readTextFileRule = defineRule(
  readTextFileService,
  (config: ReadTextFileTargetConfig) => config,
);

type WriteTextFileTargetConfig = {
  allow: FileWriteAllow;
  path: string;
  data: Target<string>;
};
const writeTextFileRule = defineRule(
  writeTextFileService,
  async ({ data, ...rest }: WriteTextFileTargetConfig, { tryBuild }) => ({
    data: await tryBuild(data),
    ...rest,
  }),
  deleteFileService,
  ({ allow, path }) => ({ allow, path }),
);

export { copyFileRule, readTextFileRule, writeTextFileRule };
