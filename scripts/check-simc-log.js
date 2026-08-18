// Read the /simc paste log, and pull back an export to reproduce a run.
//
//   npm run simc:log                          # recent attempts, newest first
//   npm run simc:log -- --failed              # only the ones that broke
//   npm run simc:log -- --character Zynszn    # one raider
//   npm run simc:log -- --export Zynszn       # print their stored /simc
//
// Both are officer-gated on purpose: a /simc export names a character, realm and
// full gear, and the board's own payload is public. Set OFFICER_PASSPHRASE in
// .env, or pass --passphrase.
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { loadEnv } from "../src/env.js";

const { values } = parseArgs({
  options: {
    failed: { type: "boolean", default: false },
    character: { type: "string" },
    export: { type: "string" },
    limit: { type: "string", default: "50" },
    passphrase: { type: "string" },
  },
});

await loadEnv();
const config = JSON.parse(await readFile("public/app-config.json", "utf8"));
const api = String(config.wishlistApiUrl || "").trim();
if (!api) {
  console.error("No wishlistApiUrl in public/app-config.json.");
  process.exit(2);
}

const post = async (payload) => {
  const response = await fetch(api, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    redirect: "follow",
  });
  const result = await response.json();
  if (!result.ok) {
    if (/does not have|is not a function|Unknown/i.test(String(result.error || "")))
      throw new Error("This Apps Script deployment predates the /simc log. Re-deploy google-apps-script/Code.gs.");
    throw new Error(result.error || "Apps Script rejected the request.");
  }
  return result;
};

const passphrase = values.passphrase || process.env.OFFICER_PASSPHRASE;
if (!passphrase) {
  console.error("An officer passphrase is required. Set OFFICER_PASSPHRASE in .env, or pass --passphrase.");
  process.exit(2);
}
const { token } = await post({ action: "officerLogin", passphrase });

if (values.export) {
  const board = JSON.parse(await readFile("public/loot-data.json", "utf8"));
  const match = board.characters.find((c) => c.name.toLowerCase() === values.export.toLowerCase());
  if (!match) {
    console.error(`No character named "${values.export}" on the board.`);
    process.exit(1);
  }
  const stored = await post({ action: "getSimcExport", token, characterId: match.id });
  console.error(`# ${stored.characterName} · ${stored.lootSpec} · captured ${stored.capturedAt}\n`);
  console.log(stored.simc);
  process.exit(0);
}

const { log } = await post({ action: "getSimcLog", token, limit: Number(values.limit) || 50 });
let rows = log;
if (values.failed) rows = rows.filter((row) => !row.ok);
if (values.character) rows = rows.filter((row) => row.characterName.toLowerCase() === values.character.toLowerCase());

if (!rows.length) {
  console.log("No matching paste attempts recorded.");
  process.exit(0);
}
for (const row of rows) {
  const when = row.at.replace("T", " ").slice(0, 19);
  console.log(
    `${when}  ${row.ok ? "OK    " : "FAILED"}  ${row.characterName.padEnd(16)}${(row.lootSpec || "(no spec)").padEnd(24)}${row.step.padEnd(16)}${row.detail}`,
  );
}
const failed = rows.filter((row) => !row.ok).length;
console.log(`\n${rows.length} attempt${rows.length === 1 ? "" : "s"}, ${failed} failed.`);
