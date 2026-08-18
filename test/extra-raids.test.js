import test from "node:test";
import assert from "node:assert/strict";
import { EXTRA_RAIDS, extraBosses } from "../src/extra-raids.js";

// A trimmed season-loot, shaped like the real file: Nymrissa's own drops, a
// piece of decor she also drops, and loot from the main raid the addon already
// covers.
const seasonLoot = {
  items: [
    { itemId: 270167, name: "Wavecaller's Seastone", source: "The Tidebound Grotto", sourceType: "Raid", encounter: "Nymrissa Wavecaller", slot: "Trinket", armorType: "Miscellaneous", icon: "seastone.jpg" },
    { itemId: 268262, name: "Bubblefin Splash Guard", source: "The Tidebound Grotto", sourceType: "Raid", encounter: "Nymrissa Wavecaller", slot: "Off Hand", armorType: "Shield", icon: "shield.jpg", classIds: [1, 2], secondaryStats: [{ type: "CRIT_RATING", value: 140 }] },
    { itemId: 279112, name: "Clumped Asteroidea", source: "The Tidebound Grotto", sourceType: "Raid", encounter: "Nymrissa Wavecaller", slot: "Non-equippable", armorType: "Decor", icon: "decor.jpg" },
    { itemId: 268203, name: "Hexing Spiritrender", source: "The Venomous Abyss", sourceType: "Raid", encounter: "Nek'zali the Soulcoiler", slot: "One-Hand", armorType: "Dagger" },
    { itemId: 900001, name: "A Dungeon Drop", source: "The Tidebound Grotto", sourceType: "Dungeon", encounter: "Somebody", slot: "Chest", armorType: "Cloth" },
  ],
};

test("builds the Grotto boss the addon export cannot see", () => {
  const bosses = extraBosses(seasonLoot);
  assert.equal(bosses.length, 1);
  assert.equal(bosses[0].name, "Nymrissa Wavecaller");
  assert.equal(bosses[0].raid, "The Tidebound Grotto");
  // The main raid stays with the addon path, and a dungeon sharing the name is
  // not this raid.
  assert.deepEqual(
    bosses[0].items.map((i) => i.name),
    ["Wavecaller's Seastone", "Bubblefin Splash Guard"],
  );
});

// Regression: her decor drop is not loot council's business, and it has no
// wearable slot, so it must never reach a boss's item list.
test("drops anything with no wearable slot", () => {
  const names = extraBosses(seasonLoot)[0].items.map((i) => i.name);
  assert.ok(!names.includes("Clumped Asteroidea"));
});

// Regression: without its own levels the board prices this boss at whatever the
// positional table in App.tsx holds at its index — the ninth rung of a ladder it
// was never on. Her drops are at the FIRST boss's levels.
test("every extra boss carries its own item levels", () => {
  for (const boss of extraBosses(seasonLoot)) {
    assert.deepEqual(boss.levels, { normal: 292, heroic: 305, mythic: 318 });
  }
  for (const raid of EXTRA_RAIDS) {
    for (const difficulty of ["normal", "heroic", "mythic"]) {
      assert.ok(raid.levels?.[difficulty] > 0, `${raid.name} has no ${difficulty} item level`);
    }
  }
});

// Regression: these two drive spec eligibility and catalyst stat matching, so
// without them this boss's items answer those questions differently to the rest
// of the board.
test("carries class restrictions and secondary stats through", () => {
  const [seastone, shield] = extraBosses(seasonLoot)[0].items;
  assert.deepEqual(shield.classIds, [1, 2]);
  assert.deepEqual(shield.secondaryStats, [{ type: "CRIT_RATING", value: 140 }]);
  // Absent upstream means unrestricted, not undefined.
  assert.deepEqual(seastone.classIds, []);
  assert.deepEqual(seastone.secondaryStats, []);
});

test("merges known effect text onto the items", () => {
  const effects = { items: { 270167: { specialEffect: true, effectText: "Equip: Tidal Insight." } } };
  const [seastone] = extraBosses(seasonLoot, effects)[0].items;
  assert.equal(seastone.specialEffect, true);
  assert.equal(seastone.effectText, "Equip: Tidal Insight.");
});

test("survives a missing or empty season-loot rather than throwing", () => {
  assert.deepEqual(extraBosses(undefined), []);
  assert.deepEqual(extraBosses({ items: [] }), []);
});
