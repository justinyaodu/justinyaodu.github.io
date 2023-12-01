import { type Target, defineRule } from "../build/index.js";
import { preprocessPageContentService } from "../services/dom.js";

const preprocessPageContentRule = defineRule(
  preprocessPageContentService,
  (html: Target<string>, { tryBuild }) => tryBuild(html),
);

export { preprocessPageContentRule };
