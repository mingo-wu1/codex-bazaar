import { readFileSync } from "node:fs";
import { searchBoard } from "../src/protocol-board.js";
import { initPeerHome } from "../src/peer-store.js";

const [home, board, providerFile, query, downloadDir] = process.argv.slice(2);
const provider = JSON.parse(readFileSync(providerFile, "utf8"));
const buyer = initPeerHome(home, "Codex B buyer: Luffy");
const results = await searchBoard({
  board,
  query,
  trustedProviderIds: [provider.id],
  jurisdiction: "AU",
  downloadDir,
});
process.stdout.write(`${JSON.stringify({ buyerId: buyer.id, results })}\n`);
