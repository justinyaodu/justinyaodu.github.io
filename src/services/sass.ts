import { compileString } from "sass";

import type { ServiceDefinition } from "../build/service.js";

const sassService: ServiceDefinition<string, string> = {
  id: "Sass",
  pure: true,
  call: ({ args }) => compileString(args).css,
};

export { sassService };
