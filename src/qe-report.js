// Questionably Epic (QE Live) Upgrade Finder reports — the healer equivalent of
// a Raidbots droptimizer.
//
// QE computes in the browser and POSTs the finished report to its own API, so
// there is nothing to submit and poll the way Raidbots works. A finished report
// is public and readable by id:
//
//   GET https://questionablyepic.com/api/getUpgradeReport.php?reportID=<id>
//
// That endpoint sends access-control-allow-origin: *, so the board can read it
// directly without a proxy. Two quirks: the parameter is reportID (id= returns
// an empty body), and the response is double-encoded — a JSON string containing
// the JSON document.

export const QE_REPORT_API = "https://questionablyepic.com/api/getUpgradeReport.php";

// Confirmed by running all three through QE and comparing drop item levels to
// the board's own table: 1 -> 292/295/298/302, 2 -> 305/308/311/315,
// 3 -> 318/321/324. Not inferred.
export const QE_RAID_DIFFICULTY = { 1: "normal", 2: "heroic", 3: "mythic" };

// Accepts a bare id, a report URL, or a full API URL.
export function qeReportId(value) {
  const input = String(value || "").trim();
  if (!input) throw new Error("A QE Live report link or id is required.");
  if (/^[A-Za-z0-9_-]{6,40}$/u.test(input)) return input;
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Enter a valid QE Live report link or id.");
  }
  if (!/(^|\.)questionablyepic\.com$/iu.test(url.hostname))
    throw new Error("The report link must be on questionablyepic.com.");
  const fromQuery = url.searchParams.get("reportID") || url.searchParams.get("report") || url.searchParams.get("id");
  if (fromQuery && /^[A-Za-z0-9_-]{6,40}$/u.test(fromQuery)) return fromQuery;
  const fromPath = url.pathname.split("/").filter(Boolean).pop();
  if (fromPath && /^[A-Za-z0-9_-]{6,40}$/u.test(fromPath)) return fromPath;
  throw new Error("Could not find a report id in that link.");
}

export const qeReportUrl = (value) => `${QE_REPORT_API}?reportID=${encodeURIComponent(qeReportId(value))}`;

// The API answers with a JSON string wrapping the document, but tolerate a
// plain object too in case that is ever fixed.
export function parseQeReport(payload) {
  let report = payload;
  for (let pass = 0; pass < 2 && typeof report === "string"; pass++) report = JSON.parse(report);
  if (!report || typeof report !== "object" || !Array.isArray(report.results))
    throw new Error("That does not look like a QE Live upgrade report.");
  return report;
}

// Percentage gain per item, for one raid difficulty.
//
// Each item appears up to three times, matching the three sections QE prints
// per difficulty: "drop" is plain "Normal", the item at the level it actually
// drops at; "max" is "Normal - Upgraded", the same item after crests; "bonus" is
// "Normal - Upgraded Bonus Rolls", vault level.
//
// "max" is the row to read, because it is the only one that matches the other
// half of the board. The Raidbots droptimizer is submitted at Champion 6/6, Hero
// 6/6 and Myth 6/6 (raidbotDifficulty in App.tsx) — every drop evaluated at the
// top of its track — and QE's "max" rows land on exactly those item levels: 308,
// 321, 334. Reading "drop" scored healers at the raw 292-315 an item lands on
// while every DPS beside them was scored fully upgraded, in the same column, so
// healers came out systematically understated. Bonus rolls stay out: the vault
// is not a council call.
export function qeRaidScores(report, difficulty = "normal") {
  const parsed = parseQeReport(report),
    scores = new Map();
  for (const row of parsed.results) {
    if (row?.dropLoc !== "Raid" || row?.dropType !== "max") continue;
    if (QE_RAID_DIFFICULTY[row.dropDifficulty] !== difficulty) continue;
    const itemId = Number(row.item),
      percent = Number(row.percDiff);
    if (!Number.isFinite(itemId) || !Number.isFinite(percent)) continue;
    // A report can list the same item at several boss item levels; keep the best.
    if (!scores.has(itemId) || percent > scores.get(itemId)) scores.set(itemId, percent);
  }
  return scores;
}

// Everything the board needs to store and display one report.
export function qeReportSummary(payload) {
  const report = parseQeReport(payload),
    difficulties = {};
  for (const difficulty of Object.values(QE_RAID_DIFFICULTY)) {
    const scores = qeRaidScores(report, difficulty);
    if (scores.size) difficulties[difficulty] = Object.fromEntries(scores);
  }
  return {
    id: String(report.id || ""),
    character: String(report.playername || ""),
    realm: String(report.realm || ""),
    region: String(report.region || ""),
    spec: String(report.spec || ""),
    contentType: String(report.contentType || ""),
    // QE sends an RFC-1123 string; normalise so it sorts and ages like the rest.
    capturedAt: Number.isFinite(Date.parse(report.timeCreated))
      ? new Date(report.timeCreated).toISOString()
      : "",
    difficulties,
  };
}
