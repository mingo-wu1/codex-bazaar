import { hashContent, VerifiedIndexer } from "./protocol.js";

async function getJson(url) {
  const response = await fetch(url);
  const value = await response.json();
  if (!response.ok) throw new Error(value?.error || `request failed: ${response.status}`);
  return value;
}

export async function discoverAndFetch({
  endpoint,
  attestation,
  trustedProviderIds,
  jurisdiction,
  query,
}) {
  const feed = await getJson(`${endpoint}/feed`);
  const indexer = new VerifiedIndexer({ trustedProviderIds, jurisdiction });
  indexer.ingestFeed(feed.events);
  indexer.ingestAttestation(attestation);
  const matches = indexer.search(query);
  if (!matches.length) return { matches: [], content: null };
  const selected = matches[0].event;
  const payload = await getJson(`${endpoint}/content/${selected.payload.contentHash}`);
  const computedHash = hashContent(payload.content);
  if (computedHash !== selected.payload.contentHash || payload.contentHash !== selected.payload.contentHash) {
    throw new Error("merchant content hash verification failed");
  }
  return {
    matches: matches.map(({ event, admission }) => ({
      listingId: event.listingId,
      name: event.payload.name,
      priceMinor: event.payload.priceMinor,
      currency: event.payload.currency,
      merchantId: event.merchantId,
      eventHash: event.eventHash,
      passCount: admission.passCount,
    })),
    content: payload.content,
    contentVerified: true,
  };
}
