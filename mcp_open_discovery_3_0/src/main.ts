import { createAppConfig, runServerAsMain } from './server';

async function main(): Promise<void> {
  const config = createAppConfig();
  await runServerAsMain(config);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});