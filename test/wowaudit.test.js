import assert from "node:assert/strict";
import test from "node:test";
import {
  extractCharacters,
  normalizeCharacter,
  summarizeTeam,
  WowauditClient,
} from "../src/wowaudit.js";
import { raidbotsReportId } from "../src/raidbots.js";

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

test("uploads a Raidbots report through the documented wishlist endpoint", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ created: true }), { status: 200 });
  };
  const client = new WowauditClient({ apiKey: "secret", fetchImpl });

  const result = await client.uploadWishlistReport({
    reportId: "84ywk9eay1akcwS1dfY31j",
    characterId: 123,
    configurationName: "Single Target",
    replaceManualEdits: true,
  });

  assert.deepEqual(result, { created: true });
  assert.equal(calls[0].url, "https://wowaudit.com/v1/wishlists");
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    report_id: "84ywk9eay1akcwS1dfY31j",
    character_id: 123,
    configuration_name: "Single Target",
    replace_manual_edits: true,
  });
});

test("extracts only valid Raidbots report IDs", () => {
  assert.equal(
    raidbotsReportId(
      "https://www.raidbots.com/simbot/report/84ywk9eay1akcwS1dfY31j/data.json",
    ),
    "84ywk9eay1akcwS1dfY31j",
  );
  assert.equal(raidbotsReportId("84ywk9eay1akcwS1dfY31j"), "84ywk9eay1akcwS1dfY31j");
  assert.throws(
    () => raidbotsReportId("https://example.com/simbot/report/84ywk9eay1akcwS1dfY31j"),
    /raidbots\.com/u,
  );
});

test("lets WoWAudit infer the character from a Raidbots report", async () => {
  let submitted;
  const client = new WowauditClient({
    apiKey: "secret",
    fetchImpl: async (_url, options) => {
      submitted = JSON.parse(options.body);
      return new Response(JSON.stringify({ created: true }), { status: 200 });
    },
  });

  await client.uploadWishlistReport({
    reportId: "84ywk9eay1akcwS1dfY31j",
    configurationName: "Single Target",
  });

  assert.deepEqual(submitted, {
    report_id: "84ywk9eay1akcwS1dfY31j",
    configuration_name: "Single Target",
    replace_manual_edits: false,
  });
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
