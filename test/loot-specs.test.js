import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_SPECS, ROLES, defaultSpecFor, invalidDefaults } from "../src/loot-specs.js";

// The real spec list, not a fixture: data.specs on the board is exactly these
// keys, so a default outside them is a default the dropdown cannot offer.
const SPECS = Object.keys(JSON.parse(readFileSync("data/bis/icy-veins-midnight-s2.json", "utf8")).lists);
const CLASSES = [...new Set(Object.keys(DEFAULT_SPECS).map((k) => k.split("|")[0]))];

// Regression: Elemental Shaman and Protection Paladin were missing, which left
// those characters with defaultSpec "" — a state the panel cannot render as
// empty, so it silently sent an empty lootSpec.
test("every mapped default is a spec that actually exists", () => {
  assert.deepEqual(invalidDefaults(SPECS), [], "a default names a spec the BiS lists do not have");
});

test("a default belongs to the class it is mapped under", () => {
  for (const [combo, spec] of Object.entries(DEFAULT_SPECS)) {
    const className = combo.split("|")[0];
    assert.ok(spec.endsWith(className), `${combo} maps to ${spec}, which is not a ${className} spec`);
  }
});

// The board only knows these four roles, so every class it can show must answer
// for the ones it can hold.
test("every class covers the roles it can be recruited for", () => {
  for (const className of CLASSES) {
    const mapped = ROLES.filter((role) => DEFAULT_SPECS[`${className}|${role}`]);
    assert.ok(mapped.length > 0, `${className} has no default for any role`);
    for (const role of mapped) {
      assert.ok(SPECS.includes(DEFAULT_SPECS[`${className}|${role}`]), `${className}|${role} resolves to a spec with no BiS list`);
    }
  }
});

// Rule 2: an unmapped combo must never produce an empty spec. A wrong spec is
// visible and correctable; an empty one is neither.
test("an unmapped class or role still resolves to a real spec", () => {
  assert.equal(defaultSpecFor("Shaman", "Support", SPECS), "Elemental Shaman");
  assert.equal(defaultSpecFor("Paladin", "SomeNewRole", SPECS), "Holy Paladin");
  for (const className of CLASSES) {
    const guessed = defaultSpecFor(className, "RoleThatDoesNotExist", SPECS);
    assert.ok(SPECS.includes(guessed), `${className} falls back to "${guessed}", which is not a real spec`);
  }
});

// A class the BiS lists have never heard of has nothing to fall back to. That is
// the only case that still returns "", and the builder throws on it rather than
// publishing a character the panel cannot show as empty.
test("a class with no specs at all returns nothing, for the builder to catch", () => {
  assert.equal(defaultSpecFor("Tinker", "Melee", SPECS), "");
  assert.equal(defaultSpecFor("Tinker", "Melee", []), "");
});

// A mapped combo returns its mapping even against an empty list — policing the
// mapping itself is invalidDefaults' job, and the builder refuses to publish on
// it, so the resolver does not need to second-guess here.
test("a mapped combo is returned without consulting the spec list", () => {
  assert.equal(defaultSpecFor("Shaman", "Ranged", []), "Elemental Shaman");
  assert.deepEqual(invalidDefaults([]).includes("Elemental Shaman"), true);
});

// The board's own roster: whatever CI last published must resolve.
test("every character on the published roster resolves to a real spec", () => {
  const board = JSON.parse(readFileSync("public/loot-data.json", "utf8"));
  for (const c of board.characters) {
    assert.ok(c.defaultSpec, `${c.name} (${c.class}|${c.role}) has no default loot spec`);
    assert.ok(board.specs.includes(c.defaultSpec), `${c.name} defaults to ${c.defaultSpec}, which the dropdown cannot offer`);
  }
});
