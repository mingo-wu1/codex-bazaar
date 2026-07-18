import { startMerchantServer } from "../src/merchant-http.js";

const [home, rawPort = "0"] = process.argv.slice(2);
if (!home) throw new Error("usage: merchant-node.mjs <home> [port]");
const { server, endpoint } = await startMerchantServer(home, { port: Number(rawPort) });
process.stdout.write(`${JSON.stringify({ ready: true, endpoint })}\n`);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
