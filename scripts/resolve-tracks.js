import { readFile, writeFile } from "node:fs/promises";
import { fetchUpgradeTrack } from "../src/wowhead.js";

const gearPath = "data/gear.json";
const cachePath = "data/tooltip-cache.json";

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

const signature = (item) => item.bonusList.join(":");
const gear = await readJson(gearPath);
const cache = await readJson(cachePath, {});
const representatives = new Map();

for (const character of gear.characters) {
  for (const item of character.equipment) {
    if (item.itemLevel >= 207 && item.bonusList?.length) {
      representatives.set(signature(item), item);
    }
  }
}

const pending = [...representatives.entries()].filter(([key]) => !(key in cache));
let cursor = 0;
let failures = 0;

async function worker() {
  while (cursor < pending.length) {
    const index = cursor++;
    const [key, item] = pending[index];
    try {
      cache[key] = await fetchUpgradeTrack(item);
      if ((index + 1) % 20 === 0 || index + 1 === pending.length) {
        console.log(`Resolved ${index + 1}/${pending.length} new bonus signatures`);
      }
    } catch (error) {
      failures += 1;
      console.error(error.message);
    }
  }
}

await Promise.all(Array.from({ length: 6 }, () => worker()));
await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });

let exact = 0;
let equivalent = 0;
let crafted = 0;
let withoutTrack = 0;
for (const character of gear.characters) {
  for (const item of character.equipment) {
    const resolution = item.bonusList?.length ? cache[signature(item)] : null;
    const description = item.raw?.name_description?.display_string ?? "";
    const equivalentMatch = description.match(/:\s*(Myth|Hero|Champion|Veteran|Adventurer|Explorer)$/iu);
    item.track = resolution?.track ?? equivalentMatch?.[1] ?? null;
    item.trackRank = resolution?.rank ?? null;
    item.trackKind = resolution ? "upgrade_track" : equivalentMatch ? "equivalent_track" : null;
    item.trackVerification = resolution
      ? "verified_tooltip"
      : equivalentMatch
        ? "verified_blizzard_description"
        : /Crafted/iu.test(description)
          ? "crafted_no_track"
          : item.itemLevel < 207
            ? "not_endgame_gear"
            : "no_upgrade_track";
    if (resolution) exact += 1;
    else if (equivalentMatch) equivalent += 1;
    else {
      withoutTrack += 1;
      if (/Crafted/iu.test(description)) crafted += 1;
    }
  }
}

gear.tracksResolvedAt = new Date().toISOString();
gear.trackResolution = {
  exact,
  equivalent,
  crafted,
  withoutTrack,
  requestFailures: failures,
  source: "Blizzard equipment bonus IDs resolved through generated Wowhead tooltips",
};
await writeFile(gearPath, `${JSON.stringify(gear, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
console.log(`Updated ${gearPath}: ${exact} ranked tracks, ${equivalent} equivalent tracks, ${crafted} crafted items, ${withoutTrack} other non-track items, ${failures} failures.`);
if (failures) process.exitCode = 1;
