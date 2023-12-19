import { defineRule } from "../build/index.js";
import { sassService } from "../services/sass.js";

import type { Target } from "../build/index.js";

const sassRule = defineRule(sassService, (sass: Target<string>, { tryBuild }) =>
  tryBuild(sass),
);

export { sassRule };
