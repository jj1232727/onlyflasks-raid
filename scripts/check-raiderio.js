import { readFile, writeFile } from "node:fs/promises";

const roster = JSON.parse(await readFile("data/roster.json", "utf8"));
const characters = [];
for (const character of roster.characters) {
  const params = new URLSearchParams({
    region: character.region.toLowerCase(), realm: character.realm, name: character.name,
    fields: "mythic_plus_weekly_highest_level_runs,raid_progression",
  });
  const response = await fetch(`https://raider.io/api/v1/characters/profile?${params}`);
  if (!response.ok) {
    characters.push({ id: character.id, name: character.name, status: "error", httpStatus: response.status });
  } else {
    const data = await response.json();
    characters.push({ id: character.id, name: character.name, status: "ok", lastCrawledAt: data.last_crawled_at, profileUrl: data.profile_url, weeklyRuns: data.mythic_plus_weekly_highest_level_runs || [], raidProgression: data.raid_progression || {} });
  }
  await new Promise((resolve) => setTimeout(resolve, 75));
}
await writeFile("data/raiderio-audit.json", `${JSON.stringify({ fetchedAt: new Date().toISOString(), characters }, null, 2)}\n`);
console.log(`Saved Raider.IO verification for ${characters.filter((x) => x.status === "ok").length}/${characters.length} characters.`);
