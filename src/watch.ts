import path from "node:path";
import process from "node:process";

import { chokidarEventStream, findFiles } from "./filesystem.js";
import { FileCopyTarget } from "./target/FileCopyTarget.js";
import {
  FileInputTarget,
  TextFileInputTarget,
} from "./target/FileInputTarget.js";
import { FileOutputTarget } from "./target/FileOutputTarget.js";
import { MarkdownTarget } from "./target/MarkdownTarget.js";
import { PagePreviewTarget } from "./target/PagePreviewTarget.js";
import { SassTarget } from "./target/SassTarget.js";
import { Target } from "./target/Target.js";

const pathsToWatch = [
  "/layouts",
  "/pages",
  "/node_modules/katex/dist",
  "/src",
  "/static",
  "/styles",
];

function defineTargets() {
  for (const inputPath of findFiles("/pages")) {
    const outputPath = inputPath
      .replace(/^[/]pages/, "/public")
      .replace(/[.]md$/, ".html");
    new FileOutputTarget(
      outputPath,
      new PagePreviewTarget(
        new MarkdownTarget(new TextFileInputTarget(inputPath)),
      ),
    );
  }

  for (const inputPath of findFiles("/static")) {
    const outputPath = inputPath.replace(/^[/]static/, "/public");
    new FileCopyTarget(inputPath, outputPath);
  }

  new FileCopyTarget(
    "/node_modules/katex/dist/katex.min.css",
    "/public/assets/katex/katex.min.css",
  );

  for (const inputPath of findFiles("/node_modules/katex/dist/fonts")) {
    const outputPath = "/public/assets/katex/fonts/" + path.basename(inputPath);
    new FileCopyTarget(inputPath, outputPath);
  }

  for (const inputPath of findFiles("/styles")) {
    const outputPath = "/public" + inputPath.replace(/\.scss$/, ".css");
    new FileOutputTarget(
      outputPath,
      new SassTarget(new TextFileInputTarget(inputPath)),
    );
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
      FileInputTarget.instancesByPath.get(event.path)?.markStale();
    }
    await rebuildTargets(leafTargets);
  }
}

async function rebuildTargets(targets: Target[]): Promise<void> {
  const startTimeMs = Date.now();
  await Promise.all(targets.map((t) => t.get()));
  const endTimeMs = Date.now();
  console.log(`Build completed in ${endTimeMs - startTimeMs} ms.\n`);
}

async function main() {
  defineTargets();

  const watch = process.argv[1] === "--watch";
  await runBuild(watch);

  const allOk = Array.from(Target.instancesByKey.values()).every(
    (t) => t.status === "ok",
  );
  process.exit(allOk ? 0 : 1);
}

await main();
