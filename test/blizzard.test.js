import assert from "node:assert/strict";
import test from "node:test";
import { characterSlug, normalizeItem, realmSlug } from "../src/blizzard.js";

test("creates Blizzard realm and character slugs", () => {
  assert.equal(realmSlug("Area 52"), "area-52");
  assert.equal(realmSlug("Quel’Thalas"), "quelthalas");
  assert.equal(characterSlug("Nóva"), "nóva");
});

test("normalizes Blizzard equipment without guessing a track", () => {
  const item = normalizeItem({
    item: { id: 123 },
    slot: { type: "HEAD" },
    name: "Example Helm",
    level: { value: 318 },
    bonus_list: [1, 2],
  });
  assert.deepEqual(
    { slot: item.slot, itemId: item.itemId, itemLevel: item.itemLevel, bonusList: item.bonusList, upgrade: item.upgrade },
    { slot: "HEAD", itemId: 123, itemLevel: 318, bonusList: [1, 2], upgrade: null },
  );
});
