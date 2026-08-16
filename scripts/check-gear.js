import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { BlizzardClient, normalizeItem } from "../src/blizzard.js";
import { loadEnv } from "../src/env.js";

const { values } = parseArgs({
  options: { out: { type: "string", short: "o" } },
});

await loadEnv();

try {
  const roster = JSON.parse(await readFile("data/roster.json", "utf8"));
  const client = new BlizzardClient({
    clientId: process.env.BLIZZARD_CLIENT_ID,
    clientSecret: process.env.BLIZZARD_CLIENT_SECRET,
  });
  const results = [];

  for (const character of roster.characters) {
    try {
      const payload = await client.getEquipment(character);
      results.push({
        character: {
          wowauditId: character.id,
          name: character.name,
          realm: character.realm,
          region: character.region,
        },
        status: "ok",
        equipment: (payload.equipped_items ?? []).map(normalizeItem),
      });
      console.log(`Fetched ${character.name}-${character.realm}`);
    } catch (error) {
      results.push({
        character: {
          wowauditId: character.id,
          name: character.name,
          realm: character.realm,
          region: character.region,
        },
        status: "error",
        error: error.message,
        equipment: [],
      });
      console.error(error.message);
    }
  }

  const snapshot = {
    fetchedAt: new Date().toISOString(),
    rosterFetchedAt: roster.fetchedAt,
    characters: results,
  };
  const outputPath = resolve(values.out ?? "data/gear.json");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  const succeeded = results.filter((result) => result.status === "ok").length;
  console.log(`Saved equipment for ${succeeded}/${results.length} characters to ${outputPath}`);
  if (succeeded !== results.length) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

