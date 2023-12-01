import { defineRule } from "../build/index.js";
import { preprocessPageContentService } from "../services/dom.js";

import type { Target } from "../build/index.js";

const preprocessPageContentRule = defineRule(
  preprocessPageContentService,
  (html: Target<string>, { tryBuild }) => tryBuild(html),
);

export { preprocessPageContentRule };
