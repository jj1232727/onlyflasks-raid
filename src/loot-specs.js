// Which loot spec the board assumes for a character, from class and role.
//
// This lived inline in scripts/build-app-data.js and was missing Elemental
// Shaman and Protection Paladin. A combo with no entry produced defaultSpec "",
// and an empty spec is not a visible state: a <select> whose value matches no
// option still displays the first one, so the panel looked configured while it
// was not, and the /simc paste failed on a server-side validation the board then
// blamed on an outdated Apps Script deployment.
//
// Two rules keep that from recurring, and both are enforced — see
// test/loot-specs.test.js and the guards in scripts/build-app-data.js:
//
//   1. Every value here must be a real spec, meaning a key of the Icy Veins BiS
//      lists. A value that is not is worse than a missing one: data.specs comes
//      from those same keys, so the dropdown would not offer it either, and the
//      select goes right back to displaying an option it has not selected.
//   2. A character must never end up with no spec at all. An unmapped combo
//      falls back to any spec of the right class, so a new class or a renamed
//      role degrades to a wrong-but-visible spec the raider can correct, rather
//      than an empty one they cannot see.

export const DEFAULT_SPECS = {
  "Warrior|Melee": "Fury Warrior",
  "Warrior|Tank": "Protection Warrior",
  "Paladin|Melee": "Retribution Paladin",
  "Paladin|Heal": "Holy Paladin",
  "Paladin|Tank": "Protection Paladin",
  "Hunter|Ranged": "Beast Mastery Hunter",
  "Hunter|Melee": "Survival Hunter",
  "Rogue|Melee": "Assassination Rogue",
  "Priest|Heal": "Holy Priest",
  "Priest|Ranged": "Shadow Priest",
  "Death Knight|Melee": "Frost Death Knight",
  "Death Knight|Tank": "Blood Death Knight",
  "Shaman|Heal": "Restoration Shaman",
  "Shaman|Ranged": "Elemental Shaman",
  "Shaman|Melee": "Enhancement Shaman",
  "Mage|Ranged": "Arcane Mage",
  "Warlock|Ranged": "Destruction Warlock",
  "Monk|Heal": "Mistweaver Monk",
  "Monk|Melee": "Windwalker Monk",
  "Monk|Tank": "Brewmaster Monk",
  "Druid|Ranged": "Balance Druid",
  "Druid|Heal": "Restoration Druid",
  "Druid|Melee": "Feral Druid",
  "Druid|Tank": "Guardian Druid",
  "Demon Hunter|Ranged": "Devourer Demon Hunter",
  "Demon Hunter|Melee": "Havoc Demon Hunter",
  "Demon Hunter|Tank": "Vengeance Demon Hunter",
  "Evoker|Heal": "Preservation Evoker",
  "Evoker|Ranged": "Devastation Evoker",
};

// The roles a roster row can carry. Anything outside this is a new vocabulary
// upstream, and rule 2 is what carries the board through it.
export const ROLES = ["Tank", "Heal", "Melee", "Ranged"];

// `availableSpecs` is the real spec list — Object.keys(bis.lists). Passing it is
// what makes the fallback possible; without it an unmapped combo returns "".
export function defaultSpecFor(className, role, availableSpecs = []) {
  const mapped = DEFAULT_SPECS[`${className}|${role}`];
  if (mapped) return mapped;
  return availableSpecs.find((spec) => spec.endsWith(className)) || "";
}

// Defaults that name a spec the BiS lists do not have. Always a bug here, never
// a data problem, so the builder refuses to publish rather than warn.
export const invalidDefaults = (availableSpecs = []) =>
  [...new Set(Object.values(DEFAULT_SPECS))].filter((spec) => !availableSpecs.includes(spec));
