import { mkdir, writeFile } from "node:fs/promises";

const specs = [
  ["Blood Death Knight", "blood-death-knight-pve-tank"], ["Frost Death Knight", "frost-death-knight-pve-dps"], ["Unholy Death Knight", "unholy-death-knight-pve-dps"],
  ["Havoc Demon Hunter", "havoc-demon-hunter-pve-dps"], ["Vengeance Demon Hunter", "vengeance-demon-hunter-pve-tank"], ["Devourer Demon Hunter", "devourer-demon-hunter-pve-dps"],
  ["Balance Druid", "balance-druid-pve-dps"], ["Feral Druid", "feral-druid-pve-dps"], ["Guardian Druid", "guardian-druid-pve-tank"], ["Restoration Druid", "restoration-druid-pve-healing"],
  ["Augmentation Evoker", "augmentation-evoker-pve-dps"], ["Devastation Evoker", "devastation-evoker-pve-dps"], ["Preservation Evoker", "preservation-evoker-pve-healing"],
  ["Beast Mastery Hunter", "beast-mastery-hunter-pve-dps"], ["Marksmanship Hunter", "marksmanship-hunter-pve-dps"], ["Survival Hunter", "survival-hunter-pve-dps"],
  ["Arcane Mage", "arcane-mage-pve-dps"], ["Fire Mage", "fire-mage-pve-dps"], ["Frost Mage", "frost-mage-pve-dps"],
  ["Brewmaster Monk", "brewmaster-monk-pve-tank"], ["Mistweaver Monk", "mistweaver-monk-pve-healing"], ["Windwalker Monk", "windwalker-monk-pve-dps"],
  ["Holy Paladin", "holy-paladin-pve-healing"], ["Protection Paladin", "protection-paladin-pve-tank"], ["Retribution Paladin", "retribution-paladin-pve-dps"],
  ["Discipline Priest", "discipline-priest-pve-healing"], ["Holy Priest", "holy-priest-pve-healing"], ["Shadow Priest", "shadow-priest-pve-dps"],
  ["Assassination Rogue", "assassination-rogue-pve-dps"], ["Outlaw Rogue", "outlaw-rogue-pve-dps"], ["Subtlety Rogue", "subtlety-rogue-pve-dps"],
  ["Elemental Shaman", "elemental-shaman-pve-dps"], ["Enhancement Shaman", "enhancement-shaman-pve-dps"], ["Restoration Shaman", "restoration-shaman-pve-healing"],
  ["Affliction Warlock", "affliction-warlock-pve-dps"], ["Demonology Warlock", "demonology-warlock-pve-dps"], ["Destruction Warlock", "destruction-warlock-pve-dps"],
  ["Arms Warrior", "arms-warrior-pve-dps"], ["Fury Warrior", "fury-warrior-pve-dps"], ["Protection Warrior", "protection-warrior-pve-tank"],
];

const decode = (value) => value.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&mdash;/g, "—").replace(/<[^>]+>/g, "").trim();
const lists = {};
for (const [spec, slug] of specs) {
  const url = `https://www.icy-veins.com/wow/${slug}-gear-best-in-slot`;
  const response = await fetch(url, { headers: { "user-agent": "OnlyFlasksLootBoard/1.0" } });
  if (!response.ok) { console.warn(`${spec}: HTTP ${response.status}`); continue; }
  const html = await response.text();
  const start = html.indexOf('id="overall-best-in-slot"');
  if (start < 0) { console.warn(`${spec}: overall BiS section unavailable`); continue; }
  const nextTab = html.indexOf('id="best-gear-from-mythic"', start);
  const section = html.slice(start, nextTab > start ? nextTab : (html.indexOf('<h2', start) > start ? html.indexOf('<h2', start) : undefined));
  const items = [];
  for (const card of section.split(/<div class="bis_item(?:\s[^"]*)?"[^>]*>/).slice(1)) {
    const slot = card.match(/class="bis_item_slot">([^<]+)</);
    const item = slot ? card.slice(0, slot.index).match(/data-wowhead="(item=(\d+)[^"]*)"[^>]*>[\s\S]*?<span[^>]*class="q\d"[^>]*>([^<]+)<\/span>/) : null;
    const drop = card.match(/class="bis_item_drop">([\s\S]*?)<\/span>/);
    if (item && slot) {
      const original = item[1].match(/original-item=(\d+)/);
      const dropName = drop ? decode(drop[1]) : "";
      items.push({ itemId: Number(item[2]), name: decode(item[3]), slot: decode(slot[1]), drop: dropName, crafted: /craft/i.test(dropName), ...(original ? { sourceItemId: Number(original[1]), catalyst: true } : {}) });
    }
  }
  const modified = html.match(/"dateModified":"([^"]+)"/);
  lists[spec] = { url, reviewedAt: modified?.[1] ?? null, items };
  console.log(`${spec}: ${items.length} raid targets`);
}

await mkdir("data/bis", { recursive: true });
await writeFile("data/bis/icy-veins-midnight-s2.json", JSON.stringify({ source: "Icy Veins", season: "Midnight Season 2", contentType: "Overall", importedAt: new Date().toISOString(), lists }, null, 2));
console.log(`Saved ${Object.keys(lists).length} Icy Veins overall lists.`);
