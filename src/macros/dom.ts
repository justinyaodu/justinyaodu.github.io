import { targetMacro, type Target } from "../build/index.js";
import { preprocessPageContentService } from "../services/dom.js";

type PreprocessPageContentMacroArgs = {
  id: string;
  html: Target<string>;
};
const preprocessPageContentMacro = targetMacro(
  preprocessPageContentService,
  ({ html }: PreprocessPageContentMacroArgs) => html.tryBuild(),
);

export { preprocessPageContentMacro };
