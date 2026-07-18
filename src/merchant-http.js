import { createServer } from "node:http";
import { loadFeed, readContent } from "./peer-store.js";

function sendJson(response, value, status = 200) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

export async function startMerchantServer(home, { host = "127.0.0.1", port = 0 } = {}) {
  const server = createServer((request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || host}`);
    if (request.method === "GET" && url.pathname === "/health") return sendJson(response, { ok: true });
    if (request.method === "GET" && url.pathname === "/feed") return sendJson(response, { events: loadFeed(home) });
    const contentMatch = url.pathname.match(/^\/content\/([a-f0-9]{64})$/);
    if (request.method === "GET" && contentMatch) {
      const content = readContent(home, contentMatch[1]);
      if (content == null) return sendJson(response, { error: "content not found" }, 404);
      return sendJson(response, { content, contentHash: contentMatch[1] });
    }
    return sendJson(response, { error: "not found" }, 404);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  return { server, endpoint: `http://${host}:${address.port}` };
}
