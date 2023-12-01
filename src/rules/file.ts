import { type Target, defineRule } from "../build/index.js";
import {
  readTextFileService,
  writeTextFileService,
  deleteFileService,
  copyFileService,
  type FileWriteAllow,
} from "../services/file.js";

const copyFileRule = defineRule(copyFileService, (config) => config);

const readTextFileRule = defineRule(readTextFileService, (config) => config);

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
