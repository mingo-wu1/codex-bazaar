import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";

export const PROTOCOL_VERSION = "cmp/0.2";

const EVENT_TYPES = new Set([
  "MERCHANT_CREATED",
  "LISTING_CREATED",
  "LISTING_UPDATED",
  "LISTING_REVOKED",
  "ORDER_PAID",
  "ORDER_COMPLETED",
  "ORDER_REFUNDED",
  "ORDER_DISPUTED",
]);

const ATTESTATION_RESULTS = new Set([
  "PASS",
  "REQUIRES_CONDITION",
  "INSUFFICIENT_DATA",
  "BLOCK",
  "TECHNICAL_RISK",
]);

function normalized(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical JSON does not support non-finite numbers");
    return value;
  }
  if (Array.isArray(value)) return value.map(normalized);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, normalized(value[key])]),
    );
  }
  throw new Error(`unsupported canonical JSON value: ${typeof value}`);
}

export function canonicalJson(value) {
  return JSON.stringify(normalized(value));
}

export function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashContent(value) {
  return sha256Hex(canonicalJson(value));
}

export function publicKeyId(publicKeyPem) {
  const der = createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
  return sha256Hex(der);
}

export function generateIdentity(label = "") {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" });
  return {
    id: publicKeyId(publicKeyPem),
    label,
    publicKeyPem,
    privateKeyPem,
  };
}

function signatureForHash(hash, privateKeyPem) {
  return sign(null, Buffer.from(hash, "hex"), createPrivateKey(privateKeyPem)).toString("base64url");
}

function validSignature(hash, signature, publicKeyPem) {
  try {
    return verify(null, Buffer.from(hash, "hex"), createPublicKey(publicKeyPem), Buffer.from(signature, "base64url"));
  } catch {
    return false;
  }
}

export function createSignedEvent({
  identity,
  previousEvent = null,
  type,
  listingId,
  payload = {},
  timestamp = new Date().toISOString(),
}) {
  if (!identity?.privateKeyPem || !identity?.publicKeyPem) throw new Error("merchant identity is required");
  if (!EVENT_TYPES.has(type)) throw new Error(`unsupported event type: ${type}`);
  if (!listingId) throw new Error("listingId is required");
  if (previousEvent && previousEvent.merchantId !== identity.id) throw new Error("previous event belongs to another merchant");
  const body = {
    protocol: PROTOCOL_VERSION,
    merchantId: identity.id,
    merchantPublicKey: identity.publicKeyPem,
    sequence: previousEvent ? previousEvent.sequence + 1 : 1,
    previous: previousEvent?.eventHash || null,
    type,
    listingId,
    timestamp,
    payload: normalized(payload),
  };
  const eventHash = sha256Hex(canonicalJson(body));
  return { ...body, eventHash, signature: signatureForHash(eventHash, identity.privateKeyPem) };
}

export function verifySignedEvent(event, previousEvent = null) {
  const errors = [];
  if (event?.protocol !== PROTOCOL_VERSION) errors.push("unsupported protocol version");
  if (!EVENT_TYPES.has(event?.type)) errors.push("unsupported event type");
  try {
    if (!event?.merchantPublicKey || publicKeyId(event.merchantPublicKey) !== event?.merchantId) errors.push("merchant public key mismatch");
  } catch {
    errors.push("merchant public key is invalid");
  }
  if (previousEvent) {
    if (event.sequence !== previousEvent.sequence + 1) errors.push("event sequence is not continuous");
    if (event.previous !== previousEvent.eventHash) errors.push("previous event hash mismatch");
    if (event.merchantId !== previousEvent.merchantId) errors.push("merchant feed changed identity");
  } else {
    if (event?.sequence !== 1) errors.push("first event must have sequence 1");
    if (event?.previous !== null) errors.push("first event must not reference a previous event");
  }
  const body = {
    protocol: event?.protocol,
    merchantId: event?.merchantId,
    merchantPublicKey: event?.merchantPublicKey,
    sequence: event?.sequence,
    previous: event?.previous,
    type: event?.type,
    listingId: event?.listingId,
    timestamp: event?.timestamp,
    payload: event?.payload,
  };
  let computedHash = "";
  try {
    computedHash = sha256Hex(canonicalJson(body));
  } catch (error) {
    errors.push(error.message);
  }
  if (computedHash !== event?.eventHash) errors.push("event hash mismatch");
  if (!validSignature(event?.eventHash || "", event?.signature || "", event?.merchantPublicKey || "")) {
    errors.push("merchant signature is invalid");
  }
  return { ok: errors.length === 0, errors, computedHash };
}

export function verifyFeed(events) {
  const errors = [];
  let previous = null;
  for (let index = 0; index < events.length; index += 1) {
    const result = verifySignedEvent(events[index], previous);
    if (!result.ok) errors.push({ index, errors: result.errors });
    previous = events[index];
  }
  return { ok: errors.length === 0, errors };
}

export function createAttestation({
  providerIdentity,
  event,
  jurisdiction,
  result,
  ruleBundleHash,
  evidenceUrls = [],
  conditions = [],
  expiresAt,
  timestamp = new Date().toISOString(),
}) {
  if (!providerIdentity?.privateKeyPem) throw new Error("provider identity is required");
  if (!ATTESTATION_RESULTS.has(result)) throw new Error(`unsupported attestation result: ${result}`);
  if (!event?.eventHash || !event?.signature) throw new Error("cannot attest an unsigned event");
  const body = {
    protocol: PROTOCOL_VERSION,
    providerId: providerIdentity.id,
    providerPublicKey: providerIdentity.publicKeyPem,
    listingEventHash: event.eventHash,
    contentHash: event.payload?.contentHash || null,
    listingId: event.listingId,
    merchantId: event.merchantId,
    jurisdiction,
    result,
    ruleBundleHash,
    evidenceUrls: [...evidenceUrls],
    conditions: [...conditions],
    timestamp,
    expiresAt,
  };
  const attestationHash = sha256Hex(canonicalJson(body));
  return {
    ...body,
    attestationHash,
    signature: signatureForHash(attestationHash, providerIdentity.privateKeyPem),
  };
}

export function verifyAttestation(attestation, event, now = new Date()) {
  const errors = [];
  if (attestation?.protocol !== PROTOCOL_VERSION) errors.push("unsupported protocol version");
  if (!ATTESTATION_RESULTS.has(attestation?.result)) errors.push("unsupported attestation result");
  try {
    if (publicKeyId(attestation?.providerPublicKey || "") !== attestation?.providerId) errors.push("provider public key mismatch");
  } catch {
    errors.push("provider public key is invalid");
  }
  if (attestation?.listingEventHash !== event?.eventHash) errors.push("attestation references another event");
  if (attestation?.contentHash !== (event?.payload?.contentHash || null)) errors.push("attested content hash mismatch");
  if (attestation?.listingId !== event?.listingId || attestation?.merchantId !== event?.merchantId) errors.push("attested listing identity mismatch");
  if (!attestation?.expiresAt || new Date(attestation.expiresAt) <= now) errors.push("attestation is expired");
  const body = {
    protocol: attestation?.protocol,
    providerId: attestation?.providerId,
    providerPublicKey: attestation?.providerPublicKey,
    listingEventHash: attestation?.listingEventHash,
    contentHash: attestation?.contentHash,
    listingId: attestation?.listingId,
    merchantId: attestation?.merchantId,
    jurisdiction: attestation?.jurisdiction,
    result: attestation?.result,
    ruleBundleHash: attestation?.ruleBundleHash,
    evidenceUrls: attestation?.evidenceUrls,
    conditions: attestation?.conditions,
    timestamp: attestation?.timestamp,
    expiresAt: attestation?.expiresAt,
  };
  const computedHash = sha256Hex(canonicalJson(body));
  if (computedHash !== attestation?.attestationHash) errors.push("attestation hash mismatch");
  if (!validSignature(attestation?.attestationHash || "", attestation?.signature || "", attestation?.providerPublicKey || "")) {
    errors.push("provider signature is invalid");
  }
  return { ok: errors.length === 0, errors, computedHash };
}

export class VerifiedIndexer {
  constructor({ trustedProviderIds = [], minimumPassAttestations = 1, jurisdiction = null } = {}) {
    this.trustedProviderIds = new Set(trustedProviderIds);
    this.minimumPassAttestations = minimumPassAttestations;
    this.jurisdiction = jurisdiction;
    this.events = new Map();
    this.latestListings = new Map();
    this.attestations = new Map();
  }

  ingestFeed(events) {
    const verification = verifyFeed(events);
    if (!verification.ok) throw new Error(`invalid merchant feed: ${JSON.stringify(verification.errors)}`);
    for (const event of events) {
      this.events.set(event.eventHash, event);
      this.latestListings.set(`${event.merchantId}:${event.listingId}`, event);
    }
    return events.length;
  }

  ingestAttestation(attestation, now = new Date()) {
    const event = this.events.get(attestation.listingEventHash);
    if (!event) throw new Error("attested event is not indexed");
    const result = verifyAttestation(attestation, event, now);
    if (!result.ok) throw new Error(`invalid attestation: ${result.errors.join(", ")}`);
    const values = this.attestations.get(event.eventHash) || [];
    values.push(attestation);
    this.attestations.set(event.eventHash, values);
    return result;
  }

  admission(event, now = new Date()) {
    const values = (this.attestations.get(event.eventHash) || []).filter(
      (attestation) =>
        this.trustedProviderIds.has(attestation.providerId) &&
        (!this.jurisdiction || attestation.jurisdiction === this.jurisdiction) &&
        verifyAttestation(attestation, event, now).ok,
    );
    const passProviders = new Set(values.filter((value) => value.result === "PASS").map((value) => value.providerId));
    const blocked = values.some((value) => ["BLOCK", "TECHNICAL_RISK"].includes(value.result));
    return {
      admitted: !blocked && passProviders.size >= this.minimumPassAttestations,
      blocked,
      passCount: passProviders.size,
      attestations: values,
    };
  }

  search(text = "", now = new Date()) {
    const query = text.trim().toLocaleLowerCase();
    return Array.from(this.latestListings.values())
      .filter((event) => event.type !== "LISTING_REVOKED")
      .filter((event) => this.admission(event, now).admitted)
      .filter((event) => !query || `${event.payload?.name || ""} ${event.payload?.category || ""}`.toLocaleLowerCase().includes(query))
      .map((event) => ({ event, admission: this.admission(event, now) }));
  }
}
