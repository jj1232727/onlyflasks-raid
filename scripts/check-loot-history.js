// Pull the season's awarded loot from WoWAudit into data/wowaudit-loot-history.json.
//
//   npm run wowaudit:history        # the season /v1/period says is current
//   npm run wowaudit:history -- 17  # a specific keystone season id
//
// Part of audit:refresh, and deliberately never fatal: this is one panel of the
// board, and a WoWAudit hiccup here must not take the roster, gear and sim
// refresh down with it - they run in the same && chain.
import { readFile, writeFile } from "node:fs/promises";
import { loadEnv } from "../src/env.js";
import { WowauditClient } from "../src/wowaudit.js";

const OUT = "data/wowaudit-loot-history.json";

const rowsOf = (history) =>
  Array.isArray(history)
    ? history
    : (history?.history_items ??
      history?.loot_history ??
      history?.history ??
      history?.data ??
      history?.items ??
      []);

// The season this endpoint wants is the keystone season id, and /v1/period
// nests it: { current_season: { id: 18, name: "Season 2", ... } }. The flat
// spellings tried here have never existed in a response - the call only ever
// worked because of the hardcoded fallback underneath them, which would have
// silently pinned the board to Season 2 forever. Read the real field first and
// keep the rest as tolerance for a shape change.
const seasonIdOf = (period) =>
  Number(
    period?.current_season?.id ??
      period?.season?.id ??
      period?.season_id ??
      period?.current_season_id ??
      period?.keystone_season_id ??
      0,
  ) || null;

await loadEnv();

const client = new WowauditClient({
  apiKey: process.env.WOWAUDIT_API_KEY,
  baseUrl: process.env.WOWAUDIT_BASE_URL,
});

const previous = await readFile(OUT, "utf8").then(JSON.parse).catch(() => null);

let seasonId = Number(process.argv[2]) || null;
if (!seasonId) {
  try {
    seasonId = seasonIdOf(await client.getPeriod());
  } catch (error) {
    console.warn(`Could not read /v1/period: ${error.message}`);
  }
}
if (!seasonId) {
  // Better to leave yesterday's history in place than to guess an id, get a
  // 400, and have the caller treat that as the whole refresh failing.
  console.warn(`No keystone season id available; leaving ${OUT} as it is.`);
  process.exit(0);
}

let history;
try {
  history = await client.getLootHistory(seasonId);
} catch (error) {
  console.warn(`WoWAudit loot history for season ${seasonId} failed: ${error.message}`);
  console.warn(`Leaving ${OUT} as it is.`);
  process.exit(0);
}

const rows = rowsOf(history);

// An empty answer for the season we already hold rows for is a glitch far more
// often than it is a real emptying - awarded loot only accumulates within a
// season. A rollover to a new season legitimately starts at zero, so that case
// still writes.
if (!rows.length && rowsOf(previous).length && Number(previous?.seasonId) === seasonId) {
  console.warn(
    `WoWAudit returned no loot for season ${seasonId} but ${OUT} holds ${rowsOf(previous).length}; keeping those.`,
  );
  process.exit(0);
}

await writeFile(
  OUT,
  `${JSON.stringify({ ...history, seasonId, fetchedAt: new Date().toISOString() }, null, 2)}\n`,
  { mode: 0o600 },
);

console.log(`Saved ${rows.length} WoWAudit loot-history records for season ${seasonId}.`);
if (!rows.length) {
  // Worth saying plainly: an empty history reads on the board as "nobody won
  // anything", and the usual cause is upstream - WoWAudit only has loot that
  // something (RCLootCouncil, or a manual entry) actually sent it.
  console.log(
    `Season ${seasonId} has no awarded loot in WoWAudit yet. If the raid did hand loot out, it has not reached WoWAudit - check the addon/import side there, not here.`,
  );
}
if (rows[0]) console.log("Record fields:", Object.keys(rows[0]).join(", "));
