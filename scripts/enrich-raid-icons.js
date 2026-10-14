import { readFile, writeFile } from "node:fs/promises";
import { BlizzardClient } from "../src/blizzard.js";
import { loadEnv } from "../src/env.js";

await loadEnv();
import { loadRaids } from "../src/raid-files.js";
const raids = await loadRaids();
const client = new BlizzardClient({ clientId: process.env.BLIZZARD_CLIENT_ID, clientSecret: process.env.BLIZZARD_CLIENT_SECRET });
const token = await client.getToken("US");
const items = [...new Map(raids.flatMap(({ raid }) => raid.bosses.flatMap(b => b.items)).map(i => [i.itemId, i])).values()];
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
for (const { file, raid } of raids) await writeFile(file, `${JSON.stringify(raid, null, 2)}\n`, { mode: 0o600 });
console.log(`Added ${fetched} item icons.`);
