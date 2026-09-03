import { strict as assert } from "node:assert";
import test from "node:test";
import {
  parseSimcSnapshot,
  parseBonusRolls,
  bonusRollBalance,
  BONUS_ROLL_CURRENCIES,
} from "../src/simc-snapshot.js";

// Straight from a real 12.1.0-03 export. Field order is currency:source:context:
// keyLevel:itemId:spec, per the addon's bonusrolls.lua.
const EXPORT = `warlock="Gosu"
spec=demonology
### Additional Character Info
#
# bonus_roll_currencies=3418:2/3511:0
#
# bonus_roll_items=3418:278284:5:4:268265:266/3418:278286:5:2:270922:266
`;

test("reads each bonus roll into its named fields", () => {
  const rolls = parseBonusRolls(EXPORT);
  assert.equal(rolls.length, 2);
  assert.deepEqual(rolls[0], {
    currency: 3418, source: 278284, context: 5, keyLevel: 4, itemId: 268265, spec: 266,
  });
  // itemId is what was won, not the Voidcache that was rolled on - getting these
  // two the wrong way round would credit the raider with the wrong item.
  assert.equal(rolls[1].itemId, 270922);
  assert.equal(rolls[1].source, 278286);
});

test("balance comes from the usable currency", () => {
  const snapshot = parseSimcSnapshot(EXPORT);
  assert.deepEqual(bonusRollBalance(snapshot), { id: 3418, quantity: 2 });
});

test("a currency at zero is zero, not unknown", () => {
  const snapshot = parseSimcSnapshot(EXPORT.replace("3418:2", "3418:0"));
  assert.deepEqual(bonusRollBalance(snapshot), { id: 3418, quantity: 0 });
});

// The distinction the catalyst counter already makes: an export that never
// mentioned the currency did not report it, which is not the same as holding
// none, and must not render as a confident 0.
test("an export with no bonus roll line reports unknown", () => {
  const snapshot = parseSimcSnapshot(`warlock="Gosu"\nspec=demonology\n`);
  assert.equal(bonusRollBalance(snapshot).quantity, null);
});

test("only the currency Blizzard actually uses is named", () => {
  assert.ok(BONUS_ROLL_CURRENCIES[3418]);
  // 3511 is flagged "[DNT, Unused]" in the addon's own table and is always 0.
  assert.equal(BONUS_ROLL_CURRENCIES[3511], undefined);
});

test("a malformed entry is dropped rather than half-read", () => {
  assert.deepEqual(parseBonusRolls("# bonus_roll_items=3418:278284:5\n"), []);
  assert.equal(parseBonusRolls("# bonus_roll_items=\n").length, 0);
});

test("rolls survive a full snapshot parse", () => {
  const snapshot = parseSimcSnapshot(EXPORT);
  assert.equal(snapshot.bonusRolls.length, 2);
  assert.deepEqual(snapshot.bonusRollCurrencies, { 3418: 2, 3511: 0 });
});
