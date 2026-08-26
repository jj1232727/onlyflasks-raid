import { strict as assert } from "node:assert";
import test from "node:test";
import { displayItemLevel, equippedItemLevel, filledSlotCount } from "../src/gear-slots.js";

const piece = (slot, itemLevel) => ({ slot, itemLevel });
// Every slot but the weapons, so a case only has to say what it wields.
const base = [
  piece("HEAD", 300), piece("NECK", 300), piece("SHOULDER", 300), piece("CHEST", 300),
  piece("WAIST", 300), piece("LEGS", 300), piece("FEET", 300), piece("WRIST", 300),
  piece("HANDS", 300), piece("FINGER_1", 300), piece("FINGER_2", 300),
  piece("TRINKET_1", 300), piece("TRINKET_2", 300), piece("BACK", 300),
];

test("a cosmetic shirt does not drag the average down", () => {
  const dual = [...base, piece("MAIN_HAND", 300), piece("OFF_HAND", 300)];
  assert.equal(equippedItemLevel(dual), 300);
  assert.equal(equippedItemLevel([...dual, piece("SHIRT", 1), piece("TABARD", 1)]), 300);
});

test("a two-hander counts twice instead of shrinking the divisor", () => {
  // Fifteen pieces at 300 and no off-hand is still a 300 character, not 281.
  assert.equal(equippedItemLevel([...base, piece("MAIN_HAND", 300)]), 300);
});

test("an empty slot costs score rather than being skipped", () => {
  // Fifteen counted slots filled, one genuinely missing: 4500/16, not 300.
  const missingNeck = base.filter((i) => i.slot !== "NECK");
  const worn = [...missingNeck, piece("MAIN_HAND", 300), piece("OFF_HAND", 300)];
  assert.equal(equippedItemLevel(worn), 4500 / 16);
  assert.equal(filledSlotCount(worn), 15);
});

test("low pieces are counted, not filtered away", () => {
  // The Abenasters case: the old audit dropped everything under 279, which
  // raised his score above the armory's instead of matching it.
  const worn = [
    piece("HEAD", 311), piece("NECK", 276), piece("SHOULDER", 289), piece("SHIRT", 1),
    piece("CHEST", 308), piece("WAIST", 318), piece("LEGS", 276), piece("FEET", 305),
    piece("WRIST", 331), piece("HANDS", 302), piece("FINGER_1", 311), piece("FINGER_2", 311),
    piece("TRINKET_1", 298), piece("TRINKET_2", 305), piece("BACK", 295),
    piece("MAIN_HAND", 318), piece("OFF_HAND", 308),
  ];
  assert.equal(equippedItemLevel(worn), 303.875);
  assert.equal(displayItemLevel(worn), 303); // Blizzard truncates; the armory says 303
  assert.equal(filledSlotCount(worn), 16);
});

test("Blizzard truncates rather than rounding", () => {
  // Neomonk sits at 305.63 and the armory reports 305, not 306.
  // 306 x 14 + 303 counted twice = 4890, so 305.625.
  const worn = [...base.map((i) => ({ ...i, itemLevel: 306 })), piece("MAIN_HAND", 303)];
  assert.equal(equippedItemLevel(worn), 305.625);
  assert.equal(displayItemLevel(worn), 305);
});

test("a character with no gear scores zero rather than dividing by zero", () => {
  assert.equal(equippedItemLevel([]), 0);
  assert.equal(displayItemLevel([]), 0);
  assert.equal(filledSlotCount([]), 0);
});
