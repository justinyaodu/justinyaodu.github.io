import { compileString } from "sass";

import { defineService } from "../build/service.js";

const sassService = defineService<string, string>({
  id: "Sass",
  pure: true,
  run: (sass) => compileString(sass).css,
});

export { sassService };
