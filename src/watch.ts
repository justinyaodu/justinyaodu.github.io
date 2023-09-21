import path from "node:path";

import { chokidarEventStream, findFiles } from "./filesystem.js";
import { runMain } from "./script.js";
import {
  BinaryFileInputTarget,
  FileInputTarget,
  TextFileInputTarget,
} from "./target/FileInputTarget.js";
import { FileOutputTarget } from "./target/FileOutputTarget.js";
import { MarkdownTarget } from "./target/MarkdownTarget.js";
import { SassTarget } from "./target/SassTarget.js";

const pathsToWatch = [
  "/layouts",
  "/pages",
  "/node_modules/katex/dist",
  "/src",
  "/static",
  "/styles",
];

async function main() {
  for (const inputPath of findFiles("/pages")) {
    const outputPath = inputPath
      .replace(/^[/]pages/, "/public")
      .replace(/[.]md$/, ".html");
    new FileOutputTarget(
      outputPath,
      new MarkdownTarget(new TextFileInputTarget(inputPath))
    );
  }

  for (const inputPath of findFiles("/static")) {
    const outputPath = inputPath.replace(/^[/]static/, "/public");
    new FileOutputTarget(outputPath, new BinaryFileInputTarget(inputPath));
  }

  new FileOutputTarget(
    "/public/assets/katex/katex.min.css",
    new BinaryFileInputTarget("/node_modules/katex/dist/katex.min.css")
  );

  for (const inputPath of findFiles("/node_modules/katex/dist/fonts")) {
    const outputPath = "/public/assets/katex/fonts/" + path.basename(inputPath);
    new FileOutputTarget(outputPath, new BinaryFileInputTarget(inputPath));
  }

  for (const inputPath of findFiles("/styles")) {
    const outputPath = "/public" + inputPath.replace(/\.scss$/, ".css");
    new FileOutputTarget(
      outputPath,
      new SassTarget(new TextFileInputTarget(inputPath))
    );
  }

  for (const inputPath of FileInputTarget.instancesByPath.keys()) {
    if (!pathsToWatch.some((prefix) => inputPath.startsWith(prefix))) {
      throw new Error(
        `Path is read but not watched for incremental build: ${inputPath}`
      );
    }
  }

  let firstIteration = true;
  for await (const batch of chokidarEventStream(pathsToWatch)) {
    const startTimeMs = Date.now();

    if (firstIteration) {
      firstIteration = false;
    } else {
      for (const event of batch) {
        if (event.eventName !== "change" || event.path.startsWith("/src")) {
          console.log(
            "Filesystem event not supported by incremental build:",
            event
          );
          return;
        }
        FileInputTarget.instancesByPath.get(event.path)?.markStale();
      }
    }

    await Promise.all(
      Array.from(FileOutputTarget.instancesByPath.values()).map((t) => t.get())
    );

    const endTimeMs = Date.now();
    console.log(`Build completed in ${endTimeMs - startTimeMs} ms.\n`);
  }
}

runMain(main);
