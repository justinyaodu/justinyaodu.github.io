import path from "node:path";
import process from "node:process";

import { FileCopyTarget } from "./target/FileCopyTarget.js";
import {
  BinaryFileInputTarget,
  FileInputTarget,
  TextFileInputTarget,
} from "./target/FileInputTarget.js";
import { FileOutputTarget } from "./target/FileOutputTarget.js";
import { MarkdownTarget } from "./target/MarkdownTarget.js";
import { PagePreviewTarget } from "./target/PagePreviewTarget.js";
import { RecordTarget } from "./target/RecordTarget.js";
import { SassTarget } from "./target/SassTarget.js";
import { SiteAnalysisTarget } from "./target/SiteAnalysisTarget.js";
import { Target } from "./target/Target.js";
import { chokidarEventStream, findFiles } from "./util/filesystem.js";

const publicDirs = ["/public", "/public-preview"];

const pathsToWatch = [
  "/layouts",
  "/pages",
  "/node_modules/katex/dist",
  "/src",
  "/static",
  "/styles",
];

function defineTargets() {
  const pageLayoutTarget = TextFileInputTarget.from("/layouts/page.html");

  const pagePreviewTargets: Record<string, PagePreviewTarget> = {};

  for (const inputPath of findFiles("/pages")) {
    const pagePreviewTarget = new PagePreviewTarget({
      content: new MarkdownTarget(TextFileInputTarget.from(inputPath)),
      layout: pageLayoutTarget,
    });

    const outputPath = inputPath
      .replace(/^[/]pages/, "/public-preview")
      .replace(/[.]md$/, ".html");

    new FileOutputTarget(outputPath, pagePreviewTarget);

    const pagePath = outputPath
      .replace(/^[/][^/]+/, "")
      .replace(/[.]html$/, "")
      .replace(/[/]index$/, "")
      .replace(/^$/, "/");

    pagePreviewTargets[pagePath] = pagePreviewTarget;

    // For now, the final page looks the same as the preview. This will
    // eventually depend on SiteAnalysisTarget.
    new FileOutputTarget(
      outputPath.replace(/^[/][^/]+/, "/public"),
      pagePreviewTarget,
    );
  }

  new SiteAnalysisTarget(new RecordTarget(pagePreviewTargets));

  for (const publicDir of publicDirs) {
    for (const inputPath of findFiles("/static")) {
      const outputPath = inputPath.replace(/^[/]static/, publicDir);
      new FileCopyTarget(inputPath, outputPath);
    }

    new FileCopyTarget(
      "/node_modules/katex/dist/katex.min.css",
      publicDir + "/assets/katex/katex.min.css",
    );

    for (const inputPath of findFiles("/node_modules/katex/dist/fonts")) {
      const outputPath =
        publicDir + "/assets/katex/fonts/" + path.basename(inputPath);
      new FileCopyTarget(inputPath, outputPath);
    }
  }

  for (const inputPath of findFiles("/styles")) {
    const sassTarget = new SassTarget(TextFileInputTarget.from(inputPath));
    for (const publicDir of publicDirs) {
      const outputPath =
        publicDir + "/assets" + inputPath.replace(/\.scss$/, ".css");
      new FileOutputTarget(outputPath, sassTarget);
    }
  }

  for (const target of Target.instancesByKey.values()) {
    let path: string;
    if (target instanceof FileInputTarget) {
      path = target.projectPath;
    } else if (target instanceof FileCopyTarget) {
      path = target.srcProjectPath;
    } else {
      continue;
    }

    if (!pathsToWatch.some((prefix) => path.startsWith(prefix))) {
      throw new Error(
        `Path is read but not watched for incremental build: ${path}`,
      );
    }
  }
}

async function runBuild(watch: boolean) {
  const leafTargets = Array.from(Target.instancesByKey.values()).filter(
    (t) => t.dependents.size === 0,
  );

  await rebuildTargets(leafTargets);
  if (!watch) {
    return;
  }

  for await (const batch of chokidarEventStream(pathsToWatch)) {
    for (const event of batch) {
      if (event.eventName !== "change" || event.path.startsWith("/src")) {
        console.log(
          "Filesystem event not supported by incremental build:",
          event,
        );
        return;
      }
      console.log(`Changed: ${event.path}`);
      BinaryFileInputTarget.instancesByPath.get(event.path)?.markStale();
      TextFileInputTarget.instancesByPath.get(event.path)?.markStale();
    }
    await rebuildTargets(leafTargets);
  }
}

async function rebuildTargets(targets: Target[]): Promise<void> {
  const startTimeMs = Date.now();
  for (const target of targets) {
    await target.get();
  }
  const endTimeMs = Date.now();
  console.log(`Build completed in ${endTimeMs - startTimeMs} ms.\n`);
}

async function main() {
  console.log("Starting build daemon.");
  defineTargets();

  const watch = process.argv[2] === "--watch";
  await runBuild(watch);

  const allOk = Array.from(Target.instancesByKey.values()).every(
    (t) => t.status === "ok",
  );
  process.exit(allOk ? 0 : 1);
}

await main();
