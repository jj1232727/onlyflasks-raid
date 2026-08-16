import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { saved: { type: "string" } } });
if (!values.saved) {
  console.error("Usage: node scripts/import-raid-loot.js --saved PATH_TO_OnlyFlasksLootExport.lua");
  process.exit(1);
}
const lua = await readFile(values.saved, "utf8");
const match = lua.match(/\["json"\]\s*=\s*"((?:\\.|[^"\\])*)"/su) ?? lua.match(/json\s*=\s*"((?:\\.|[^"\\])*)"/su);
if (!match) throw new Error("Could not find the exported JSON. Run /ofloot in WoW, then /reload or log out first.");
const jsonText = match[1]
  .replace(/\\n/gu, "\n")
  .replace(/\\r/gu, "\r")
  .replace(/\\"/gu, '"')
  .replace(/\\\\/gu, "\\");
const raid = JSON.parse(jsonText);
await mkdir(dirname("data/raid-loot.json"), { recursive: true });
await writeFile("data/raid-loot.json", `${JSON.stringify(raid, null, 2)}\n`, "utf8");
const count = raid.bosses.reduce((sum, boss) => sum + boss.items.length, 0);
console.log(`Imported ${count} loot entries across ${raid.bosses.length} bosses.`);

