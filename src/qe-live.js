// Drives QE Live's Upgrade Finder in a real browser.
//
// QE has no server-side sim: its page computes the report locally and uploads
// the finished object, so turning a /simc into QE scores means doing what a
// healer would do by hand. About 8 seconds per difficulty, and the three run
// together, so a character costs about 9 seconds.
//
// Four details cost real effort to find and must not be "simplified" away:
//   * The spec MUST be selected before importing. QE opens on Holy Paladin and
//     silently discards a mismatched export, leaving the dialog open.
//   * MUI Select opens on mousedown, not click.
//   * The import textarea is React-controlled, so only a real paste
//     (keyboard.insertText) updates it. Setting .value does not, native setter
//     included.
//   * A run replaces the finder with its report, and the difficulty buttons go
//     with it. Re-opening the finder keeps the spec but drops the imported
//     character, and Go! then produces nothing — so one difficulty means one
//     page and one import. Measured; do not try to loop difficulties on a page.
import { chromium } from "playwright-core";

export const QE_DIFFICULTIES = ["normal", "heroic", "mythic"];
// Confirmed against the board's own item level table, not inferred.
export const QE_DIFFICULTY_CODE = { normal: 1, heroic: 2, mythic: 3 };
const FINDER_URL = "https://questionablyepic.com/live/upgradefinder";
// The import dialog carries three switches, and QE's defaults are not the
// question loot council is asking. Pin all three so a report means one thing
// no matter what QE ships as default:
//
//   Auto Catalyze          ON  — the guild catalyses, so a tier target has to be
//                                scored through the base that drops. Off, QE
//                                never considers the converted item. This one is
//                                required: it moves the numbers the board ranks
//                                on, so a run that cannot set it is worthless.
//   Upgrade ALL to Max     ON  — asked for: rank drops at what they become once
//                                upgraded, not at the level they land on.
//   Upgrade Vault to Max   OFF — bonus rolls and the vault are not a council
//                                call at all.
//
// Read off the dialog on 2026-08-17, QE's own defaults are Auto Catalyze off,
// Upgrade ALL to Max off, Upgrade Vault to Max ON, so two of the three are ours
// to set on every run.
//
// Only Auto Catalyze is required. Checked against report midrdwqdanqb, run with
// both upgrade switches OFF: the uploaded payload still carried all three
// sections — 37 Raid "drop" rows, 37 "max", 37 "bonus". So these two switches
// decide what QE's own page shows, not what it uploads, and which numbers reach
// the board is decided by qeRaidScores picking a dropType. Set them anyway, so a
// healer reading the report by hand sees what the board ranks on.
const DIALOG_SETTINGS = [
  { label: /auto catalyze/, want: true, required: true },
  { label: /upgrade all to max/, want: true, required: false },
  { label: /upgrade vault to max/, want: false, required: false },
];

async function runOne(browser, { simc, spec, difficulty }) {
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
        const button = [...document.querySelectorAll("button")]
          .filter(visible)
          .find((el) => rx.test((el.innerText || "").trim()));
        if (!button) return false;
        button.click();
        return true;
      }, pattern);
      if (hit) return;
      await page.waitForTimeout(500);
    }
    throw new Error(`QE Live: no "${pattern}" button — their page layout may have changed.`);
  };
  // Wait for the thing we actually need, and wait generously. These exit the
  // moment the condition holds, so a long ceiling costs nothing when the page is
  // quick — it only decides how bad a slow runner is allowed to get before we
  // call it. Capping these at the old blind sleeps was a mistake: three pages
  // loading at once on a 2-vCPU runner blew past 6s, settle gave up quietly, and
  // the next line died on a null with no clue why.
  const settle = (fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }).catch(() => {});
  try {
    await page.goto(FINDER_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await settle(() => [...document.querySelectorAll("img")]
      .some((img) => /paladin|priest|druid|shaman|monk|evoker/i.test(img.alt || "")), null, 30000);

    // Say which step failed. A bare TypeError out of page.evaluate tells whoever
    // reads the log nothing at all.
    const opened = await page.evaluate(() => {
      const avatar = [...document.querySelectorAll("img")]
        .find((img) => /paladin|priest|druid|shaman|monk|evoker/i.test(img.alt || ""));
      if (!avatar) return "no spec avatar";
      let control = avatar;
      while (control && !/MuiFormControl-root/.test(control.className || "")) control = control.parentElement;
      const select = control && control.querySelector(".MuiSelect-select");
      if (!select) return "no spec dropdown";
      select.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      return true;
    });
    if (opened !== true) throw new Error(`QE Live: ${opened} — the page never finished loading.`);
    await settle(() => document.querySelectorAll("li[data-value]").length > 0, null, 10000);
    const picked = await page.evaluate((name) => {
      const option = [...document.querySelectorAll("li")].find((li) => li.getAttribute("data-value") === name);
      if (!option) return false;
      option.click();
      return true;
    }, spec);
    if (!picked) throw new Error(`QE Live does not offer "${spec}" — it covers healer specs only.`);
    // The one blind sleep left. Picking a spec makes QE rebuild its default
    // character, and importing before that lands is exactly how the export gets
    // silently discarded (see the header). There is no visible signal for "the
    // rebuild finished", so shaving this would trade a real failure for 2s.
    await page.waitForTimeout(2500);

    await clickButton("^import gear$");
    const box = '[role="dialog"] textarea:not([aria-hidden="true"])';
    await page.waitForSelector(box, { timeout: 30000 });
    await page.locator(box).first().click();
    await page.keyboard.insertText(simc);
    await settle(() => (document.querySelector('[role="dialog"] textarea')?.value || "").length > 100, null, 5000);
    const wanted = DIALOG_SETTINGS.map(({ label, want }) => ({ source: label.source, want }));
    await page.evaluate((settings) => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return;
      for (const { source, want } of settings) {
        const rx = new RegExp(source, "i"),
          box = [...dialog.querySelectorAll('input[type="checkbox"]')]
            .find((cb) => rx.test(cb.closest("label")?.innerText || ""));
        if (box && box.checked !== want) box.click();
      }
    }, wanted);
    // A checkbox flips .checked synchronously, before React has processed the
    // change, so the click is not proof the setting took. Wait for a fresh read
    // to agree — that both confirms it and gives React its beat, without
    // sleeping a fixed amount and hoping.
    const readSettings = (settings) => {
      const dialog = document.querySelector('[role="dialog"]');
      return settings.map(({ source, want }) => {
        const rx = new RegExp(source, "i"),
          box = dialog && [...dialog.querySelectorAll('input[type="checkbox"]')]
            .find((cb) => rx.test(cb.closest("label")?.innerText || ""));
        return { source, want, state: box ? box.checked : "missing" };
      });
    };
    let applied = [];
    for (let attempt = 0; attempt < 10; attempt++) {
      applied = await page.evaluate(readSettings, wanted);
      if (applied.every((x) => x.state === x.want)) break;
      await page.waitForTimeout(100);
    }
    for (const { source, want, state } of applied.filter((x) => x.state !== x.want)) {
      if (DIALOG_SETTINGS.find((x) => x.label.source === source).required)
        throw new Error(`QE Live: could not set "${source}" to ${want} (${state}).`);
      // Not fatal: these two only add report sections the board never reads.
      // Name the difficulty — the three runs log over each other.
      console.warn(`  note: ${difficulty} — QE Live "${source}" could not be set to ${want} (${state}).`);
    }
    const submitted = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const button = dialog && [...dialog.querySelectorAll("button")].find((b) => /submit/i.test(b.innerText));
      if (!button) return false;
      button.click();
      return true;
    });
    if (!submitted) throw new Error("QE Live: the import dialog had no Submit button.");
    // A good import closes the dialog; a rejected one leaves it sitting there.
    // That is the signal itself, so watch for it rather than sleeping through
    // the worst case and then asking. Accepting takes well under a second.
    await page
      .waitForSelector('[role="dialog"]', { state: "detached", timeout: 30000 })
      .catch(() => { throw new Error("QE Live rejected the /simc import — the dialog stayed open."); });

    await clickButton(`^${difficulty}$`);
    await page.waitForTimeout(1200);
    await clickButton("^go!$");
    for (let i = 0; i < 120 && !uploaded; i++) await page.waitForTimeout(500);
    if (!uploaded) throw new Error("QE Live produced no report within 60s.");

    const rows = (uploaded.results || []).filter(
      (row) =>
        row.dropLoc === "Raid" &&
        row.dropType === "drop" &&
        row.dropDifficulty === QE_DIFFICULTY_CODE[difficulty],
    );
    if (!rows.length) throw new Error(`QE returned no ${difficulty} raid rows.`);
    return {
      difficulty,
      id: String(uploaded.id || ""),
      character: String(uploaded.playername || ""),
      spec: String(uploaded.spec || ""),
      rows: rows.length,
    };
  } finally {
    await page.close();
  }
}

export async function runQeUpgradeFinder({ simc, spec, difficulties = QE_DIFFICULTIES, headed = false, onProgress }) {
  if (!simc || simc.length < 100) throw new Error("A complete /simc export is required.");
  if (!spec) throw new Error("A healer spec is required.");
  // Locally we use the installed Chrome; CI runners have no "chrome" channel
  // and rely on the browser playwright downloads instead.
  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: !headed });
  } catch {
    browser = await chromium.launch({ headless: !headed });
  }
  // The difficulties run at once, on a page each. Measured against this same
  // export: 23.6s sequential, 9.0s together, with each page taking 8.3s rather
  // than 7.8s — so they barely contend. They are wholly independent anyway,
  // since each one imports the gear itself, and a page owns its own upload
  // listener, so a failure stays with its own difficulty.
  //
  // A CI runner has fewer cores than the machine that was measured on and will
  // not see the full 2.6x, but three pages waiting on QE's page load and its
  // one second of compute is not what saturates a runner.
  let outcomes;
  try {
    outcomes = await Promise.all(difficulties.map(async (difficulty) => {
      try {
        const report = await runOne(browser, { simc, spec, difficulty });
        onProgress?.(report);
        return { report };
      } catch (error) {
        const failure = { difficulty, error: error.message };
        onProgress?.(failure);
        return { failure };
      }
    }));
  } finally {
    await browser.close();
  }
  // Promise.all preserves order, so both lists stay in difficulty order.
  const reports = outcomes.flatMap((x) => (x.report ? [x.report] : [])),
    failures = outcomes.flatMap((x) => (x.failure ? [x.failure] : []));
  return { ok: failures.length === 0, reports, failures };
}
