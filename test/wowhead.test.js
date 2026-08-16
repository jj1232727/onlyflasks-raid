import assert from "node:assert/strict";
import test from "node:test";
import { parseUpgradeTrack } from "../src/wowhead.js";

test("parses an exact upgrade track and rank from a tooltip", () => {
  const tooltip = '<span>Item Level 308</span><br><span>Upgrade Level: Champion <!--uindex-->6/6</span>';
  assert.deepEqual(parseUpgradeTrack(tooltip), { track: "Champion", rank: "6/6" });
});

test("returns null for items without an upgrade track", () => {
  assert.equal(parseUpgradeTrack("<span>Item Level 1</span>"), null);
});
