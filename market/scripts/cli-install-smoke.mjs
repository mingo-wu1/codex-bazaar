import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repo = dirname(scriptDir);
const root = mkdtempSync(join(tmpdir(), "market-cli-two-computers-"));
const merchantHome = join(root, "computer-a", "market-home");
const providerHome = join(root, "provider", "market-home");
const buyerHome = join(root, "computer-b", "market-home");
const image = join(repo, "test-assets", "electric-toothbrush.png");
let boardProcess;
let merchantProcess;

function line(child) {
  return new Promise((resolve, reject) => {
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      const newline = output.indexOf("\n");
      if (newline >= 0) resolve(output.slice(0, newline));
    });
    child.once("error", reject);
  });
}

async function run(args) {
  const child = spawn(process.execPath, [join(scriptDir, "marketpeer.mjs"), ...args], { stdio: ["ignore", "pipe", "inherit"] });
  let output = "";
  for await (const chunk of child.stdout) output += chunk;
  const code = await new Promise((resolve) => child.once("exit", resolve));
  if (code !== 0) throw new Error(`marketpeer ${args[0]} exited with ${code}`);
  return JSON.parse(output);
}

try {
  let board = process.env.MARKET_TEST_BOARD;
  if (!board) {
    boardProcess = spawn(process.execPath, [join(scriptDir, "protocol-index-node.mjs"), "127.0.0.1", "0"], { stdio: ["ignore", "pipe", "inherit"] });
    board = JSON.parse(await line(boardProcess)).endpoint;
  }
  await run(["init", merchantHome, "Hancock"]);
  merchantProcess = spawn(process.execPath, [join(scriptDir, "marketpeer.mjs"), "serve", merchantHome, "127.0.0.1", "0"], { stdio: ["ignore", "pipe", "inherit"] });
  const merchantEndpoint = JSON.parse(await line(merchantProcess)).endpoint;
  const published = await run(["publish", merchantHome, board, merchantEndpoint, "Sonic toothbrush", "16900", image, "USB-C toothbrush from Computer A"]);
  const attested = await run(["attest", providerHome, board, published.eventHash, "AU"]);
  const found = await run(["search", buyerHome, board, attested.providerId, "AU", "toothbrush", join(buyerHome, "downloads")]);
  if (found.results.length !== 1 || !found.results[0].images[0].verified) throw new Error("CLI end-to-end result is invalid");
  console.log(JSON.stringify({
    ok: true,
    freshComputerHomes: 2,
    boardRuntime: process.env.MARKET_TEST_BOARD ? "cloudflare-worker" : "reference-node",
    commandsTested: ["init", "serve", "publish", "attest", "search"],
    item: found.results[0].event.payload.name,
    priceMinor: found.results[0].event.payload.priceMinor,
    imageVerified: found.results[0].images[0].verified,
    contact: found.results[0].details.merchantContact,
  }, null, 2));
} finally {
  for (const child of [merchantProcess, boardProcess]) if (child && !child.killed) child.kill("SIGTERM");
  rmSync(root, { recursive: true, force: true });
}
