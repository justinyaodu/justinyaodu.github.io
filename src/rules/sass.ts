import { targetMacro, type Target } from "../build/index.js";
import { sassService } from "../services/sass.js";

type SassMacroArgs = {
  id: string;
  sass: Target<string>;
};
const sassMacro = targetMacro(sassService, ({ sass }: SassMacroArgs) =>
  sass.tryGet(),
);

export { sassMacro };
