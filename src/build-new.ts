import path from "node:path";
import url from "node:url";

import { LocalRunner } from "./build/index.js";
import { filesystem } from "./macros/filesystem.js";
import { sassMacro } from "./macros/sass.js";

// https://blog.logrocket.com/alternatives-dirname-node-js-es-modules/
const __filename = url.fileURLToPath(import.meta.url);
const projectRoot = path.dirname(path.dirname(__filename));

async function main() {
  const r = new LocalRunner();

  const publicDirs = ["public"];

  const readPathPrefixes = [
    "layouts",
    "pages",
    "node_modules/katex/dist",
    "static",
    "styles",
  ];
  const writePathPrefixes = publicDirs;

  const watchPathPrefixes = ["src"];

  const { findFiles, copyFile, readTextFile, writeTextFile, watchFiles } =
    filesystem(r, {
      projectRoot,
      readPathPrefixes,
      writePathPrefixes,
      watchPathPrefixes,
    });

  for (const src of findFiles("/styles")) {
    const sassTarget = sassMacro(r, {
      id: `Sass:${src}`,
      sass: readTextFile(src),
    });
    for (const publicDir of publicDirs) {
      const dest = path.join(
        publicDir,
        "assets",
        src.replace(/[.]scss$/, ".css"),
      );
      writeTextFile(dest, sassTarget);
    }
  }

  for (const publicDir of publicDirs) {
    for (const src of findFiles("static")) {
      const dest = src.replace(/^static/, publicDir);
      copyFile(src, dest);
    }

    copyFile(
      "/node_modules/katex/dist/katex.min.css",
      publicDir + "/assets/katex/katex.min.css",
    );

    for (const src of findFiles("node_modules/katex/dist/fonts")) {
      const dest = path.join(
        publicDir,
        "assets/katex/fonts",
        path.basename(src),
      );
      copyFile(src, dest);
    }
  }

  await watchFiles();
}

await main();
