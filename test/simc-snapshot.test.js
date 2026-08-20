import test from "node:test";
import assert from "node:assert/strict";
import { MIDNIGHT_S2_CRESTS, catalystUnknownReason, currentCatalystBalance, hasCurrencyData, inspectSimcExport, parseSimcSnapshot } from "../src/simc-snapshot.js";

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
  // The addon exports a zero balance for every catalyst currency it knows, so a
  // reported 0 is a real 0 and stays one.
  assert.deepEqual(currentCatalystBalance(null, { 3378: 4, 3465: 0 }), { id: 3465, quantity: 0 });
  // Leftovers only: the addon never asked about 3465, so the balance is unknown.
  // Reporting 0 here told the whole roster they could not catalyse while they
  // were spending charges - see currentCatalystBalance.
  assert.deepEqual(currentCatalystBalance(null, { 3378: 4 }), { id: 3465, quantity: null });
  assert.deepEqual(currentCatalystBalance(null, {}), { id: 3465, quantity: null });
  assert.deepEqual(currentCatalystBalance(null, undefined), { id: 3465, quantity: null });
  // A future season's currency still takes over without a code change.
  assert.deepEqual(currentCatalystBalance(null, { 3465: 2, 3599: 1 }), { id: 3599, quantity: 1 });
});

test("an unknown charge balance says why, and a captured one does not pretend", () => {
  assert.match(catalystUnknownReason(null), /No \/simc export captured/);
  const pasted = parseSimcSnapshot(`hunter="Galsnipes"
# catalyst_currencies=3269:8/3378:8/2813:8/3116:8
`, "2026-08-19T23:08:00.000Z");
  assert.match(catalystUnknownReason(pasted), /Venomblight Manaflux/);
  assert.match(catalystUnknownReason(pasted), /addon/i);
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

test("upgrade_currencies splits currencies from crafting reagents by tag", () => {
  // Galsnipes' real line: only i: entries, all of them reagents.
  const galsnipes = parseSimcSnapshot(`hunter="Galsnipes"
# upgrade_currencies=i:231756:1/i:232875:21/i:231769:1
# catalyst_currencies=3269:8/3378:8/2813:8/3116:8
`);
  assert.deepEqual(galsnipes.upgradeCurrencies, {}, "no currencies were exported");
  assert.deepEqual(galsnipes.upgradeItems, { 231756: 1, 232875: 21, 231769: 1 });
  assert.equal(hasCurrencyData(galsnipes), false);
  // Sparks are reagents and must never be counted as crests.
  assert.equal(galsnipes.upgradeCurrencies[MIDNIGHT_S2_CRESTS.champion], undefined);

  // A current addon exports both kinds on the same line.
  const current = parseSimcSnapshot(`hunter="Tamagotchi"
# upgrade_currencies=c:1792:11046/c:3444:90/c:3445:12/i:232875:9
`);
  assert.deepEqual(current.upgradeCurrencies, { 1792: 11046, 3444: 90, 3445: 12 });
  assert.deepEqual(current.upgradeItems, { 232875: 9 });
  assert.equal(current.upgradeCurrencies[MIDNIGHT_S2_CRESTS.champion], 90);
  assert.equal(hasCurrencyData(current), true);
});

test("catalyst_currencies stays untagged, and Galsnipes' Venomblight is unknown", () => {
  // Verbatim from a 2026-08-19 paste. SimC addon 12.1.0-02 lists 2813, 3116,
  // 3269 and 3378 and stops, so 3465 is absent from every export on the board -
  // while Blizzard's "Midnight Season 2: Catalyst Unbound" says this character
  // has already spent three of them.
  const snap = parseSimcSnapshot(`hunter="Galsnipes"
# catalyst_currencies=3269:8/3378:8/2813:8/3116:8
`);
  assert.deepEqual(snap.catalystCurrencies, { 3269: 8, 3378: 8, 2813: 8, 3116: 8 });
  assert.deepEqual(currentCatalystBalance(snap), { id: 3465, quantity: null });
});

test("paste check spots the out-of-date addon that drops currencies", () => {
  // Galsnipes' real header and currency line.
  const stale = inspectSimcExport(`# Galsnipes - Marksmanship - 2026-08-16 17:43 - US/Tanaris
# SimC Addon 12.0.1-02
# WoW 12.1.0.69299, TOC 120100
hunter="Galsnipes"
spec=marksmanship
# upgrade_currencies=i:231756:1/i:232875:21/i:231769:1
`);
  assert.equal(stale.character, "Galsnipes");
  assert.equal(stale.addon, "12.0.1");
  assert.equal(stale.client, "12.1.0");
  assert.equal(stale.addonStale, true);
  assert.equal(stale.hasCurrencies, false);
});

test("a current addon passes the paste check", () => {
  const good = inspectSimcExport(`# SimC Addon 12.1.0-01
# WoW 12.1.0.69299, TOC 120100
hunter="Tamagotchi"
# upgrade_currencies=c:3444:90/i:232875:9
`);
  assert.equal(good.addonStale, false, "same major.minor is current");
  assert.equal(good.hasCurrencies, true);
});

test("the build suffix alone does not make an addon look stale", () => {
  const good = inspectSimcExport(`# SimC Addon 12.1.0-07
# WoW 12.1.0.69299, TOC 120100
hunter="X"
# upgrade_currencies=c:3444:5
`);
  assert.equal(good.addonStale, false);
});

test("a missing header cannot claim the addon is stale", () => {
  const bare = inspectSimcExport(`hunter="X"\n# upgrade_currencies=c:3444:5\n`);
  assert.equal(bare.addonStale, false, "no versions to compare");
  assert.equal(bare.hasCurrencies, true);
});
