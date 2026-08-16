import { readFile, writeFile } from "node:fs/promises";
import { BlizzardClient } from "../src/blizzard.js";
import { loadEnv } from "../src/env.js";

await loadEnv();
const path = "data/bis/icy-veins-midnight-s2.json";
const bis = JSON.parse(await readFile(path, "utf8"));
const items = Object.values(bis.lists).flatMap((list) => list.items);
const unique = [...new Map(items.map((item) => [item.itemId, item])).values()];
const client = new BlizzardClient({
  clientId: process.env.BLIZZARD_CLIENT_ID,
  clientSecret: process.env.BLIZZARD_CLIENT_SECRET,
});
const token = await client.getToken("US");
const icons = new Map(unique.filter((item) => item.icon).map((item) => [item.itemId, item.icon]));

for (const item of unique) {
  if (icons.has(item.itemId)) continue;
  const response = await fetch(`https://us.api.blizzard.com/data/wow/media/item/${item.itemId}?namespace=static-us&locale=en_US`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    console.warn(`${item.name}: HTTP ${response.status}`);
    continue;
  }
  const media = await response.json();
  const icon = media.assets?.find((asset) => asset.key === "icon")?.value;
  if (icon) icons.set(item.itemId, icon);
}

for (const item of items) item.icon = icons.get(item.itemId) || item.icon;
await writeFile(path, `${JSON.stringify(bis, null, 2)}\n`);
console.log(`Resolved ${icons.size}/${unique.length} unique Icy Veins item icons.`);
