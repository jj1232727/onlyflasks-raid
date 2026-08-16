// Icons for items that only ever appear in someone's bags or vault.
//
// Every other icon reaches the board because the item is in season-loot, the
// raid table, a BiS list, or on a character. Bag and vault contents come from
// SimC snapshots stored in the Google Sheet, and those carry no icon. Items
// that share a name across armour types have DIFFERENT icons per item id, so
// falling back to a same-name lookup shows the wrong art — the id has to be
// resolved. Results accumulate in a committed cache so each id is fetched once.
import { readFile, writeFile } from "node:fs/promises";
import { BlizzardClient } from "../src/blizzard.js";
import { loadEnv } from "../src/env.js";

await loadEnv();

const read = async (path, fallback) => {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
};

const cache = await read("data/item-icons.json", {});
const before = Object.keys(cache).length;

// Anything already carrying an icon elsewhere never needs the API.
const known = new Set();
const remember = (items) => {
  for (const item of items || []) if (item?.icon && item?.itemId) known.add(Number(item.itemId));
};
const season = await read("data/season-loot.json", { items: [] });
const raid = await read("data/raid-loot.json", { bosses: [] });
const bis = await read("data/bis/icy-veins-midnight-s2.json", { lists: {} });
const gear = await read("data/gear.json", { characters: [] });
remember(season.items);
for (const boss of raid.bosses || []) remember(boss.items);
for (const list of Object.values(bis.lists || {})) remember(list.items);
for (const entry of gear.characters || []) remember(entry.equipment);

const configUrl = (await read("public/app-config.json", {})).wishlistApiUrl;
if (!configUrl) {
  console.log("No wishlistApiUrl configured; skipping snapshot icon enrichment.");
  process.exit(0);
}

let snapshots = {};
try {
  const response = await fetch(configUrl, { redirect: "follow" });
  const payload = await response.json();
  if (!payload.ok) throw new Error(payload.error || "sheet request failed");
  snapshots = payload.simcSnapshots || {};
} catch (error) {
  // A sheet hiccup must not fail the whole refresh; the cache still applies.
  console.log(`Could not read SimC snapshots (${error.message}); keeping ${before} cached icons.`);
  process.exit(0);
}

const wanted = new Map();
for (const snapshot of Object.values(snapshots)) {
  for (const item of [...(snapshot.bags || []), ...(snapshot.vault || [])]) {
    const id = Number(item?.itemId);
    if (Number.isFinite(id) && !known.has(id) && !cache[id]) wanted.set(id, item.name || String(id));
  }
}

if (wanted.size === 0) {
  console.log(`No new bag or vault icons to resolve (${before} cached).`);
  process.exit(0);
}

const client = new BlizzardClient({
  clientId: process.env.BLIZZARD_CLIENT_ID,
  clientSecret: process.env.BLIZZARD_CLIENT_SECRET,
});
const token = await client.getToken("US");
let added = 0;
for (const [id, name] of wanted) {
  const response = await fetch(
    `https://us.api.blizzard.com/data/wow/media/item/${id}?namespace=static-us&locale=en_US`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    console.log(`  skipped ${name} (${id}): HTTP ${response.status}`);
    continue;
  }
  const media = await response.json(),
    icon = media.assets?.find((a) => a.key === "icon")?.value;
  if (!icon) continue;
  cache[id] = icon;
  added++;
}

const sorted = Object.fromEntries(Object.keys(cache).sort((a, b) => a - b).map((k) => [k, cache[k]]));
await writeFile("data/item-icons.json", `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`Resolved ${added} bag/vault icons (${before} -> ${Object.keys(sorted).length} cached).`);
