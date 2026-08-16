import test from "node:test";
import assert from "node:assert/strict";
import { currentCatalystBalance, hasCurrencyData, parseSimcSnapshot } from "../src/simc-snapshot.js";

test("extracts bag, vault, catalyst, and crest snapshot data", () => {
  const text = `hunter="Example"
spec=beast_mastery
# loot_spec=beast_mastery
### Gear from Bags
#
# Tier Base (292)
# head=,id=1001,bonus_id=12833/6652
### Weekly Reward Choices
#
# Vault Tier (305)
# hands=,id=1002,bonus_id=12841/6652
### End of Weekly Reward Choices
### Additional Character Info
# catalyst_currencies=3378:3/3465:2/3116:8
# upgrade_currencies=c:3444:100/c:3445:38/c:3446:9/i:274476:1`;
  const result = parseSimcSnapshot(text, "2026-08-16T12:00:00.000Z");
  assert.equal(result.character, "Example");
  assert.deepEqual(result.bags[0], { itemId: 1001, name: "Tier Base", slot: "HEAD", itemLevel: 292, bonusList: [12833, 6652] });
  assert.deepEqual(result.vault[0], { itemId: 1002, name: "Vault Tier", slot: "HANDS", itemLevel: 305, bonusList: [12841, 6652] });
  assert.equal(result.catalystCurrencies[3378], 3);
  assert.equal(result.upgradeCurrencies[3446], 9);
});

test("reads Venomblight Manaflux, never last season's leftover charges", () => {
  // 3378 (Dawnlight) lingers on characters that played Season 1.
  assert.deepEqual(currentCatalystBalance(null, { 3378: 4, 3465: 2, 3116: 8 }), { id: 3465, quantity: 2 });
  // Leftovers only: report zero Venomblight rather than 4 unusable Dawnlight.
  assert.deepEqual(currentCatalystBalance(null, { 3378: 4 }), { id: 3465, quantity: 0 });
  assert.deepEqual(currentCatalystBalance(null, {}), { id: 3465, quantity: 0 });
  assert.deepEqual(currentCatalystBalance(null, undefined), { id: 3465, quantity: 0 });
  // A future season's currency still takes over without a code change.
  assert.deepEqual(currentCatalystBalance(null, { 3465: 2, 3599: 1 }), { id: 3599, quantity: 1 });
});

test("an export with no currency ids is missing data, not holding zero", () => {
  // Galsnipes' real shape: only crest-granting items came through.
  assert.equal(hasCurrencyData({ upgradeCurrencies: { 231756: 1, 231769: 1, 232875: 21 } }), false);
  // Tamagotchi's: currencies present alongside items.
  assert.equal(hasCurrencyData({ upgradeCurrencies: { 1792: 11046, 3444: 90, 232875: 9 } }), true);
  // Genuinely holding zero still counts as captured data.
  assert.equal(hasCurrencyData({ upgradeCurrencies: { 3444: 0 } }), true);
  assert.equal(hasCurrencyData({ upgradeCurrencies: {} }), false);
  assert.equal(hasCurrencyData(null), false);
});
