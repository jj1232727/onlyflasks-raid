import test from "node:test";
import assert from "node:assert/strict";
import { bonusForPieces, tierDifficultyValue, tierIdsForClass, tierRosterSummary, tierSetStatus, trackLetter, trackName, trackRank } from "../src/tier-set.js";

// Midnight S2 upgrade-track bonus ids.
const CHAMP = 12835, HERO = 12843, MYTH = 12851, LAST_SEASON = 11111;
const tierIds = { HEAD: 100, SHOULDER: 101, CHEST: 102, HANDS: 103, LEGS: 104 };
const piece = (slot, id, bonus) => ({ itemId: id, slot, bonusList: [bonus], name: `${slot} tier` });
const base = (slot, id, bonus = CHAMP) => ({ itemId: id, slot, bonusList: [bonus], name: `${slot} base` });

test("track names and ranks read off the bonus bands", () => {
  assert.equal(trackName({ bonusList: [CHAMP] }), "Champion");
  assert.equal(trackName({ bonusList: [HERO] }), "Hero");
  assert.equal(trackName({ bonusList: [MYTH] }), "Myth");
  assert.equal(trackName({ bonusList: [LAST_SEASON] }), "");
  assert.equal(trackRank({ bonusList: [12854] }), 6, "Myth 6/6");
  assert.equal(trackRank({ bonusList: [12833] }), 1, "Champion 1/6");
});

test("set bonus counts pieces, not tracks", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(bonusForPieces), [0, 0, 2, 2, 4, 4]);
});

test("three Champion pieces plus one Hero piece is 4PC, not an incomplete Champion set", () => {
  // The exact case that reads wrong when a board reports per-track progress.
  const status = tierSetStatus({
    equipment: [
      piece("HEAD", 100, CHAMP), piece("SHOULDER", 101, CHAMP),
      piece("CHEST", 102, CHAMP), piece("HANDS", 103, HERO),
    ],
    tierIds,
  });
  assert.equal(status.pieces, 4);
  assert.equal(status.setBonus, 4, "4PC is active");
  assert.deepEqual(status.trackMix, { Champion: 3, Hero: 1 });
  assert.equal(status.hiddenUpgrade, false, "nothing left to switch on");
});

test("a charge plus a catalysable base is an unspent 4PC and must be flagged", () => {
  const status = tierSetStatus({
    equipment: [
      piece("HEAD", 100, CHAMP), piece("SHOULDER", 101, CHAMP), piece("CHEST", 102, CHAMP),
      base("HANDS", 900, CHAMP),
    ],
    tierIds,
    charges: 1,
  });
  assert.equal(status.pieces, 3);
  assert.equal(status.setBonus, 2, "only 2PC is actually running");
  assert.equal(status.ready, 1);
  assert.equal(status.catalysable, 1);
  assert.equal(status.reachable, 4);
  assert.equal(status.reachableBonus, 4);
  assert.equal(status.hiddenUpgrade, true, "they are sitting on a 4PC");
});

test("the same base with no charge is blocked, not hidden", () => {
  const status = tierSetStatus({
    equipment: [
      piece("HEAD", 100, CHAMP), piece("SHOULDER", 101, CHAMP), piece("CHEST", 102, CHAMP),
      base("HANDS", 900, CHAMP),
    ],
    tierIds,
    charges: 0,
  });
  assert.equal(status.waiting, 1);
  assert.equal(status.ready, 0);
  assert.equal(status.catalysable, 0);
  assert.equal(status.reachable, 3);
  assert.equal(status.hiddenUpgrade, false, "cannot act without a charge");
});

test("charges cap how many bases can actually be converted", () => {
  const status = tierSetStatus({
    equipment: [base("HEAD", 900), base("SHOULDER", 901), base("CHEST", 902), base("HANDS", 903)],
    tierIds,
    charges: 2,
  });
  assert.equal(status.ready, 4, "four bases are eligible");
  assert.equal(status.catalysable, 2, "but only two charges are held");
  assert.equal(status.reachable, 2);
  assert.equal(status.reachableBonus, 2);
  assert.equal(status.hiddenUpgrade, true);
});

test("tier sitting in bags counts toward what they could equip for free", () => {
  const status = tierSetStatus({
    equipment: [piece("HEAD", 100, CHAMP), piece("SHOULDER", 101, HERO)],
    bags: [piece("CHEST", 102, CHAMP), piece("HANDS", 103, MYTH)],
    tierIds,
  });
  assert.equal(status.pieces, 2);
  assert.equal(status.setBonus, 2);
  assert.equal(status.stored, 2);
  assert.equal(status.freePieces, 2);
  assert.equal(status.reachable, 4);
  assert.equal(status.hiddenUpgrade, true, "4PC is two clicks away, no charge needed");
});

test("last season's tier does not count toward this season's set", () => {
  const status = tierSetStatus({
    equipment: [
      { itemId: 249997, slot: "HEAD", bonusList: [LAST_SEASON], name: "Hornhelm of the Black Talon" },
      { itemId: 249995, slot: "SHOULDER", bonusList: [LAST_SEASON], name: "Beacons of the Black Talon" },
    ],
    tierIds,
  });
  assert.equal(status.pieces, 0);
  assert.equal(status.setBonus, 0);
  assert.equal(status.ready, 0, "an off-season piece is not a catalyst base either");
});

test("an equipped tier piece is never offered as its own catalyst base", () => {
  const status = tierSetStatus({ equipment: [piece("HEAD", 100, CHAMP)], tierIds, charges: 3 });
  assert.equal(status.slots.find((s) => s.slot === "HEAD").state, "tier");
  assert.equal(status.pieces, 1);
  assert.equal(status.ready, 0);
});

test("a full five-piece set reports 4PC with nothing outstanding", () => {
  const status = tierSetStatus({
    equipment: [
      piece("HEAD", 100, MYTH), piece("SHOULDER", 101, MYTH), piece("CHEST", 102, HERO),
      piece("HANDS", 103, HERO), piece("LEGS", 104, CHAMP),
    ],
    tierIds,
    charges: 4,
  });
  assert.equal(status.pieces, 5);
  assert.equal(status.setBonus, 4);
  assert.equal(status.reachable, 5, "never exceeds five slots");
  assert.equal(status.hiddenUpgrade, false);
  assert.deepEqual(status.trackMix, { Myth: 2, Hero: 2, Champion: 1 });
});

test("class tier ids are pulled by class id, numeric or string keyed", () => {
  const map = { 8: { head: 271564, shoulder: 271562, chest: 271567, hands: 271565, legs: 271563 } };
  assert.deepEqual(tierIdsForClass(map, 8), {
    HEAD: 271564, SHOULDER: 271562, CHEST: 271567, HANDS: 271565, LEGS: 271563,
  });
  assert.deepEqual(tierIdsForClass(map, "8").SHOULDER, 271562);
  assert.deepEqual(tierIdsForClass(map, 99), {}, "a class with no mapping yields nothing");
});

// --- The raid-leader verdict: do we need to run this boss for tier? ---

test("already 4PC reads as done — do not spend loot here", () => {
  const status = tierSetStatus({
    equipment: [piece("HEAD", 100, CHAMP), piece("SHOULDER", 101, HERO), piece("CHEST", 102, CHAMP), piece("HANDS", 103, CHAMP)],
    tierIds,
  });
  assert.equal(status.verdict, "done");
});

test("charges in hand means they solve it themselves, no boss needed", () => {
  const status = tierSetStatus({
    equipment: [piece("HEAD", 100, CHAMP), piece("SHOULDER", 101, CHAMP), piece("CHEST", 102, CHAMP), base("HANDS", 900)],
    tierIds,
    charges: 1,
  });
  assert.equal(status.verdict, "self");
});

test("bases but no charges is a charge problem, not a drop problem", () => {
  const status = tierSetStatus({
    equipment: [piece("HEAD", 100, CHAMP), piece("SHOULDER", 101, CHAMP), piece("CHEST", 102, CHAMP), base("HANDS", 900)],
    tierIds,
    charges: 0,
  });
  assert.equal(status.verdict, "charge", "a charge unblocks them — the boss does not have to");
});

test("nothing convertible means they genuinely need the boss to drop", () => {
  const status = tierSetStatus({
    equipment: [piece("HEAD", 100, CHAMP), { itemId: 555, slot: "HANDS", bonusList: [LAST_SEASON] }],
    tierIds,
    charges: 5,
  });
  assert.equal(status.verdict, "drop");
});

test("the slot shows what they actually have on, tier or not", () => {
  const status = tierSetStatus({
    equipment: [base("HANDS", 900, CHAMP)],
    tierIds,
    charges: 1,
  });
  const hands = status.slots.find((s) => s.slot === "HANDS");
  assert.equal(hands.state, "ready", "convertible with a charge in hand");
  assert.equal(hands.worn.itemId, 900, "shows the equipped non-tier piece");
  assert.equal(hands.track, "Champion", "and what track it is");
});

test("an empty slot is missing, with nothing to show", () => {
  const status = tierSetStatus({ equipment: [], tierIds, charges: 3 });
  const legs = status.slots.find((s) => s.slot === "LEGS");
  assert.equal(legs.state, "missing");
  assert.equal(legs.worn, undefined);
  assert.equal(legs.evidence, undefined);
});

test("roster summary tallies verdicts and total charges held", () => {
  const summary = tierRosterSummary([
    { verdict: "done", charges: 0 },
    { verdict: "self", charges: 2 },
    { verdict: "self", charges: 1 },
    { verdict: "charge", charges: 0 },
    { verdict: "drop", charges: 4 },
  ]);
  assert.deepEqual(summary, { done: 1, self: 2, charge: 1, drop: 1, charges: 7 });
});

// --- Backfarm: should we go back to Normal / Heroic for tier? ---

const roster = (...statuses) => statuses;

test("someone stuck below 4PC with no charge makes a run worth it", () => {
  const stuck = tierSetStatus({
    equipment: [piece("HEAD", 100, CHAMP), piece("SHOULDER", 101, CHAMP), piece("CHEST", 102, CHAMP)],
    tierIds,
    charges: 0,
  });
  const value = tierDifficultyValue(roster(stuck), 1);
  assert.equal(value.needFor4, 1);
  assert.equal(value.selfSolve, 0);
  assert.equal(value.verdict, "worth");
});

test("if they can catalyse to 4PC themselves, the run is not justified by them", () => {
  const selfSolver = tierSetStatus({
    equipment: [piece("HEAD", 100, CHAMP), piece("SHOULDER", 101, CHAMP), piece("CHEST", 102, CHAMP), base("HANDS", 900)],
    tierIds,
    charges: 1,
  });
  const value = tierDifficultyValue(roster(selfSolver), 1);
  assert.equal(value.needFor4, 0, "no boss needed for them");
  assert.equal(value.selfSolve, 1);
  assert.equal(value.verdict, "skip");
});

test("a 4PC roster in Champion gear still gains item level from Heroic, but not from Normal", () => {
  const full = tierSetStatus({
    equipment: [
      piece("HEAD", 100, CHAMP), piece("SHOULDER", 101, CHAMP),
      piece("CHEST", 102, CHAMP), piece("HANDS", 103, CHAMP), piece("LEGS", 104, CHAMP),
    ],
    tierIds,
  });
  const normal = tierDifficultyValue(roster(full), 1),
    heroic = tierDifficultyValue(roster(full), 2),
    mythic = tierDifficultyValue(roster(full), 3);
  assert.equal(normal.verdict, "skip", "Normal cannot beat Champion gear");
  assert.equal(normal.upgradeSlots, 0);
  assert.equal(heroic.verdict, "ilvl");
  assert.equal(heroic.upgradeSlots, 5, "all five pieces move Champion -> Hero");
  assert.equal(mythic.upgradeSlots, 5);
  assert.equal(heroic.trackUpgrades, 1, "one raider affected");
});

test("mixed tracks only count the pieces actually below the run's track", () => {
  const mixed = tierSetStatus({
    equipment: [
      piece("HEAD", 100, MYTH), piece("SHOULDER", 101, HERO),
      piece("CHEST", 102, CHAMP), piece("HANDS", 103, CHAMP), piece("LEGS", 104, HERO),
    ],
    tierIds,
  });
  assert.equal(tierDifficultyValue(roster(mixed), 2).upgradeSlots, 2, "the two Champion pieces");
  assert.equal(tierDifficultyValue(roster(mixed), 3).upgradeSlots, 4, "everything below Myth");
  assert.equal(tierDifficultyValue(roster(mixed), 1).upgradeSlots, 0, "nothing is below Champion");
});

test("set-bonus need is difficulty-blind — Normal fills an empty slot as well as Mythic", () => {
  const bare = tierSetStatus({ equipment: [], tierIds, charges: 0 });
  for (const track of [1, 2, 3]) {
    assert.equal(tierDifficultyValue(roster(bare), track).newPieces, 1, `track ${track}`);
  }
});

test("a whole roster splits into who forces a run and who does not", () => {
  const stuck = tierSetStatus({ equipment: [piece("HEAD", 100, CHAMP)], tierIds, charges: 0 }),
    solver = tierSetStatus({
      equipment: [piece("HEAD", 100, CHAMP), piece("SHOULDER", 101, CHAMP), piece("CHEST", 102, CHAMP), base("HANDS", 900)],
      tierIds,
      charges: 1,
    }),
    done = tierSetStatus({
      equipment: [piece("HEAD", 100, HERO), piece("SHOULDER", 101, HERO), piece("CHEST", 102, HERO), piece("HANDS", 103, HERO)],
      tierIds,
    });
  const value = tierDifficultyValue(roster(stuck, solver, done), 2);
  assert.equal(value.needFor4, 1, "only the stuck raider forces it");
  assert.equal(value.selfSolve, 1);
  assert.equal(value.newPieces, 3, "everyone still has an empty tier slot");
  assert.equal(value.verdict, "worth");
});

// --- Prep phase: nobody has tier yet, so bases carry the track signal ---

test("track letters compress to C / H / M with a dash for nothing usable", () => {
  assert.equal(trackLetter({ bonusList: [CHAMP] }), "C");
  assert.equal(trackLetter({ bonusList: [HERO] }), "H");
  assert.equal(trackLetter({ bonusList: [MYTH] }), "M");
  assert.equal(trackLetter({ bonusList: [LAST_SEASON] }), "—");
  assert.equal(trackLetter(undefined), "—");
});

test("a slot reports the best track it holds, base or tier", () => {
  const status = tierSetStatus({ equipment: [base("HANDS", 900, HERO)], tierIds, charges: 1 });
  const hands = status.slots.find((s) => s.slot === "HANDS");
  assert.equal(hands.state, "ready");
  assert.equal(hands.sourceTrack, "Hero", "the base they would convert is Hero track");
  assert.equal(hands.sourceTrackOrder, 2);
});

test("with no tier yet, Champion bases still make Heroic worth running", () => {
  // The actual prep-phase question: everyone is in Champion gear, no set pieces.
  const prepping = tierSetStatus({
    equipment: [
      base("HEAD", 900, CHAMP), base("SHOULDER", 901, CHAMP), base("CHEST", 902, CHAMP),
      base("HANDS", 903, CHAMP), base("LEGS", 904, CHAMP),
    ],
    tierIds,
    charges: 0,
  });
  assert.equal(prepping.pieces, 0, "no tier equipped");
  assert.equal(tierDifficultyValue([prepping], 1).upgradeSlots, 0, "Normal cannot beat Champion");
  assert.equal(tierDifficultyValue([prepping], 2).upgradeSlots, 5, "Heroic upgrades every slot");
  assert.equal(tierDifficultyValue([prepping], 3).upgradeSlots, 5);
  assert.equal(tierDifficultyValue([prepping], 2).verdict, "worth", "and they still need the pieces");
});

test("an off-season slot contributes no track signal", () => {
  const status = tierSetStatus({
    equipment: [{ itemId: 249997, slot: "HEAD", bonusList: [LAST_SEASON] }],
    tierIds,
  });
  const head = status.slots.find((s) => s.slot === "HEAD");
  assert.equal(head.state, "missing");
  assert.equal(head.sourceTrackOrder, 0);
  assert.equal(tierDifficultyValue([status], 3).upgradeSlots, 0, "nothing to upgrade from");
});

test("the app's row shape feeds tierDifficultyValue correctly", () => {
  // Regression: the board hand-listed row fields, dropped `pieces`, and every
  // backfarm counter silently read zero because `undefined < 4` is false.
  const status = tierSetStatus({ equipment: [], tierIds, charges: 0 });
  const row = { ...status, c: { id: 1, name: "Someone" }, equippedCount: status.pieces };
  const value = tierDifficultyValue([row], 2);
  assert.equal(value.needFor4, 1, "a bare raider must count toward needing a run");
  assert.notDeepEqual(
    [value.needFor4, value.selfSolve, value.newPieces],
    [0, 0, 0],
    "all-zero output means the row shape lost a field again",
  );
});
