import { writeFile } from "node:fs/promises";
import { loadEnv } from "../src/env.js";
import { WowauditClient } from "../src/wowaudit.js";

await loadEnv();
const client = new WowauditClient({ apiKey: process.env.WOWAUDIT_API_KEY, baseUrl: process.env.WOWAUDIT_BASE_URL });
const payload = await client.getWishlists();
await writeFile("data/wowaudit-wishlists.json", `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
const rows = Array.isArray(payload) ? payload : payload.characters ?? payload.wishlists ?? payload.data ?? [];
console.log(`Saved ${rows.length} WoWAudit wishlist/simulation summaries.`);
console.log("Fields:", [...new Set(rows.flatMap(row => Object.keys(row)))].sort().join(", "));
