import { writeFile } from "node:fs/promises";
import { loadEnv } from "../src/env.js";
import { WowauditClient } from "../src/wowaudit.js";
await loadEnv();
const client = new WowauditClient({
    apiKey: process.env.WOWAUDIT_API_KEY,
    baseUrl: process.env.WOWAUDIT_BASE_URL,
  }),
  period = await client.getPeriod();
const requestedSeason = Number(process.argv[2]);
const seasonId =
    requestedSeason ||
    (period.season_id ??
      period.season?.id ??
      period.current_season_id ??
      period.keystone_season_id ??
      18),
  history = await client.getLootHistory(seasonId);
await writeFile(
  "data/wowaudit-loot-history.json",
  `${JSON.stringify(history, null, 2)}\n`,
  { mode: 0o600 },
);
const rows = Array.isArray(history)
  ? history
  : (history.history_items ??
    history.loot_history ??
    history.history ??
    history.data ??
    history.items ??
    []);
console.log(
  `Saved ${rows.length} WoWAudit loot-history records for season ${seasonId}.`,
);
console.log("Top-level fields:", Object.keys(history).join(", "));
if (rows[0]) console.log("Record fields:", Object.keys(rows[0]).join(", "));
