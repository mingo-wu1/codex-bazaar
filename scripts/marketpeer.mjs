import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startMerchantServer } from "../src/merchant-http.js";
import { attestListing, initPeerHome, loadFeed, publishListing, storeAsset } from "../src/peer-store.js";
import { getBoardEvent, publishAttestation, publishFeed, searchBoard } from "../src/protocol-board.js";
import { hashContent } from "../src/protocol.js";

const [command, ...args] = process.argv.slice(2);

function required(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

if (command === "init") {
  const identity = initPeerHome(resolve(required(args[0], "home")), args.slice(1).join(" ") || "Market peer");
  console.log(JSON.stringify({ ok: true, id: identity.id, label: identity.label }));
} else if (command === "serve") {
  const [home, host = "0.0.0.0", rawPort = "8793"] = args;
  const { server, endpoint } = await startMerchantServer(resolve(required(home, "home")), { host, port: Number(rawPort) });
  console.log(JSON.stringify({ ready: true, endpoint }));
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
} else if (command === "publish") {
  const [home, board, publicEndpoint, name, rawPrice, imagePath, description = name] = args;
  const peerHome = resolve(required(home, "home"));
  const identity = initPeerHome(peerHome, "Merchant");
  const imageBytes = readFileSync(resolve(required(imagePath, "imagePath")));
  const imageHash = storeAsset(peerHome, imageBytes);
  const event = publishListing(peerHome, {
    listingId: `listing-${Date.now()}`,
    name: required(name, "name"),
    category: "general-goods",
    priceMinor: Number(required(rawPrice, "priceMinor")),
    currency: "CNY",
    endpoint: required(publicEndpoint, "publicEndpoint").replace(/\/$/, ""),
    details: { description, merchantContact: `codexping:${identity.label}`, images: [{ hash: imageHash, extension: "png" }] },
  });
  await publishFeed(required(board, "board"), loadFeed(peerHome));
  console.log(JSON.stringify({ ok: true, eventHash: event.eventHash, merchantId: identity.id, imageHash }));
} else if (command === "attest") {
  const [home, board, eventHash, jurisdiction = "AU"] = args;
  const peerHome = resolve(required(home, "home"));
  const provider = initPeerHome(peerHome, "Compliance provider");
  const event = await getBoardEvent(required(board, "board"), required(eventHash, "eventHash"));
  const attestation = attestListing(peerHome, event, {
    jurisdiction,
    result: "PASS",
    ruleBundleHash: hashContent({ jurisdiction, mode: "manual-test-review" }),
    expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
  });
  await publishAttestation(board, attestation);
  console.log(JSON.stringify({ ok: true, providerId: provider.id, attestationHash: attestation.attestationHash }));
} else if (command === "search") {
  const [home, board, providerId, jurisdiction = "AU", query = "", downloadDir = resolve(home, "downloads")] = args;
  const identity = initPeerHome(resolve(required(home, "home")), "Buyer");
  const results = await searchBoard({ board: required(board, "board"), query, trustedProviderIds: [required(providerId, "providerId")], jurisdiction, downloadDir });
  console.log(JSON.stringify({ ok: true, buyerId: identity.id, results }, null, 2));
} else {
  throw new Error("commands: init | serve | publish | attest | search");
}
