import test from "node:test";
import assert from "node:assert/strict";
import { QE_RAID_DIFFICULTY, parseQeReport, qeRaidScores, qeReportId, qeReportSummary, qeReportUrl } from "../src/qe-report.js";

// Trimmed from Tamagotchi's real Upgrade Finder report (id qbbtiduyaabc).
const report = {
  id: "qbbtiduyaabc",
  timeCreated: "Mon, 17 Aug 2026 04:20:12 GMT",
  playername: "Tamagotchi",
  realm: "Malganis",
  region: "US",
  spec: "Restoration Shaman",
  contentType: "Raid",
  results: [
    // Same item three ways: as it drops, fully upgraded, and at vault level.
    { item: 268196, dropLoc: "Raid", dropType: "drop", dropDifficulty: 1, level: 295, percDiff: 0.31 },
    { item: 268196, dropLoc: "Raid", dropType: "max", dropDifficulty: 1, level: 308, percDiff: 0.946 },
    { item: 268196, dropLoc: "Raid", dropType: "bonus", dropDifficulty: 1, level: 321, percDiff: 2.118 },
    { item: 268203, dropLoc: "Raid", dropType: "drop", dropDifficulty: 1, level: 292, percDiff: 0.52 },
    // Dungeon, crafted and delve rows must not leak into raid scoring.
    { item: 158366, dropLoc: "Dungeon", dropType: "drop", dropDifficulty: 7, level: 311, percDiff: 0.764 },
    { item: 237831, dropLoc: "Crafted", dropDifficulty: "", level: 331, percDiff: 3.108 },
    { item: 248583, dropLoc: "Delves", dropDifficulty: "", level: 285, percDiff: 0 },
  ],
};

test("raid scoring uses the item as it drops, not fully upgraded", () => {
  const scores = qeRaidScores(report, "normal");
  // 0.31 is the drop row; 0.946 and 2.118 are upgrades not yet paid for.
  assert.equal(scores.get(268196), 0.31);
  assert.equal(scores.get(268203), 0.52);
});

test("only raid rows count toward raid scores", () => {
  const scores = qeRaidScores(report, "normal");
  assert.equal(scores.size, 2, "dungeon, crafted and delve rows excluded");
  assert.equal(scores.has(158366), false);
  assert.equal(scores.has(237831), false);
});

test("a difficulty with no rows scores nothing rather than borrowing another's", () => {
  assert.equal(qeRaidScores(report, "heroic").size, 0);
  assert.equal(qeRaidScores(report, "mythic").size, 0);
});

test("QE difficulty numbers map onto the board's difficulties", () => {
  // Confirmed for Normal: QE's drop levels 292/295/298/302 are exactly the
  // board's levels.normal entries.
  assert.equal(QE_RAID_DIFFICULTY[1], "normal");
  assert.equal(QE_RAID_DIFFICULTY[2], "heroic");
  assert.equal(QE_RAID_DIFFICULTY[3], "mythic");
});

test("the best row wins when an item appears at several boss item levels", () => {
  const multi = { ...report, results: [
    { item: 999, dropLoc: "Raid", dropType: "drop", dropDifficulty: 1, level: 292, percDiff: 0.4 },
    { item: 999, dropLoc: "Raid", dropType: "drop", dropDifficulty: 1, level: 302, percDiff: 1.1 },
  ]};
  assert.equal(qeRaidScores(multi, "normal").get(999), 1.1);
});

test("the double-encoded API response is unwrapped", () => {
  // The endpoint returns a JSON string containing the JSON document.
  const wrapped = JSON.stringify(JSON.stringify(report));
  assert.equal(parseQeReport(wrapped).playername, "Tamagotchi");
  assert.equal(parseQeReport(JSON.stringify(report)).playername, "Tamagotchi");
  assert.equal(parseQeReport(report).playername, "Tamagotchi");
});

test("summary normalises the timestamp so it ages like everything else", () => {
  const s = qeReportSummary(report);
  assert.equal(s.capturedAt, "2026-08-17T04:20:12.000Z");
  assert.equal(s.character, "Tamagotchi");
  assert.equal(s.spec, "Restoration Shaman");
  assert.deepEqual(Object.keys(s.difficulties), ["normal"]);
});

test("report ids are accepted bare, as a report link, or as an API link", () => {
  for (const value of [
    "qbbtiduyaabc",
    "https://questionablyepic.com/live/upgradereport/qbbtiduyaabc",
    "https://questionablyepic.com/api/getUpgradeReport.php?reportID=qbbtiduyaabc",
  ]) assert.equal(qeReportId(value), "qbbtiduyaabc");
  assert.equal(qeReportUrl("qbbtiduyaabc"), "https://questionablyepic.com/api/getUpgradeReport.php?reportID=qbbtiduyaabc");
});

test("links off questionablyepic.com are refused", () => {
  assert.throws(() => qeReportId("https://raidbots.com/simbot/report/qbbtiduyaabc"), /questionablyepic\.com/);
  assert.throws(() => qeReportId(""), /required/);
  assert.throws(() => qeReportId("not a url"), /valid QE Live report/);
});

test("a non-report payload is rejected rather than scored as empty", () => {
  assert.throws(() => parseQeReport('{"ok":false}'), /upgrade report/);
});
