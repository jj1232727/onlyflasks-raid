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
  try {
    await page.goto(FINDER_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(6000);

    await page.evaluate(() => {
      const avatar = [...document.querySelectorAll("img")]
        .find((img) => /paladin|priest|druid|shaman|monk|evoker/i.test(img.alt || ""));
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
    if (!picked) throw new Error(`QE Live does not offer "${spec}" — it covers healer specs only.`);
    await page.waitForTimeout(2500);

    await clickButton("^import gear$");
    const box = '[role="dialog"] textarea:not([aria-hidden="true"])';
    await page.waitForSelector(box, { timeout: 30000 });
    await page.locator(box).first().click();
    await page.keyboard.insertText(simc);
    await page.waitForTimeout(700);
    // "Auto Catalyze" is OFF by default, so QE scores a catalyst piece as zero
    // — it never considers the converted item. The guild does catalyse, so a
    // report without this understates every tier target that comes from a base.
    // "Upgrade ALL to Max Level" stays off on purpose: loot council ranks gear
    // as it drops, not as it would be after crests.
    const catalyzed = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const box = [...dialog.querySelectorAll('input[type="checkbox"]')]
        .find((cb) => /auto catalyze/i.test(cb.closest("label")?.innerText || ""));
      if (!box) return "missing";
      if (!box.checked) box.click();
      return box.checked;
    });
    if (catalyzed !== true) throw new Error(`QE Live: could not enable Auto Catalyze (${catalyzed}).`);
    await page.waitForTimeout(400);
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
