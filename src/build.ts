import { findFiles, watchPaths } from "./filesystem.js";
import { logError } from "./script.js";
import {
  FileInputTarget,
  TextFileInputTarget,
} from "./target/FileInputTarget.js";
import { FileOutputTarget } from "./target/FileOutputTarget.js";
import { SassTarget } from "./target/SassTarget.js";

let exiting = false;
let running = false;
const modifiedPaths: string[] = [];

for (const inputPath of findFiles("/styles")) {
  const outputPath = "/public" + inputPath.replace(/\.scss$/, ".css");
  new FileOutputTarget(
    outputPath,
    new SassTarget(new TextFileInputTarget(inputPath)),
  );
}

async function runBuild() {
  const startTimeMs = Date.now();

  running = true;
  do {
    for (const path of modifiedPaths) {
      FileInputTarget.instancesByPath.get(path)!.markStale();
    }
    modifiedPaths.length = 0;

    await Promise.all(
      Array.from(FileOutputTarget.instancesByPath.values()).map((t) => t.get()),
    );
  } while (!exiting && modifiedPaths.length > 0);
  running = false;

  const endTimeMs = Date.now();
  console.log(`Build completed in ${endTimeMs - startTimeMs} ms.\n`);

  if (exiting) {
    // TODO exit
  }
}

function watch() {
  const paths = ["/styles"];
  watchPaths(
    paths,
    (path) => {
      modifiedPaths.push(path);
      if (!running) {
        runBuild().catch(logError);
      }
    },
    () => {
      exiting = true;
      if (!running) {
        // TODO exit
      }
    },
  );
}

runBuild().catch(logError);
watch();
