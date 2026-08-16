import { writeFile } from "node:fs/promises";
import { loadEnv } from "../src/env.js";
import { WowauditClient } from "../src/wowaudit.js";
await loadEnv();
const client = new WowauditClient({ apiKey: process.env.WOWAUDIT_API_KEY, baseUrl: process.env.WOWAUDIT_BASE_URL });
const [period, activity] = await Promise.all([client.getPeriod(), client.getHistoricalData()]);
await writeFile("data/wowaudit-audit.json", `${JSON.stringify({ fetchedAt: new Date().toISOString(), periodInfo: period, ...activity }, null, 2)}\n`, { mode: 0o600 });
console.log(`Saved weekly audit activity for ${activity.characters?.length || 0} characters (period ${activity.period}).`);
