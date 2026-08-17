// Run QE Live's Upgrade Finder for one healer, by hand.
//
//   node scripts/qe-run.js --simc <file> --spec "Restoration Shaman"
//
// The queue worker (scripts/qe-sync.js) does this for the whole roster; this is
// for testing a single character.
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { QE_DIFFICULTIES, runQeUpgradeFinder } from "../src/qe-live.js";

const { values } = parseArgs({
  options: {
    simc: { type: "string" },
    spec: { type: "string" },
    difficulty: { type: "string" },
    json: { type: "boolean", default: false },
    headed: { type: "boolean", default: false },
  },
});
if (!values.simc || !values.spec) {
  console.error('Usage: node scripts/qe-run.js --simc <file> --spec "Restoration Shaman" [--difficulty normal] [--json] [--headed]');
  process.exit(2);
}

const result = await runQeUpgradeFinder({
  simc: await readFile(values.simc, "utf8"),
  spec: values.spec,
  difficulties: values.difficulty ? [values.difficulty] : QE_DIFFICULTIES,
  headed: values.headed,
  onProgress: (step) => {
    if (values.json) return;
    console.log(step.error
      ? `${step.difficulty.padEnd(7)} FAILED — ${step.error}`
      : `${step.difficulty.padEnd(7)} ${step.id}  ${step.rows} raid items`);
  },
});
if (values.json) console.log(JSON.stringify(result, null, 2));
process.exit(result.reports.length ? 0 : 1);
