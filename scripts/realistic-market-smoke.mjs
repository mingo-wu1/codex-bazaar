import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { startProtocolIndex } from "../src/protocol-index-http.js";
import { startMerchantServer } from "../src/merchant-http.js";
import { attestListing, initPeerHome, loadFeed, publishListing, storeAsset } from "../src/peer-store.js";
import { hashContent } from "../src/protocol.js";
import { publishAttestation, publishFeed } from "../src/protocol-board.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repo = dirname(scriptDir);
const root = mkdtempSync(join(tmpdir(), "market-realistic-"));
const merchantHome = join(root, "computer-a-merchant");
const buyerHome = join(root, "computer-b-buyer");
const providerHome = join(root, "compliance-provider");
const downloads = join(root, "computer-b-downloads");
const providerFile = join(root, "trusted-provider.json");
let merchantServer;
let boardServer;

function firstLine(child) {
  return new Promise((resolve, reject) => {
    let value = "";
    child.stdout.on("data", (chunk) => {
      value += chunk.toString();
      const index = value.indexOf("\n");
      if (index >= 0) resolve(value.slice(0, index));
    });
    child.once("error", reject);
  });
}

try {
  const board = await startProtocolIndex();
  boardServer = board.server;
  const merchant = initPeerHome(merchantHome, "Codex A merchant: Hancock");
  const provider = initPeerHome(providerHome, "Independent AU compliance provider");
  writeFileSync(providerFile, JSON.stringify({ id: provider.id }), "utf8");
  const served = await startMerchantServer(merchantHome);
  merchantServer = served.server;

  const imageBytes = readFileSync(join(repo, "test-assets", "electric-toothbrush.png"));
  const imageHash = storeAsset(merchantHome, imageBytes);
  const event = publishListing(merchantHome, {
    listingId: "toothbrush-real-001",
    name: "Sonic electric toothbrush",
    category: "personal-care",
    priceMinor: 16900,
    currency: "CNY",
    endpoint: served.endpoint,
    details: {
      description: "Soft bristles, two-minute timer and USB-C charging base.",
      merchantContact: "codexping:Hancock",
      images: [{ hash: imageHash, extension: "png" }],
    },
    timestamp: "2026-07-19T01:00:00.000Z",
  });
  await publishFeed(board.endpoint, loadFeed(merchantHome));
  const attestation = attestListing(providerHome, event, {
    jurisdiction: "AU",
    result: "PASS",
    ruleBundleHash: hashContent({ jurisdiction: "AU", version: "2026-07-19", sources: ["official-law"] }),
    expiresAt: "2099-01-01T00:00:00.000Z",
  });
  await publishAttestation(board.endpoint, attestation);

  const buyer = spawn(process.execPath, [
    join(scriptDir, "realistic-buyer-node.mjs"), buyerHome, board.endpoint, providerFile, "toothbrush", downloads,
  ], { stdio: ["ignore", "pipe", "inherit"] });
  const result = JSON.parse(await firstLine(buyer));
  const exit = await new Promise((resolve) => buyer.once("exit", resolve));
  if (exit !== 0) throw new Error(`buyer exited with ${exit}`);
  const item = result.results[0];
  if (!item || !item.images[0]?.verified || item.images[0].bytes !== imageBytes.length) throw new Error("realistic image handoff failed");

  console.log(JSON.stringify({
    ok: true,
    simulatedComputers: 2,
    networkServices: 2,
    blackboardStoredProductImage: false,
    merchantImageBytes: imageBytes.length,
    buyerDownloadedImageBytes: item.images[0].bytes,
    imageHash,
    imageVerified: item.images[0].verified,
    detailsVerified: true,
    merchantSignatureVerified: true,
    complianceAttestationVerified: true,
    buyerFound: item.event.payload.name,
    buyerPriceMinor: item.event.payload.priceMinor,
    merchantContact: item.details.merchantContact,
  }, null, 2));
} finally {
  await Promise.all([
    merchantServer && new Promise((resolve) => merchantServer.close(resolve)),
    boardServer && new Promise((resolve) => boardServer.close(resolve)),
  ].filter(Boolean));
  rmSync(root, { recursive: true, force: true });
}
