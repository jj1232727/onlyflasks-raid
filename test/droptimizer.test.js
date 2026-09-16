import test from "node:test";
import assert from "node:assert/strict";
import { droptimizerPayload, raidbotDifficulty } from "../src/raidbots.js";

// Enough of a /simc export for the payload builder: the actor line, and the
// fields it reads back out of the text.
const evokerExport = `evoker="Rapunzele"
level=80
race=dracthyr_horde
region=us
server=tichondrius
spec=augmentation
head=,id=271501`;

test("builds a droptimizer payload from the export's own actor line", () => {
  const payload = droptimizerPayload(evokerExport, { class: "Evoker" }, "Augmentation Evoker", "mythic");
  assert.equal(payload.type, "droptimizer");
  assert.equal(payload.baseActorName, "Rapunzele");
  // Raidbots wants the spec without the class on it.
  assert.equal(payload.spec, "Augmentation");
  assert.deepEqual(payload.armory, { region: "us", realm: "tichondrius", name: "" });
  assert.equal(payload.droptimizer.classId, 13);
  assert.equal(payload.droptimizer.specId, 1473);
  assert.equal(payload.droptimizer.lootSpecId, 1473);
});

test("each difficulty carries its own upgrade level", () => {
  const levels = ["normal", "heroic", "mythic"].map(
    (difficulty) => droptimizerPayload(evokerExport, { class: "Evoker" }, "Devastation Evoker", difficulty).droptimizer.upgradeLevel,
  );
  assert.deepEqual(levels, [12838, 12846, 12854]);
  assert.equal(new Set(levels).size, 3);
  for (const difficulty of ["normal", "heroic", "mythic"])
    assert.equal(
      droptimizerPayload(evokerExport, { class: "Evoker" }, "Devastation Evoker", difficulty).droptimizer.difficulty,
      raidbotDifficulty[difficulty].value,
    );
});

test("faction comes from the race, not the realm", () => {
  const horde = droptimizerPayload(evokerExport, { class: "Evoker" }, "Devastation Evoker");
  assert.equal(horde.droptimizer.faction, "horde");
  const alliance = droptimizerPayload(evokerExport.replace("dracthyr_horde", "void_elf"), { class: "Evoker" }, "Devastation Evoker");
  assert.equal(alliance.droptimizer.faction, "alliance");
});

// SimC writes "demonhunter=", not "demon_hunter=" - a special case that used to
// exist for Death Knight only, and refused every Demon Hunter paste.
test("matches the actor line for two-word classes", () => {
  const paladin = droptimizerPayload('paladin="Bubbles"\nregion=us\nserver=area-52', { class: "Paladin" }, "Retribution Paladin");
  assert.equal(paladin.baseActorName, "Bubbles");
  const dh = droptimizerPayload('demonhunter="Leapy"\nregion=us\nserver=area-52', { class: "Demon Hunter" }, "Havoc Demon Hunter");
  assert.equal(dh.baseActorName, "Leapy");
  const dk = droptimizerPayload('deathknight="Grimm"\nregion=us\nserver=area-52', { class: "Death Knight" }, "Frost Death Knight");
  assert.equal(dk.baseActorName, "Grimm");
});

test("refuses an export for the wrong class, and an unmapped spec", () => {
  assert.throws(
    () => droptimizerPayload(evokerExport, { class: "Warrior" }, "Arms Warrior"),
    /not for a Warrior/,
  );
  assert.throws(
    () => droptimizerPayload(evokerExport, { class: "Evoker" }, "Flamesomething Evoker"),
    /spec mapping is missing/,
  );
});
