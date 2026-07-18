import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { attestListing, initPeerHome, publishListing } from "../src/peer-store.js";
import { hashContent } from "../src/protocol.js";

const root = mkdtempSync(join(tmpdir(), "codex-market-two-peer-"));
const merchantHome = join(root, "codex-a-merchant");
const buyerHome = join(root, "codex-b-buyer");
const providerHome = join(root, "neutral-attestor");
const attestationFile = join(root, "attestation.json");
const scriptDir = dirname(fileURLToPath(import.meta.url));
let merchantProcess;

function waitForLine(child) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const newline = buffer.indexOf("\n");
      if (newline >= 0) resolve(buffer.slice(0, newline));
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code && !buffer.includes("\n")) reject(new Error(`child exited with ${code}`));
    });
  });
}

try {
  const merchant = initPeerHome(merchantHome, "Codex A merchant: Hancock");
  const provider = initPeerHome(providerHome, "Neutral compliance provider");

  merchantProcess = spawn(process.execPath, [join(scriptDir, "merchant-node.mjs"), merchantHome, "0"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const ready = JSON.parse(await waitForLine(merchantProcess));

  const first = publishListing(merchantHome, {
    listingId: "toothbrush-001",
    name: "Sonic electric toothbrush",
    category: "personal-care",
    priceMinor: 19900,
    currency: "CNY",
    endpoint: ready.endpoint,
    details: { description: "Soft brush and USB-C charging", images: ["served-by-merchant"] },
    timestamp: "2026-07-19T00:00:00.000Z",
  });
  const latest = publishListing(merchantHome, {
    listingId: "toothbrush-001",
    name: "Sonic electric toothbrush",
    category: "personal-care",
    priceMinor: 16900,
    currency: "CNY",
    endpoint: ready.endpoint,
    details: { description: "Soft brush and USB-C charging", images: ["served-by-merchant"] },
    timestamp: "2026-07-19T00:01:00.000Z",
  });
  const attestation = attestListing(providerHome, latest, {
    jurisdiction: "AU",
    result: "PASS",
    ruleBundleHash: hashContent({ jurisdiction: "AU", version: "2026-07-19", sources: ["official-law-source"] }),
    evidenceUrls: ["https://example.invalid/official-law-source"],
    expiresAt: "2099-01-01T00:00:00.000Z",
  });
  writeFileSync(attestationFile, JSON.stringify(attestation, null, 2), "utf8");

  const buyerProcess = spawn(
    process.execPath,
    [join(scriptDir, "buyer-node.mjs"), buyerHome, ready.endpoint, attestationFile, provider.id, "toothbrush"],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  const buyerResult = JSON.parse(await waitForLine(buyerProcess));
  const buyerExit = await new Promise((resolve) => buyerProcess.once("exit", resolve));
  if (buyerExit !== 0) throw new Error(`buyer process exited with ${buyerExit}`);
  if (!buyerResult.contentVerified || buyerResult.matches.length !== 1) throw new Error("two-peer verification failed");

  console.log("Codex A（商家）：已签名发布商品，随后把价格从 199.00 CNY 更新为 169.00 CNY。");
  console.log(`合规服务商：已对最新事件 ${latest.eventHash.slice(0, 16)}… 签署 PASS 证明。`);
  console.log(`Codex B（买家）：从 ${ready.endpoint} 找到 ${buyerResult.matches[0].name}。`);
  console.log("Codex B（买家）：商家签名、事件哈希链、合规证明和详情哈希全部验证成功。");
  console.log(JSON.stringify({
    ok: true,
    isolatedHomes: 3,
    merchantId: merchant.id,
    buyerId: buyerResult.buyerId,
    providerId: provider.id,
    firstEvent: first.eventHash,
    latestEvent: latest.eventHash,
    priceMinor: buyerResult.matches[0].priceMinor,
    merchantStoredDetails: true,
    indexStoredDetails: false,
  }, null, 2));
} finally {
  if (merchantProcess && !merchantProcess.killed) merchantProcess.kill("SIGTERM");
  rmSync(root, { recursive: true, force: true });
}
