// Resubmit a raider's stored /simc export, without asking them to paste again.
//
//   npm run sim:rerun -- --character Rapunzele
//   npm run sim:rerun -- --character Rapunzele --spec "Augmentation Evoker"
//   npm run sim:rerun -- --character Rapunzele --no-wait
//
// A paste that fails after the snapshot step still leaves the export behind:
// logSimcAttempt forwards it and saveSimcExport_ writes it to SimcExports. That
// is the whole point of this script - the run can be redone from the sheet, so a
// raider who has logged off does not have to be chased for a second paste.
//
// Officer-gated, like every other read of that sheet: a /simc export names a
// character, realm and full gear. Set OFFICER_PASSPHRASE in .env, or pass
// --passphrase.
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { loadEnv } from "../src/env.js";
import { droptimizerPayload, raidbotDifficulty } from "../src/raidbots.js";

// The name is accepted bare as well as behind --character. "npm run sim:rerun --
// Rapunzele" is what anyone types first, and parseArgs' default is to abort on
// it rather than use it.
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    character: { type: "string" },
    spec: { type: "string" },
    difficulty: { type: "string" },
    wait: { type: "boolean", default: true },
    "no-wait": { type: "boolean", default: false },
    passphrase: { type: "string" },
  },
});

const wanted = values.character || positionals[0];
if (!wanted) {
  console.error("Which raider? npm run sim:rerun -- Rapunzele");
  process.exit(2);
}

await loadEnv();
const config = JSON.parse(await readFile("public/app-config.json", "utf8"));
const api = String(config.wishlistApiUrl || "").trim();
if (!api) {
  console.error("No wishlistApiUrl in public/app-config.json.");
  process.exit(2);
}

// Apps Script answers /exec with a 302, and a 302 turns a POST into a GET. When
// that redirect resolves back to the script, doGet answers with the board's own
// payload and the write never runs - which is exactly how Rapunzele's paste was
// lost. It is ok:true with no error, so it has to be recognised by shape.
const servedByBoardRead = (result) =>
  Boolean(result && result.ok && !result.error && (result.wishlists || result.simcSnapshots));

const post = async (payload) => {
  const send = () => fetch(api, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    redirect: "follow",
  });
  // Same two shapes the board retries: the board read, and a web page from a
  // redirect hop that never reached the script. Neither ran the write.
  let result, unreached;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    const response = await send();
    const text = await response.text();
    try {
      result = JSON.parse(text);
    } catch {
      unreached = new Error(`${payload.action}: Google returned a web page instead of data (HTTP ${response.status}) - the script was not reached.`);
      continue;
    }
    if (!servedByBoardRead(result)) break;
    unreached = undefined;
  }
  if (unreached) throw unreached;
  if (servedByBoardRead(result))
    throw new Error("Google kept answering with the board's own data instead of running the request. Nothing was submitted; try again in a minute.");
  if (!result.ok) throw new Error(result.error || "Apps Script rejected the request.");
  return result;
};

const passphrase = values.passphrase || process.env.OFFICER_PASSPHRASE;
if (!passphrase) {
  console.error("An officer passphrase is required. Set OFFICER_PASSPHRASE in .env, or pass --passphrase.");
  process.exit(2);
}

const board = JSON.parse(await readFile("public/loot-data.json", "utf8"));
const character = (board.characters || []).find((c) => c.name.toLowerCase() === wanted.toLowerCase());
if (!character) {
  console.error(`No character named "${wanted}" on the board.`);
  process.exit(1);
}

const { token } = await post({ action: "officerLogin", passphrase });
const stored = await post({ action: "getSimcExport", token, characterId: character.id });
// The spec the export was pasted under, not the character's default: a raider
// who simmed an offspec meant to sim it.
const spec = values.spec || stored.lootSpec;
if (!spec) {
  console.error("The stored export has no loot spec recorded. Pass --spec \"<Spec Class>\".");
  process.exit(1);
}

console.log(`${stored.characterName} · ${spec} · export captured ${stored.capturedAt}`);
if (values.spec && stored.lootSpec && values.spec !== stored.lootSpec)
  console.log(`  (overriding the pasted spec, which was ${stored.lootSpec})`);

const difficulties = values.difficulty ? [values.difficulty] : ["normal", "heroic", "mythic"];
for (const difficulty of difficulties) {
  if (!raidbotDifficulty[difficulty]) {
    console.error(`Unknown difficulty "${difficulty}". Use normal, heroic or mythic.`);
    process.exit(2);
  }
}

const jobs = [];
for (const difficulty of difficulties) {
  const label = raidbotDifficulty[difficulty].label;
  process.stdout.write(`  ${label.padEnd(7)} submitting… `);
  const result = await post({
    action: "submitDroptimizer",
    characterId: character.id,
    payload: droptimizerPayload(stored.simc, character, spec, difficulty),
  });
  if (!result.simId) throw new Error(`${label}: Raidbots returned no simId.`);
  jobs.push({ difficulty, label, simId: result.simId, url: result.reportUrl });
  console.log(result.reportUrl);
}

if (values["no-wait"] || !values.wait) {
  console.log("\nSubmitted. Apps Script recorded these as pending sims, so its trigger finishes the WoWAudit upload on its own.");
  process.exit(0);
}

// Same handoff the board does, so the sims land on WoWAudit now rather than
// whenever the trigger next runs. The trigger is still the backstop if this
// script is interrupted - recordPendingSim_ has already logged them.
console.log("\nWaiting for Raidbots, then uploading to WoWAudit. Ctrl-C is safe; the Apps Script trigger finishes anything left.");
for (const job of jobs) {
  let done = false;
  for (let attempt = 0; attempt < 80 && !done; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 15000));
    const status = await post({
      action: "checkDroptimizer", simId: job.simId, upload: true,
      characterId: character.id, characterName: character.name,
      configurationName: "Single Target", replaceManualEdits: false,
    });
    if (status.state === "failed") throw new Error(`${job.label}: ${status.error || "Raidbots simulation failed"}`);
    if (status.state === "uploaded") done = true;
  }
  console.log(`  ${job.label.padEnd(7)} ${done ? "uploaded to WoWAudit" : "still running - the trigger will finish it"}`);
}
