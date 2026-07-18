import { createServer } from "node:http";

function send(response, value, status = 200) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function startProtocolIndex({ host = "127.0.0.1", port = 0 } = {}) {
  const feeds = new Map();
  const attestations = new Map();
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || host}`);
      if (request.method === "GET" && url.pathname === "/api/health") return send(response, { ok: true });
      if (request.method === "POST" && url.pathname === "/api/protocol/feeds") {
        const { events } = await readJson(request);
        if (!Array.isArray(events) || !events.length) throw new Error("events required");
        const existing = feeds.get(events[0].merchantId) || [];
        if (events.length < existing.length) throw new Error("feed rollback is not allowed");
        if (existing.some((event, index) => events[index]?.eventHash !== event.eventHash)) throw new Error("feed prefix changed");
        feeds.set(events[0].merchantId, events);
        return send(response, { accepted: events.length, merchantId: events[0].merchantId }, 201);
      }
      if (request.method === "POST" && url.pathname === "/api/protocol/attestations") {
        const value = await readJson(request);
        attestations.set(value.attestationHash, value);
        return send(response, { accepted: true, attestationHash: value.attestationHash }, 201);
      }
      if (request.method === "GET" && url.pathname === "/api/protocol/events") {
        const hash = url.searchParams.get("hash");
        const event = Array.from(feeds.values()).flat().find((item) => item.eventHash === hash);
        return event ? send(response, { event }) : send(response, { error: "event not found" }, 404);
      }
      if (request.method === "GET" && url.pathname === "/api/protocol/search") {
        const query = (url.searchParams.get("q") || "").toLocaleLowerCase();
        const selected = Array.from(feeds.values()).filter((feed) =>
          feed.some((event) => `${event.payload?.name || ""} ${event.payload?.category || ""}`.toLocaleLowerCase().includes(query))
        );
        const hashes = new Set(selected.flat().map((event) => event.eventHash));
        return send(response, { feeds: selected, attestations: Array.from(attestations.values()).filter((a) => hashes.has(a.listingEventHash)) });
      }
      return send(response, { error: "not found" }, 404);
    } catch (error) {
      return send(response, { error: error.message }, 400);
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  return { server, endpoint: `http://${host}:${server.address().port}` };
}
