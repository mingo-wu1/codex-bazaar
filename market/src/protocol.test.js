import test from "node:test";
import assert from "node:assert/strict";
import {
  VerifiedIndexer,
  createAttestation,
  createSignedEvent,
  generateIdentity,
  hashContent,
  verifyAttestation,
  verifyFeed,
  verifySignedEvent,
} from "./protocol.js";

function listing(identity, previousEvent = null, priceMinor = 19900) {
  return createSignedEvent({
    identity,
    previousEvent,
    type: previousEvent ? "LISTING_UPDATED" : "LISTING_CREATED",
    listingId: "toothbrush-001",
    timestamp: "2026-07-19T00:00:00.000Z",
    payload: {
      name: "Sonic electric toothbrush",
      category: "personal-care",
      priceMinor,
      currency: "CNY",
      endpoint: "http://merchant.invalid",
      contentHash: hashContent({ description: "USB-C charging" }),
    },
  });
}

function pass(providerIdentity, event, result = "PASS") {
  return createAttestation({
    providerIdentity,
    event,
    jurisdiction: "AU",
    result,
    ruleBundleHash: hashContent({ version: "2026-07-19" }),
    expiresAt: "2099-01-01T00:00:00.000Z",
    timestamp: "2026-07-19T00:02:00.000Z",
  });
}

test("merchant updates form a verifiable signed hash chain", () => {
  const merchant = generateIdentity("merchant");
  const first = listing(merchant);
  const update = listing(merchant, first, 16900);
  assert.equal(verifyFeed([first, update]).ok, true);
  assert.equal(update.previous, first.eventHash);
  assert.equal(update.sequence, 2);
});

test("tampering and malformed public keys fail without crashing", () => {
  const event = listing(generateIdentity("merchant"));
  assert.equal(verifySignedEvent({ ...event, payload: { ...event.payload, priceMinor: 1 } }).ok, false);
  assert.equal(verifySignedEvent({ ...event, merchantPublicKey: "not-a-key" }).ok, false);
});

test("an attestation is bound to the exact listing event and content", () => {
  const event = listing(generateIdentity("merchant"));
  const attestation = pass(generateIdentity("provider"), event);
  assert.equal(verifyAttestation(attestation, event, new Date("2026-07-20")).ok, true);
  assert.equal(verifyAttestation({ ...attestation, contentHash: "0".repeat(64) }, event).ok, false);
  assert.equal(verifyAttestation({ ...attestation, providerPublicKey: "not-a-key" }, event).ok, false);
});

test("the index admits only trusted PASS listings and trusted BLOCK wins", () => {
  const event = listing(generateIdentity("merchant"));
  const provider = generateIdentity("provider");
  const index = new VerifiedIndexer({ trustedProviderIds: [provider.id], jurisdiction: "AU" });
  index.ingestFeed([event]);
  assert.equal(index.search("toothbrush").length, 0);
  index.ingestAttestation(pass(provider, event));
  assert.equal(index.search("toothbrush").length, 1);
  index.ingestAttestation(pass(provider, event, "BLOCK"));
  assert.equal(index.search("toothbrush").length, 0);
});
