import { type Target, defineRule } from "../build/index.js";
import { sassService } from "../services/sass.js";

const sassRule = defineRule(sassService, (sass: Target<string>, { tryBuild }) =>
  tryBuild(sass),
);

export { sassRule };
