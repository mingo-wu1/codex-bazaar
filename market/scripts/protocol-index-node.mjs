import { startProtocolIndex } from "../src/protocol-index-http.js";

const [host = "0.0.0.0", rawPort = "8792"] = process.argv.slice(2);
const { server, endpoint } = await startProtocolIndex({ host, port: Number(rawPort) });
process.stdout.write(`${JSON.stringify({ ready: true, endpoint })}\n`);
for (const signal of ["SIGINT", "SIGTERM"]) server.on?.(signal, () => {});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
