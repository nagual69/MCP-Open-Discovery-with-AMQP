"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("./server");
async function main() {
    const config = (0, server_1.createAppConfig)();
    const { stats } = await (0, server_1.startServer)(config);
    console.log(JSON.stringify({
        status: 'started',
        transportModes: config.transportModes,
        registry: stats,
    }, null, 2));
}
main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
});
//# sourceMappingURL=main.js.map