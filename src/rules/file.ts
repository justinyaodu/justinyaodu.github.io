import {
  fileReadTextServiceDefinition,
  fileWriteTextServiceDefinition,
  fileDeleteServiceDefinition,
  fileCopyServiceDefinition,
  type FileWriteAllow,
} from "../services/file.js";

import type {
  RuleDefinitionForService,
  ServiceArgs,
  Target,
} from "../build/index.js";

type q = ServiceArgs<typeof fileCopyServiceDefinition>;

const fileCopyRuleDefinition: RuleDefinitionForService<
  ServiceArgs<typeof fileCopyServiceDefinition>,
  typeof fileCopyServiceDefinition
> = {
  build: {
    service: fileCopyServiceDefinition,
    args: ({ allow, src, dest }) => ({ allow, src, dest }),
  },
  reset: {
    service: fileDeleteServiceDefinition,
    args: ({ allow, dest }) => ({ allow, path: dest }),
  },
};

type t = typeof fileCopyRuleDefinition;

const fileReadTextRuleDefinition: RuleDefinitionForService<
  ServiceArgs<typeof fileReadTextServiceDefinition>,
  typeof fileReadTextServiceDefinition
> = {
  build: {
    service: fileReadTextServiceDefinition,
    args: (c) => c,
  },
};

const fileWriteTextRuleDefinition: RuleDefinitionForService<
  { allow: FileWriteAllow; path: string; data: Target<string> },
  typeof fileWriteTextServiceDefinition,
  typeof fileDeleteServiceDefinition
> = {
  build: {
    service: fileWriteTextServiceDefinition,
    args: async ({ data, ...args }) => ({ ...args, data: await data.tryGet() }),
  },
  reset: {
    service: fileDeleteServiceDefinition,
    args: ({ allow, path }) => ({ allow, path }),
  },
};

export {
  fileCopyRuleDefinition,
  fileReadTextRuleDefinition,
  fileWriteTextRuleDefinition,
};
