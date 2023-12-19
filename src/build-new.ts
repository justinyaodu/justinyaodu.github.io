import path from "node:path";
import url from "node:url";

import { runner } from "./build/index.js";
import { filesystemMacro } from "./macros/filesystem.js";
import { applyPageLayoutRule, preprocessPageContentRule } from "./rules/dom.js";
import { markdownRule } from "./rules/markdown.js";
import { sassRule } from "./rules/sass.js";

// https://blog.logrocket.com/alternatives-dirname-node-js-es-modules/
const __filename = url.fileURLToPath(import.meta.url);
const projectRoot = path.dirname(path.dirname(__filename));

async function main() {
  const r = runner();

  const publicDirs = ["public"];

  const { findFiles, copyFile, readTextFile, writeTextFile, watchFiles } =
    filesystemMacro(r, {
      projectRoot,
      readPathPrefixes: [
        "images",
        "layouts",
        "pages",
        "node_modules/katex/dist",
        "static",
        "styles",
      ],
      writePathPrefixes: publicDirs,
      watchPathPrefixes: ["src"],
    });

  const layoutHtml = readTextFile("layouts/page.html");

  for (const src of findFiles("pages")) {
    const pageContent = preprocessPageContentRule(
      `PreprocessPageContent:${src}`,
      markdownRule(`Markdown:${src}`, readTextFile(src)),
    );

    for (const publicDir of publicDirs) {
      const dest = src.replace(/^pages/, publicDir).replace(/[.]md$/, ".html");
      writeTextFile(
        dest,
        applyPageLayoutRule(`ApplyPageLayout:${src}`, {
          layoutHtml,
          pageContent,
        }),
      );
    }
  }

  for (const src of findFiles("/styles")) {
    const css = sassRule(`Sass:${src}`, readTextFile(src));
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

    for (const src of findFiles("images")) {
      const dest = path.join(publicDir, "assets", src);
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
          if (!e.cached && !e.obsolete) {
            if (e.result.status !== "ok") {
              console.log(`Build ${e.result.status}: ${e.target.id}`);
              if (e.result.status !== "skipped") {
                console.log(e.result.logs.replaceAll(/^/gm, "\t"));
              }
            }
          }

          building--;
          stats[e.result.status]++;

          if (building === 0) {
            const summary = Object.entries(stats)
              .filter(([_, count]) => count > 0)
              .map(([status, count]) => `${count} ${status}`)
              .join(", ");
            const elapsedMs = e.timestampMs - startTimestampMs;
            console.log(`${summary} in ${elapsedMs} ms`);

            stats = emptyStats();
          }
          break;
        }
        default:
          break;
      }
    });
  }

  await watchFiles();
}

await main();
