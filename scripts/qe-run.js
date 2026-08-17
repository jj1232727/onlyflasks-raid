// Run QE Live's Upgrade Finder for a healer and return the report ids.
//
// QE has no server-side sim: its page computes the report in the browser and
// then uploads the finished object. So the only way to turn a /simc into QE
// scores is to drive that page. This does exactly what a healer would do by
// hand, headlessly, in about 25 seconds per difficulty.
//
//   node scripts/qe-run.js --simc <file> --spec "Restoration Shaman"
//
// Three details cost real time to find, so do not "simplify" them away:
//   * The spec MUST be selected before importing. QE opens on Holy Paladin and
//     silently refuses a mismatched export - the dialog just stays open.
//   * MUI Select opens on mousedown, not click.
//   * The textarea is React-controlled; only a real paste (keyboard.insertText)
//     updates its state. Setting .value, even with the native setter, does not.
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";

const DIFFICULTIES = ["normal", "heroic", "mythic"];
// Confirmed by running all three: QE's dropDifficulty maps 1/2/3 and its drop
// item levels match the board's own table exactly.
const QE_DIFFICULTY_CODE = { normal: 1, heroic: 2, mythic: 3 };

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
  console.error('Usage: node scripts/qe-run.js --simc <file> --spec "Restoration Shaman" [--difficulty normal] [--json]');
  process.exit(2);
}
const simc = await readFile(values.simc, "utf8");
const wanted = values.difficulty ? [values.difficulty] : DIFFICULTIES;

const log = (...a) => { if (!values.json) console.log(...a); };

async function runOne(browser, spec, difficulty) {
  const page = await browser.newPage();
  let uploaded = null;
  page.on("request", (request) => {
    if (!request.url().includes("addUpgradeReport.php")) return;
    try { uploaded = JSON.parse(request.postData() || "{}"); } catch { /* not our payload */ }
  });
  const clickButton = async (pattern, tries = 40) => {
    for (let attempt = 0; attempt < tries; attempt++) {
      const hit = await page.evaluate((source) => {
        const rx = new RegExp(source, "i"),
          visible = (el) => el.getBoundingClientRect().height > 0;
        const button = [...document.querySelectorAll("button")].filter(visible)
          .find((el) => rx.test((el.innerText || "").trim()));
        if (!button) return false;
        button.click();
        return true;
      }, pattern);
      if (hit) return;
      await page.waitForTimeout(500);
    }
    throw new Error(`QE Live: no "${pattern}" button — the page layout may have changed.`);
  };
  try {
    await page.goto("https://questionablyepic.com/live/upgradefinder", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(6000);

    // Spec first, or the import is discarded.
    await page.evaluate(() => {
      const avatar = [...document.querySelectorAll("img")].find((i) => /paladin|priest|druid|shaman|monk|evoker/i.test(i.alt || ""));
      let control = avatar;
      while (control && !/MuiFormControl-root/.test(control.className || "")) control = control.parentElement;
      control.querySelector(".MuiSelect-select")
        .dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(1000);
    const picked = await page.evaluate((name) => {
      const option = [...document.querySelectorAll("li")].find((li) => li.getAttribute("data-value") === name);
      if (!option) return false;
      option.click();
      return true;
    }, spec);
    if (!picked) throw new Error(`QE Live does not offer "${spec}" — healer specs only.`);
    await page.waitForTimeout(2500);

    await clickButton("^import gear$");
    const box = '[role="dialog"] textarea:not([aria-hidden="true"])';
    await page.waitForSelector(box, { timeout: 30000 });
    await page.locator(box).first().click();
    await page.keyboard.insertText(simc);
    await page.waitForTimeout(700);
    await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      [...dialog.querySelectorAll("button")].find((b) => /submit/i.test(b.innerText))?.click();
    });
    await page.waitForTimeout(8000);
    if (await page.evaluate(() => Boolean(document.querySelector('[role="dialog"]'))))
      throw new Error("QE Live rejected the /simc import — the dialog stayed open.");

    await clickButton(`^${difficulty}$`);
    await page.waitForTimeout(1200);
    await clickButton("^go!$");
    for (let i = 0; i < 120 && !uploaded; i++) await page.waitForTimeout(500);
    if (!uploaded) throw new Error("QE Live produced no report within 60s.");

    const rows = (uploaded.results || []).filter(
      (r) => r.dropLoc === "Raid" && r.dropType === "drop" && r.dropDifficulty === QE_DIFFICULTY_CODE[difficulty],
    );
    if (!rows.length) throw new Error(`QE returned no ${difficulty} raid rows.`);
    return { difficulty, id: String(uploaded.id || ""), character: String(uploaded.playername || ""), spec: String(uploaded.spec || ""), rows: rows.length };
  } finally {
    await page.close();
  }
}

const browser = await chromium.launch({ channel: "chrome", headless: !values.headed });
const reports = [], failures = [];
try {
  for (const difficulty of wanted) {
    try {
      const result = await runOne(browser, values.spec, difficulty);
      reports.push(result);
      log(`${difficulty.padEnd(7)} ${result.id}  ${result.rows} raid items`);
    } catch (error) {
      failures.push({ difficulty, error: error.message });
      log(`${difficulty.padEnd(7)} FAILED — ${error.message}`);
    }
  }
} finally {
  await browser.close();
}
if (values.json) console.log(JSON.stringify({ ok: failures.length === 0, reports, failures }, null, 2));
process.exit(reports.length ? 0 : 1);
