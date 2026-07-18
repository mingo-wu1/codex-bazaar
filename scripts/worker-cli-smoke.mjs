import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repo = dirname(scriptDir);
const workerNode = process.env.WORKER_NODE || process.execPath;
let worker;

async function waitForHealth(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Cloudflare Worker local runtime did not become ready");
}

try {
  worker = spawn(workerNode, [join(repo, "node_modules", "wrangler", "bin", "wrangler.js"), "dev", "--port", "8795", "--var", "ADMIN_TOKEN:local-test-admin", "--var", "ALLOW_MOCK_PAYMENTS:true"], {
    cwd: repo,
    stdio: ["ignore", "ignore", "inherit"],
  });
  await waitForHealth("http://127.0.0.1:8795/api/health");
  const cli = spawn(process.execPath, [join(scriptDir, "cli-install-smoke.mjs")], {
    cwd: repo,
    env: { ...process.env, MARKET_TEST_BOARD: "http://127.0.0.1:8795" },
    stdio: ["ignore", "pipe", "inherit"],
  });
  let output = "";
  for await (const chunk of cli.stdout) output += chunk;
  const code = await new Promise((resolve) => cli.once("exit", resolve));
  if (code !== 0) throw new Error(`Worker-backed CLI test exited with ${code}`);
  process.stdout.write(output);
} finally {
  if (worker && !worker.killed) worker.kill("SIGTERM");
}
