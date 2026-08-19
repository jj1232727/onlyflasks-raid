// Drain the QE queue: for every healer waiting, drive QE Live and save the
// scores back to the board.
//
//   npm run qe:sync            # run everything pending
//   npm run qe:sync -- --dry   # show what would run
//
// The board cannot do this itself: it is a static page, and QE only computes
// inside a browser. This is the piece that makes "paste /simc" enough.
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { QE_DIFFICULTIES, runQeUpgradeFinder } from "../src/qe-live.js";
import { qeReportSummary, qeReportUrl } from "../src/qe-report.js";

const { values } = parseArgs({
  options: {
    dry: { type: "boolean", default: false },
    headed: { type: "boolean", default: false },
    // CI asks this first so an empty queue never downloads a browser.
    count: { type: "boolean", default: false },
  },
});

const config = JSON.parse(await readFile("public/app-config.json", "utf8"));
const api = String(config.wishlistApiUrl || "").trim();
if (!api) { console.error("No wishlistApiUrl in public/app-config.json."); process.exit(2); }

const post = async (payload, expect = null, attempt = 1) => {
  const response = await fetch(api, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    redirect: "follow",
  });
  const text = await response.text();
  // Apps Script answers with an HTML error page while a deployment is being
  // replaced, and calling .json() on that threw "Unexpected token '<'" - which
  // failed the whole workflow and said nothing about why. It is transient, so
  // wait it out before giving up, and if it persists say what actually arrived.
  if (!text.trimStart().startsWith("{")) {
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 4000));
      return post(payload, expect, attempt + 1);
    }
    throw new Error(`Apps Script returned ${response.status} and a non-JSON body (${text.trim().slice(0, 120)}...). It is usually mid-deployment; try again shortly.`);
  }
  const result = JSON.parse(text);
  if (!result.ok) {
    // An Apps Script without these actions falls through to the wishlist
    // writer, which complains about fields this payload never had.
    if (/characterId is required|lootSpec are required|Wishlist must contain/i.test(String(result.error || "")))
      throw new Error("The Apps Script deployment does not have the QE actions yet. Re-deploy google-apps-script/Code.gs, then run this again.");
    throw new Error(result.error || "Apps Script rejected the request.");
  }
  // ok:true with the payload missing has happened twice, transiently - and the
  // caller then died on "Cannot read properties of undefined", which names
  // neither the action nor the cause. Treat a missing field like a missing
  // body: wait, retry, and if it sticks say which action came back hollow.
  if (expect && result[expect] === undefined) {
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 4000));
      return post(payload, expect, attempt + 1);
    }
    throw new Error(`Apps Script answered ok but without "${expect}" for ${payload.action}. Re-deploy google-apps-script/Code.gs if this persists.`);
  }
  return result;
};

const { pending } = await post({ action: "getQePending" }, "pending");
if (values.count) { console.log(pending.length); process.exit(0); }
if (!pending.length) { console.log("Nothing queued."); process.exit(0); }
console.log(`${pending.length} healer${pending.length === 1 ? "" : "s"} queued.`);

if (values.dry) {
  for (const job of pending) console.log(`  ${job.characterName} · ${job.lootSpec} · ${job.state} · ${job.simc.length} chars`);
  process.exit(0);
}

let failed = 0;
for (const job of pending) {
  console.log(`\n${job.characterName} · ${job.lootSpec}`);
  await post({ action: "setQeQueueState", characterId: job.characterId, state: "running" }).catch(() => {});
  const run = await runQeUpgradeFinder({
    simc: job.simc,
    spec: job.lootSpec,
    difficulties: QE_DIFFICULTIES,
    headed: values.headed,
    onProgress: (step) => console.log(step.error ? `  ${step.difficulty.padEnd(7)} FAILED — ${step.error}` : `  ${step.difficulty.padEnd(7)} ${step.id}`),
  });
  if (!run.reports.length) {
    failed++;
    await post({ action: "setQeQueueState", characterId: job.characterId, state: "error", error: run.failures[0]?.error || "QE run failed" }).catch(() => {});
    continue;
  }
  // Merge every difficulty this run produced into one stored summary. Keep the
  // report id per difficulty as well as the last one: QE writes a separate
  // report per difficulty, so this is what lets the board link each score back
  // to the run behind it.
  const merged = { difficulties: {}, reportIds: {} };
  for (const report of run.reports) {
    const response = await fetch(qeReportUrl(report.id));
    const summary = qeReportSummary(await response.text());
    Object.assign(merged, summary, {
      difficulties: { ...merged.difficulties, ...summary.difficulties },
      reportIds: { ...merged.reportIds, ...Object.fromEntries(Object.keys(summary.difficulties).map((d) => [d, report.id])) },
    });
  }
  await post({
    action: "saveQeReport",
    characterId: job.characterId,
    characterName: job.characterName,
    lootSpec: job.lootSpec,
    report: merged,
  });
  console.log(`  saved: ${Object.keys(merged.difficulties).join(", ")}`);
}
console.log(failed ? `\n${failed} failed.` : "\nAll done.");
process.exit(failed ? 1 : 0);
