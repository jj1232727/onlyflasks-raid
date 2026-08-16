import { readFile, writeFile } from "node:fs/promises";
import { BlizzardClient } from "../src/blizzard.js";
import { loadEnv } from "../src/env.js";

await loadEnv();
const audit = JSON.parse(await readFile("data/wowaudit-audit.json", "utf8"));
const season = audit.periodInfo?.current_season;
const wanted = [
  ...["Altar of Fangs", "Murder Row", "Den of Nalorakk", "The Blinding Vale", "Voidscar Arena", "Kings' Rest", "Temple of Sethraliss", "Ruby Life Pools"].map((name) => ({ name, sourceType: "Mythic+" })),
  ...["The Venomous Abyss", "The Tidebound Grotto"].map((name) => ({ name, sourceType: "Raid" })),
];
const norm = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const client = new BlizzardClient({ clientId: process.env.BLIZZARD_CLIENT_ID, clientSecret: process.env.BLIZZARD_CLIENT_SECRET });
const token = await client.getToken("US");
const get = async (url, attempts = 6) => {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (response.ok) return response.json();
    if (response.status !== 429 || attempt === attempts - 1) throw new Error(`${url}: HTTP ${response.status}`);
    await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
  }
};
const api = "https://us.api.blizzard.com";
const index = await get(`${api}/data/wow/journal-instance/index?namespace=static-us&locale=en_US`);
const instances = [];
for (const target of wanted) {
  const hit = (index.instances || []).find((x) => norm(x.name) === norm(target.name));
  if (!hit) { console.warn(`Journal instance unavailable: ${target.name}`); continue; }
  const detail = await get(hit.key.href.replace(/^http:/, "https:"));
  instances.push({ ...target, detail });
}

const drops = [];
for (const instance of instances) {
  for (const encounterRef of instance.detail.encounters || []) {
    const encounter = await get(encounterRef.key.href.replace(/^http:/, "https:"));
    for (const entry of encounter.items || []) {
      const ref = entry.item || entry;
      if (!ref.id) continue;
      const name = typeof ref.name === "string" ? ref.name : ref.name?.en_US || `Item ${ref.id}`;
      const encounterName = typeof encounter.name === "string" ? encounter.name : encounter.name?.en_US || "";
      drops.push({ itemId: ref.id, name, source: instance.name, sourceType: instance.sourceType, encounter: encounterName });
    }
  }
}

const previous = JSON.parse(await readFile("data/season-loot.json", "utf8").catch(() => '{"items":[]}'));
const old = new Map((previous.items || []).map((x) => [x.itemId, x]));
const unique = [...new Map(drops.map((x) => [x.itemId, { ...(old.get(x.itemId) || {}), ...x }])).values()];
let cursor = 0;
const workers = Array.from({ length: 2 }, async () => {
  while (cursor < unique.length) {
    const item = unique[cursor++];
    try {
      if (!item.slot || item.armorType === undefined || !item.classIds) {
        const detail = await get(`${api}/data/wow/item/${item.itemId}?namespace=static-us&locale=en_US`);
        item.slot = detail.inventory_type?.name || detail.inventory_type?.type || "";
        item.armorType = detail.item_subclass?.name || "";
        item.classIds = detail.requirements?.playable_classes?.links?.map((x) => x.id) || [];
      }
      if (!item.icon) {
        const media = await get(`${api}/data/wow/media/item/${item.itemId}?namespace=static-us&locale=en_US`);
        item.icon = media.assets?.find((x) => x.key === "icon")?.value;
      }
    } catch (error) { console.warn(`${item.name}: ${error.message}`); }
  }
});
await Promise.all(workers);
await writeFile("data/season-loot.json", `${JSON.stringify({ season: season?.name, importedAt: new Date().toISOString(), instances: instances.map(x => ({name:x.name,sourceType:x.sourceType})), items: unique }, null, 2)}\n`);
console.log(`Saved ${unique.length} unique items from ${instances.length}/${wanted.length} seasonal instances.`);
