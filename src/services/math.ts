import katex from "katex";

import type { ServiceDefinition } from "../build/index.js";

const mathServiceDefinition: ServiceDefinition<
  { latex: string; mode: "inline" | "display" },
  string
> = {
  id: "Math",
  pure: true,
  call: ({ args: { latex, mode } }) => {
    const displayMode = mode === "display";
    return katex.renderToString(latex, { throwOnError: true, displayMode });
  },
};

export { mathServiceDefinition };
