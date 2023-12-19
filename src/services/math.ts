import katex from "katex";

import { defineService } from "../build/index.js";

const mathService = defineService<
  { latex: string; mode: "inline" | "display" },
  string
>({
  id: "Math",
  pure: true,
  run: ({ latex, mode }) => {
    const displayMode = mode === "display";
    return katex.renderToString(latex, { throwOnError: true, displayMode });
  },
});

export { mathService };
