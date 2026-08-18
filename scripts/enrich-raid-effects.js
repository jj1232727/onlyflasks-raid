import { readFile, writeFile } from "node:fs/promises";
import { extraBosses } from "../src/extra-raids.js";

const raid = JSON.parse(await readFile("data/raid-loot.json", "utf8"));
// The addon export is one instance, so a boss on its own lockout is invisible
// here too. Sweeping only raid-loot.json left every Tidebound Grotto drop with
// no effect text — including the trinket, which is the whole reason to look.
const seasonLoot = JSON.parse(await readFile("data/season-loot.json", "utf8"));
const effects = {};

const plainText = (html = "") =>
  html
    .replace(/<br\s*\/?\s*>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&#39;/giu, "'")
    .replace(/&quot;/giu, '"')
    .replace(/\s+/gu, " ")
    .trim();

const effectText = (tooltip) => {
  const text = plainText(tooltip);
  if (
    /Housing Decor|Mount \(Account-wide\)|Add this appearance to your Warband collection/iu.test(
      text,
    )
  )
    return "";
  return [...text.matchAll(/(?:Equip|Use):\s*.*?(?=(?:Equip|Use):|Requires Level|Sell Price:|Dropped by:|$)/giu)]
    .map((match) => match[0].trim())
    .join(" ");
};

async function tooltip(itemId) {
  for (const environment of ["ptr-2", "ptr", ""]) {
    const prefix = environment ? `${environment}/` : "";
    const response = await fetch(
      `https://nether.wowhead.com/${prefix}tooltip/item/${itemId}?dataEnv=1&locale=0`,
      { headers: { accept: "application/json" } },
    );
    if (response.ok) return response.json();
  }
  return null;
}

const items = [
  ...new Map(
    [...raid.bosses, ...extraBosses(seasonLoot)]
      .flatMap((boss) => boss.items)
      .filter((item) => item.slot)
      .map((item) => [Number(item.itemId), item]),
  ).values(),
];

for (const item of items) {
  try {
    const payload = await tooltip(item.itemId);
    const text = effectText(payload?.tooltip);
    if (text) effects[item.itemId] = { specialEffect: true, effectText: text };
  } catch (error) {
    console.warn(`Could not inspect ${item.name} (${item.itemId}): ${error.message}`);
  }
}

await writeFile(
  "data/raid-effects.json",
  `${JSON.stringify({ fetchedAt: new Date().toISOString(), items: effects }, null, 2)}\n`,
  "utf8",
);
console.log(`Detected effects on ${Object.keys(effects).length} raid items.`);
