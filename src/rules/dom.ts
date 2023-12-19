import { defineRule } from "../build/index.js";
import {
  applyPageLayoutService,
  preprocessPageContentService,
} from "../services/dom.js";

import type { Target } from "../build/index.js";
import type { PageContent } from "../services/dom.js";

type ApplyPageLayoutTargetConfig = {
  layoutHtml: Target<string>;
  pageContent: Target<PageContent>;
};
const applyPageLayoutRule = defineRule(
  applyPageLayoutService,
  (config: ApplyPageLayoutTargetConfig, { tryBuild }) => tryBuild(config),
);

const preprocessPageContentRule = defineRule(
  preprocessPageContentService,
  (html: Target<string>, { tryBuild }) => tryBuild(html),
);

export { applyPageLayoutRule, preprocessPageContentRule };
