import path from "node:path";
import url from "node:url";

import { LocalRunner } from "./build/index.js";
import { preprocessPageContentMacro } from "./macros/dom.js";
import { filesystem } from "./macros/filesystem.js";
import { markdownMacro } from "./macros/markdown.js";
import { sassMacro } from "./macros/sass.js";

// https://blog.logrocket.com/alternatives-dirname-node-js-es-modules/
const __filename = url.fileURLToPath(import.meta.url);
const projectRoot = path.dirname(path.dirname(__filename));

async function main() {
  const r = new LocalRunner();

  const publicDirs = ["public"];

  const { findFiles, copyFile, readTextFile, writeTextFile, watchFiles } =
    filesystem(r, {
      projectRoot,
      readPathPrefixes: [
        "layouts",
        "pages",
        "node_modules/katex/dist",
        "static",
        "styles",
      ],
      writePathPrefixes: publicDirs,
      watchPathPrefixes: ["src"],
    });

  for (const src of findFiles("pages")) {
    const pageContent = preprocessPageContentMacro(r, {
      id: `PreprocessPageContent:${src}`,
      html: markdownMacro(r, {
        id: `Markdown:${src}`,
        markdown: readTextFile(src),
      }),
    });

    for (const publicDir of publicDirs) {
      const dest = src.replace(/^pages/, publicDir).replace(/[.]md$/, ".html");
      writeTextFile(
        dest,
        pageContent.then((o) => o.html),
      );
    }
  }

  for (const src of findFiles("/styles")) {
    const css = sassMacro(r, {
      id: `Sass:${src}`,
      sass: readTextFile(src),
    });
    for (const publicDir of publicDirs) {
      const dest = path.join(
        publicDir,
        "assets",
        src.replace(/[.]scss$/, ".css"),
      );
      writeTextFile(dest, css);
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

  {
    let building = 0;
    let startTimestampMs = 0;

    const emptyStats = () => ({
      ok: 0,
      warned: 0,
      failed: 0,
      skipped: 0,
    });
    let stats = emptyStats();

    r.on("all", (e) => {
      switch (e.type) {
        case "targetResetEnd": {
          if (e.result.status !== "ok") {
            console.log(`Reset ${e.result.status}: ${e.target.id}`);
            console.log(e.result.logs.replaceAll(/^/gm, "\t"));
          }
          break;
        }
        case "targetBuildStart": {
          if (building === 0) {
            startTimestampMs = e.timestampMs;
          }
          building++;
          break;
        }
        case "targetBuildEnd": {
          if (e.result.status !== "ok") {
            console.log(`Build ${e.result.status}: ${e.target.id}`);
            if (e.result.status !== "skipped") {
              console.log(e.result.logs.replaceAll(/^/gm, "\t"));
            }
          }
          building--;
          stats[e.result.status]++;

          if (building === 0) {
            const summary = Object.entries(stats)
              .filter((pair) => pair[1] > 0)
              .map(([status, count]) => `${count} ${status}`)
              .join(", ");
            const elapsedMs = e.timestampMs - startTimestampMs;
            console.log(`${summary} in ${elapsedMs} ms`);

            stats = emptyStats();
          }
        }
      }
    });
  }

  await watchFiles();
}

await main();
