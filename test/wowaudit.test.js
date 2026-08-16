import assert from "node:assert/strict";
import test from "node:test";
import {
  extractCharacters,
  normalizeCharacter,
  summarizeTeam,
  WowauditClient,
} from "../src/wowaudit.js";

test("client authenticates with a Bearer token and calls v1 routes", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify([]), { status: 200 });
  };
  const client = new WowauditClient({ apiKey: "secret", fetchImpl });

  await client.getCharacters();

  assert.equal(calls[0].url, "https://wowaudit.com/v1/characters");
  assert.equal(calls[0].options.headers.authorization, "Bearer secret");
});

test("extracts and normalizes a wrapped character list", () => {
  const characters = extractCharacters({
    characters: [{
      id: 42,
      role: "ranged",
      character_reference: {
        name: "Example",
        class_name: "Mage",
        realm: { name: "Area 52", region: "US" },
      },
      team_rank: { name: "Raider", for_alts: false },
    }],
  }).map(normalizeCharacter);

  assert.deepEqual(
    { ...characters[0], raw: undefined },
    {
      id: 42,
      name: "Example",
      realm: "Area 52",
      region: "US",
      class: "Mage",
      role: "ranged",
      rank: "Raider",
      isAlt: false,
      raw: undefined,
    },
  );
});

test("summarizes a team response", () => {
  assert.deepEqual(
    summarizeTeam({ name: "Main", guild: { name: "OnlyFlasks", realm: { name: "Area 52", region: "US" } } }),
    { team: "Main", guild: "OnlyFlasks", realm: "Area 52", region: "US" },
  );
});

test("uses direct character realms and derives team location from its URL", () => {
  const team = summarizeTeam({
    name: "Main",
    guild_name: "OnlyFlasks",
    url: "https://wowaudit.com/guild/us/area-52/onlyflasks/teams/main",
  });
  const character = normalizeCharacter({ name: "Example", realm: "Burning Blade" }, team);

  assert.equal(team.region, "US");
  assert.equal(team.realm, "area-52");
  assert.equal(character.realm, "Burning Blade");
  assert.equal(character.region, "US");
});
