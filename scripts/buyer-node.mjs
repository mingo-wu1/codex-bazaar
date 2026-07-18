import { readFileSync } from "node:fs";
import { discoverAndFetch } from "../src/buyer-peer.js";
import { initPeerHome } from "../src/peer-store.js";

const [home, endpoint, attestationFile, providerId, query = "toothbrush"] = process.argv.slice(2);
if (!home || !endpoint || !attestationFile || !providerId) {
  throw new Error("usage: buyer-node.mjs <home> <endpoint> <attestation-file> <provider-id> [query]");
}
const identity = initPeerHome(home, "Codex B buyer");
const attestation = JSON.parse(readFileSync(attestationFile, "utf8"));
const result = await discoverAndFetch({
  endpoint,
  attestation,
  trustedProviderIds: [providerId],
  jurisdiction: "AU",
  query,
});
process.stdout.write(`${JSON.stringify({ buyerId: identity.id, ...result })}\n`);
