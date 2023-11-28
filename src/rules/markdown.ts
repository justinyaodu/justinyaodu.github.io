import { markdownServiceDefinition } from "../services/markdown.js";

import type { RuleDefinitionForService, Target } from "../build/index.js";

const markdownRuleDefinition: RuleDefinitionForService<
  Target<string>,
  typeof markdownServiceDefinition
> = {
  build: {
    service: markdownServiceDefinition,
    args: async (t) => await t.tryGet(),
  },
};

export { markdownRuleDefinition };
