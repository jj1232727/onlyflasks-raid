import test from "node:test";
import assert from "node:assert/strict";
import { assignReplacements, equipped, equippedGroup, keptForOwnTargets, slot } from "../src/gear-slots.js";

// Crediblehülk, Protection Warrior — the character the ring bug was reported on.
const hulk = {
  equipment: [
    { itemId: 273792, slot: "FINGER_1", itemLevel: 295, name: "Band of the Amani Warlord" },
    { itemId: 272148, slot: "FINGER_2", itemLevel: 305, name: "Anguine Gyre" },
    { itemId: 900001, slot: "TRINKET_1", itemLevel: 298, name: "Gaze of the Alnseer" },
    { itemId: 900002, slot: "TRINKET_2", itemLevel: 298, name: "Radiant Plume" },
    { itemId: 900003, slot: "HEAD", itemLevel: 301, name: "A Helm" },
  ],
};
const amani = { itemId: 273792, slot: "Finger", name: "Band of the Amani Warlord" },
  signet = { itemId: 252258, slot: "Finger", name: "Sickening Signet of Atroxus" },
  bisRings = [amani, signet];

test("paired slots collect both worn pieces, strongest first", () => {
  assert.deepEqual(
    equippedGroup(hulk, signet).map((i) => i.name),
    ["Anguine Gyre", "Band of the Amani Warlord"],
  );
  assert.equal(equippedGroup(hulk, { slot: "Head" }).length, 1);
});

test("a needed BiS ring displaces the ring that is NOT already BiS", () => {
  const kept = keptForOwnTargets(hulk, bisRings);
  assert.deepEqual([...kept], [273792], "the equipped Amani ring satisfies a target");
  // Regression: previously reported Band of the Amani Warlord — a ring he keeps.
  assert.equal(equipped(hulk, signet, kept).name, "Anguine Gyre");
});

test("a target already worn resolves to itself, not to the pair", () => {
  assert.equal(equipped(hulk, amani, keptForOwnTargets(hulk, bisRings)).name, "Band of the Amani Warlord");
});

test("with no ring spoken for, the weakest comes off", () => {
  // Regression: taking the strongest inverted the gain — a 300 ring read as
  // -5 against Anguine Gyre (305) when it is +5 over the Amani ring (295).
  const anyRing = { itemId: 999999, slot: "Finger" };
  assert.equal(equipped(hulk, anyRing, new Set()).itemLevel, 295);
  assert.equal(equipped(hulk, anyRing).itemLevel, 295);
});

test("every ring being BiS still names a replacement rather than nothing", () => {
  const kept = keptForOwnTargets(hulk, [amani, { itemId: 272148 }]);
  assert.ok(equipped(hulk, { itemId: 999999, slot: "Finger" }, kept));
});

test("unpaired slots are unaffected by the pairing rule", () => {
  assert.equal(equipped(hulk, { itemId: 5, slot: "Head" }, new Set()).name, "A Helm");
  assert.equal(equipped(hulk, { itemId: 5, slot: "Legs" }, new Set()), undefined);
});

test("slot normalisation covers the names the data actually uses", () => {
  for (const [input, expected] of [
    ["Finger", "FINGER"], ["FINGER_2", "FINGER"], ["Ring", "FINGER"],
    ["Trinket", "TRINKET"], ["TRINKET_1", "TRINKET"],
    ["Helm", "HEAD"], ["Shoulders", "SHOULDER"], ["Hands", "HANDS"],
    ["Robe", "CHEST"], ["Cloak", "BACK"], ["Boots", "FEET"],
  ]) assert.equal(slot(input), expected, `${input} -> ${expected}`);
});

const named = (map, list) => list.map((_, i) => map.get(i)?.name ?? null);

test("two ring targets never name the same ring", () => {
  // Regression: asking equipped() once per target handed both rows the weakest
  // ring — 49 of 50 slot groups on the real roster showed one item twice.
  const picks = named(assignReplacements(hulk, bisRings), bisRings);
  assert.deepEqual(picks, ["Band of the Amani Warlord", "Anguine Gyre"]);
  assert.equal(new Set(picks).size, 2);
});

test("with nothing already BiS, each target still gets its own piece", () => {
  const targets = [
    { itemId: 111, slot: "Finger", name: "Wanted A" },
    { itemId: 222, slot: "Finger", name: "Wanted B" },
  ];
  const picks = named(assignReplacements(hulk, targets), targets);
  // Weakest is spent first, and no piece is offered twice.
  assert.deepEqual(picks, ["Band of the Amani Warlord", "Anguine Gyre"]);
});

test("trinkets pair one-to-one the same way", () => {
  const targets = [
    { itemId: 777, slot: "Trinket", name: "Wanted T1" },
    { itemId: 888, slot: "Trinket", name: "Wanted T2" },
  ];
  const picks = named(assignReplacements(hulk, targets), targets);
  assert.equal(new Set(picks).size, 2, "two trinket rows, two different trinkets");
});

test("a third target in a two-slot group gets nothing rather than a repeat", () => {
  const targets = [
    { itemId: 111, slot: "Finger" },
    { itemId: 222, slot: "Finger" },
    { itemId: 333, slot: "Finger" },
  ];
  const picks = named(assignReplacements(hulk, targets), targets);
  assert.equal(picks.filter(Boolean).length, 2);
  assert.equal(picks[2], null, "no ring left to displace");
});

test("unpaired slots are unchanged by the assignment pass", () => {
  const targets = [{ itemId: 5, slot: "Head", name: "Wanted Helm" }];
  assert.deepEqual(named(assignReplacements(hulk, targets), targets), ["A Helm"]);
});
