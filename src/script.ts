import process from "node:process";

let errorOccurred: boolean = false;

function logError(...data: unknown[]) {
  errorOccurred = true;
  console.error("[ERROR]", ...data);
}

async function runMain(main: () => Promise<void>) {
  await main().catch(logError);
  process.exit(errorOccurred ? 1 : 0);
}

export { logError, runMain };
