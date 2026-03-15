import { createAppConfig, startServer } from './server';

async function main(): Promise<void> {
  const config = createAppConfig();
  const { stats } = await startServer(config);
  console.log(
    JSON.stringify(
      {
        status: 'started',
        transportModes: config.transportModes,
        registry: stats,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});