import { sassService } from "../services/sass.js";

import type { RuleDefinitionForService, Target } from "../build/index.js";

const sassRuleDefinition: RuleDefinitionForService<
  Target<string>,
  typeof sassService
> = {
  build: {
    service: sassService,
    args: async (c) => await c.tryGet(),
  },
};

export { sassRuleDefinition };
