import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchSpec, playedSpec, simmedSpecsOf } from "../src/loot-specs.js";

const SPECS = Object.keys(JSON.parse(readFileSync("data/bis/icy-veins-midnight-s2.json", "utf8")).lists);

test("a WoWAudit spec name resolves to the full spec", () => {
  assert.equal(matchSpec(SPECS, "Death Knight", "Unholy"), "Unholy Death Knight");
  assert.equal(matchSpec(SPECS, "Hunter", "Marksmanship"), "Marksmanship Hunter");
});

// A /simc export writes the spec in its own style.
test("a simc-style spec name resolves too", () => {
  assert.equal(matchSpec(SPECS, "Hunter", "beast_mastery"), "Beast Mastery Hunter");
  assert.equal(matchSpec(SPECS, "Evoker", "preservation"), "Preservation Evoker");
});

// Restoration exists for two classes, so the class has to scope the match.
test("an ambiguous spec name is scoped to the character's class", () => {
  assert.equal(matchSpec(SPECS, "Shaman", "restoration"), "Restoration Shaman");
  assert.equal(matchSpec(SPECS, "Druid", "restoration"), "Restoration Druid");
});

test("an unknown or empty name resolves to nothing", () => {
  assert.equal(matchSpec(SPECS, "Hunter", "Bogus"), "");
  assert.equal(matchSpec(SPECS, "Hunter", ""), "");
  assert.equal(matchSpec(SPECS, "Tinker", "Unholy"), "");
});

// Regression: Galsnipes sims Marksmanship on a roster that guesses Beast
// Mastery, and every one of his sims was hidden because of it.
test("what they simmed beats what class and role guess", () => {
  assert.equal(
    playedSpec({ availableSpecs: SPECS, className: "Hunter", simmedSpecs: ["Marksmanship"] }),
    "Marksmanship Hunter",
  );
  assert.equal(
    playedSpec({ availableSpecs: SPECS, className: "Death Knight", simmedSpecs: ["Unholy"] }),
    "Unholy Death Knight",
  );
});

// The paste is the newer signal: it is what they are playing right now, where a
// droptimizer may be from an earlier spec.
test("a fresh paste outranks an older droptimizer", () => {
  assert.equal(
    playedSpec({ availableSpecs: SPECS, className: "Hunter", snapshotSpec: "marksmanship", simmedSpecs: ["Beast Mastery"] }),
    "Marksmanship Hunter",
  );
});

test("no evidence resolves to nothing, leaving the guess in place", () => {
  assert.equal(playedSpec({ availableSpecs: SPECS, className: "Shaman" }), "");
  assert.equal(playedSpec({ availableSpecs: SPECS, className: "Shaman", snapshotSpec: "nonsense", simmedSpecs: ["alsononsense"] }), "");
});

test("only a spec with an actual report counts as simmed", () => {
  const entry = {
    instances: [
      { difficulties: [{ wishlist: { report_id: { Frost: null, Unholy: "abc123", Blood: null } } }] },
      { difficulties: [{ wishlist: { report_id: { Frost: null, Unholy: "abc123" } } }] },
    ],
  };
  assert.deepEqual(simmedSpecsOf(entry), ["Unholy"], "nulls excluded, no duplicates");
  assert.deepEqual(simmedSpecsOf(undefined), []);
  assert.deepEqual(simmedSpecsOf({ instances: [{ difficulties: [{ wishlist: {} }] }] }), []);
});
