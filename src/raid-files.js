// Every addon-exported raid, not just the newest one.
//
// /ofloot exports one instance, and import-raid-loot.js used to write whichever
// one you ran it in straight over data/raid-loot.json. Exporting a second raid
// therefore deleted the first: the week Kith'ix opened, one import would have
// taken The Venomous Abyss - still being cleared for gear - off the board
// entirely, with no error and nothing to put it back but a second trip into the
// game.
//
// So each raid gets its own file and the board reads all of them. The primary
// keeps its original name because the refresh workflow and the "no bosses"
// guard in build-app-data both reference it by path.
import { readFile, readdir } from "node:fs/promises";

export const PRIMARY_RAID_FILE = "data/raid-loot.json";

// A raid's own item levels, by difficulty.
//
// The positional ladder in App.tsx only ever described The Venomous Abyss: it
// is indexed by boss order, so a raid on its own lockout reads off the end of it
// and every "is this an upgrade" answer silently becomes undefined. A raid that
// is not that one has to carry its own, exactly as The Tidebound Grotto does.
// Mythic is the number the raid actually drops at; normal and heroic follow the
// 13-per-difficulty step every other instance this season uses (292/305/318,
// 295/308/321, 302/315/327, and The Tidebound Grotto's 292/305/318). If Kith'ix
// ever breaks that spacing these two are the ones to correct - mythic came from
// the raid, the others are derived.
export const RAID_LEVELS = {
  "The Unbinding of Kith'ix": { normal: 308, heroic: 321, mythic: 334 },
};

export function raidFileFor(raidName) {
  const slug = String(raidName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `data/raid-loot-${slug}.json`;
}

// Primary first, then the rest in a stable order so the board's boss list does
// not reshuffle between builds.
export async function raidFiles() {
  const names = (await readdir("data").catch(() => []))
    .filter((f) => /^raid-loot-[a-z0-9-]+\.json$/.test(f))
    .sort()
    .map((f) => `data/${f}`);
  return [PRIMARY_RAID_FILE, ...names];
}

export async function loadRaids() {
  const raids = [];
  for (const file of await raidFiles()) {
    try {
      const raid = JSON.parse(await readFile(file, "utf8"));
      if (raid?.bosses?.length) raids.push({ file, raid });
    } catch {
      // A raid that has never been exported is not an error; the board simply
      // does not show it.
    }
  }
  return raids;
}
