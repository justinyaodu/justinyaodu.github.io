import { defineRule } from "../build/index.js";
import {
  copyFileService,
  deleteFileService,
  readTextFileService,
  writeTextFileService,
} from "../services/file.js";

import type { Target } from "../build/index.js";
import type { FileWriteAllow } from "../services/file.js";

const copyFileRule = defineRule(copyFileService);

const readTextFileRule = defineRule(readTextFileService);

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
