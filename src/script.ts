import process from "node:process";

let errorOccurred: boolean = false;

function logError(...data: unknown[]) {
  errorOccurred = true;
  console.error("[ERROR]", ...data);
}

function runMain(main: () => Promise<void>) {
  main().catch(logError).finally(() => {
    process.exit(errorOccurred ? 1 : 0);
  });
}

export { logError, runMain };
