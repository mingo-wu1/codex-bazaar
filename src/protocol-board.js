import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { VerifiedIndexer, hashContent, sha256Hex } from "./protocol.js";

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || `request failed: ${response.status}`);
  return value;
}

export function publishFeed(board, events) {
  return jsonRequest(`${board.replace(/\/$/, "")}/api/protocol/feeds`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ events }),
  });
}

export function publishAttestation(board, attestation) {
  return jsonRequest(`${board.replace(/\/$/, "")}/api/protocol/attestations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(attestation),
  });
}

export async function getBoardEvent(board, eventHash) {
  return (await jsonRequest(`${board.replace(/\/$/, "")}/api/protocol/events?hash=${encodeURIComponent(eventHash)}`)).event;
}

export async function searchBoard({ board, query, trustedProviderIds, jurisdiction, downloadDir }) {
  const data = await jsonRequest(`${board.replace(/\/$/, "")}/api/protocol/search?q=${encodeURIComponent(query)}`);
  const index = new VerifiedIndexer({ trustedProviderIds, jurisdiction });
  for (const feed of data.feeds) index.ingestFeed(feed);
  for (const attestation of data.attestations) {
    if (index.events.has(attestation.listingEventHash)) index.ingestAttestation(attestation);
  }
  const matches = index.search(query);
  const results = [];
  if (downloadDir) mkdirSync(downloadDir, { recursive: true });
  for (const { event, admission } of matches) {
    const endpoint = event.payload.endpoint.replace(/\/$/, "");
    const details = await jsonRequest(`${endpoint}/content/${event.payload.contentHash}`);
    if (details.contentHash !== event.payload.contentHash) throw new Error("detail reference hash mismatch");
    const detailBytes = JSON.stringify(details.content);
    if (hashContent(details.content) !== event.payload.contentHash) throw new Error("detail content hash mismatch");
    const images = [];
    for (const image of details.content.images || []) {
      const response = await fetch(`${endpoint}/asset/${image.hash}`);
      if (!response.ok) throw new Error(`image download failed: ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (sha256Hex(bytes) !== image.hash) throw new Error("image hash mismatch");
      const path = downloadDir ? join(downloadDir, `${image.hash}.${image.extension || "bin"}`) : null;
      if (path) writeFileSync(path, bytes);
      images.push({ ...image, bytes: bytes.length, verified: true, path });
    }
    results.push({ event, details: details.content, images, passCount: admission.passCount, detailBytes: detailBytes.length });
  }
  return results;
}
