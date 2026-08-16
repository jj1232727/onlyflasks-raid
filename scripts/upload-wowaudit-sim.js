import { parseArgs } from "node:util";
import { loadEnv } from "../src/env.js";
import { raidbotsReportId } from "../src/raidbots.js";
import { WowauditClient } from "../src/wowaudit.js";

const { values } = parseArgs({
  options: {
    report: { type: "string" },
    "character-id": { type: "string" },
    "character-name": { type: "string" },
    configuration: { type: "string", default: "Single Target" },
    "replace-manual-edits": { type: "boolean", default: false },
    confirm: { type: "boolean", default: false },
  },
});

const reportId = raidbotsReportId(values.report),
  payload = {
    reportId,
    configurationName: values.configuration,
    characterId: values["character-id"],
    characterName: values["character-name"],
    replaceManualEdits: values["replace-manual-edits"],
  };

console.log("Validated WoWAudit upload:");
console.log(
  JSON.stringify(
    {
      report_id: payload.reportId,
      character_id: payload.characterId || undefined,
      character_name: payload.characterName || undefined,
      configuration_name: payload.configurationName,
      replace_manual_edits: payload.replaceManualEdits,
    },
    null,
    2,
  ),
);

if (!values.confirm) {
  console.log("Dry run only. Add --confirm to submit this report to WoWAudit.");
  process.exit(0);
}

await loadEnv();
const client = new WowauditClient({
  apiKey: process.env.WOWAUDIT_API_KEY,
  baseUrl: process.env.WOWAUDIT_BASE_URL,
});
const result = await client.uploadWishlistReport(payload);
console.log("WoWAudit response:", JSON.stringify(result));
