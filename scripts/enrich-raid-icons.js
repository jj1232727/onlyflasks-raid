import { readFile, writeFile } from "node:fs/promises";
import { BlizzardClient } from "../src/blizzard.js";
import { loadEnv } from "../src/env.js";

await loadEnv();
const raid = JSON.parse(await readFile("data/raid-loot.json", "utf8"));
const client = new BlizzardClient({ clientId: process.env.BLIZZARD_CLIENT_ID, clientSecret: process.env.BLIZZARD_CLIENT_SECRET });
const token = await client.getToken("US");
const items = [...new Map(raid.bosses.flatMap(b => b.items).map(i => [i.itemId, i])).values()];
let fetched = 0;
for (const item of items) {
  if (item.icon) continue;
  const url = `https://us.api.blizzard.com/data/wow/media/item/${item.itemId}?namespace=static-us&locale=en_US`;
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) { console.warn(`${item.name}: HTTP ${response.status}`); continue; }
  const media = await response.json();
  item.icon = media.assets?.find(a => a.key === "icon")?.value ?? null;
  fetched++;
}
await writeFile("data/raid-loot.json", `${JSON.stringify(raid, null, 2)}\n`, { mode: 0o600 });
console.log(`Added ${fetched} item icons.`);
