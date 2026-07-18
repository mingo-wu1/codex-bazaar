import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  createAttestation,
  createSignedEvent,
  generateIdentity,
  hashContent,
} from "./protocol.js";

const jsonRead = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback);
const jsonWrite = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2), "utf8");

export function initPeerHome(home, label) {
  mkdirSync(home, { recursive: true });
  mkdirSync(join(home, "content"), { recursive: true });
  const identityPath = join(home, "identity.json");
  if (!existsSync(identityPath)) jsonWrite(identityPath, generateIdentity(label));
  if (!existsSync(join(home, "feed.json"))) jsonWrite(join(home, "feed.json"), []);
  return loadIdentity(home);
}

export function loadIdentity(home) {
  return jsonRead(join(home, "identity.json"), null);
}

export function loadFeed(home) {
  return jsonRead(join(home, "feed.json"), []);
}

export function publishListing(home, {
  listingId,
  name,
  category,
  priceMinor,
  currency,
  endpoint,
  details,
  timestamp,
}) {
  const identity = loadIdentity(home);
  if (!identity) throw new Error("peer is not initialized");
  const feed = loadFeed(home);
  const previousEvent = feed.at(-1) || null;
  const existing = feed.some((event) => event.listingId === listingId && event.type !== "LISTING_REVOKED");
  const contentHash = hashContent(details);
  jsonWrite(join(home, "content", `${contentHash}.json`), details);
  const event = createSignedEvent({
    identity,
    previousEvent,
    type: existing ? "LISTING_UPDATED" : "LISTING_CREATED",
    listingId,
    timestamp,
    payload: {
      name,
      category,
      priceMinor,
      currency,
      endpoint,
      contentHash,
    },
  });
  feed.push(event);
  jsonWrite(join(home, "feed.json"), feed);
  return event;
}

export function revokeListing(home, listingId, reason = "merchant-revoked") {
  const identity = loadIdentity(home);
  const feed = loadFeed(home);
  const event = createSignedEvent({
    identity,
    previousEvent: feed.at(-1) || null,
    type: "LISTING_REVOKED",
    listingId,
    payload: { reason },
  });
  feed.push(event);
  jsonWrite(join(home, "feed.json"), feed);
  return event;
}

export function readContent(home, contentHash) {
  return jsonRead(join(home, "content", `${contentHash}.json`), null);
}

export function attestListing(providerHome, event, {
  jurisdiction,
  result = "PASS",
  ruleBundleHash,
  evidenceUrls = [],
  conditions = [],
  expiresAt,
}) {
  const providerIdentity = loadIdentity(providerHome);
  if (!providerIdentity) throw new Error("provider peer is not initialized");
  return createAttestation({
    providerIdentity,
    event,
    jurisdiction,
    result,
    ruleBundleHash,
    evidenceUrls,
    conditions,
    expiresAt,
  });
}
