// Drives QE Live's Upgrade Finder in a real browser.
//
// QE has no server-side sim: its page computes the report locally and uploads
// the finished object, so turning a /simc into QE scores means doing what a
// healer would do by hand. About 25 seconds per difficulty.
//
// Three details cost real effort to find and must not be "simplified" away:
//   * The spec MUST be selected before importing. QE opens on Holy Paladin and
//     silently discards a mismatched export, leaving the dialog open.
//   * MUI Select opens on mousedown, not click.
//   * The import textarea is React-controlled, so only a real paste
//     (keyboard.insertText) updates it. Setting .value does not, native setter
//     included.
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
//   Upgrade ALL to Max     OFF — council ranks gear as it drops, not as it would
//                                be after crests nobody has spent yet.
//   Upgrade Vault to Max   OFF — bonus rolls and the vault are not a council
//                                call at all.
//
// The two OFF switches only add report sections; qeRaidScores reads "drop" rows
// only, so failing to set them is untidy rather than wrong.
const DIALOG_SETTINGS = [
  { label: /auto catalyze/, want: true, required: true },
  { label: /upgrade all to max/, want: false, required: false },
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
  // Wait for the page to actually be ready, but never longer than the blind
  // sleep this replaces. QE's own compute takes about a second; nearly all the
  // wall clock used to be us guessing how long their React took to settle. If a
  // condition never comes true we are no slower than before, and the step that
  // follows fails with its own message rather than a timeout here.
  const settle = (fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }).catch(() => {});
  try {
    await page.goto(FINDER_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await settle(() => [...document.querySelectorAll("img")]
      .some((img) => /paladin|priest|druid|shaman|monk|evoker/i.test(img.alt || "")), null, 6000);

    await page.evaluate(() => {
      const avatar = [...document.querySelectorAll("img")]
        .find((img) => /paladin|priest|druid|shaman|monk|evoker/i.test(img.alt || ""));
      let control = avatar;
      while (control && !/MuiFormControl-root/.test(control.className || "")) control = control.parentElement;
      control.querySelector(".MuiSelect-select")
        .dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    });
    await settle(() => document.querySelectorAll("li[data-value]").length > 0, null, 1000);
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
    await settle(() => (document.querySelector('[role="dialog"] textarea')?.value || "").length > 100, null, 700);
    const wanted = DIALOG_SETTINGS.map(({ label, want }) => ({ source: label.source, want }));
    await page.evaluate((settings) => {
      const dialog = document.querySelector('[role="dialog"]');
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
          box = [...dialog.querySelectorAll('input[type="checkbox"]')]
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
      console.warn(`  note: QE Live "${source}" could not be set to ${want} (${state}).`);
    }
    await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      [...dialog.querySelectorAll("button")].find((b) => /submit/i.test(b.innerText))?.click();
    });
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
  const reports = [], failures = [];
  try {
    for (const difficulty of difficulties) {
      try {
        const result = await runOne(browser, { simc, spec, difficulty });
        reports.push(result);
        onProgress?.(result);
      } catch (error) {
        failures.push({ difficulty, error: error.message });
        onProgress?.({ difficulty, error: error.message });
      }
    }
  } finally {
    await browser.close();
  }
  return { ok: failures.length === 0, reports, failures };
}
