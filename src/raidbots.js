export function raidbotsReportId(value) {
  const input = String(value || "").trim();
  if (!input) throw new Error("Raidbots report URL or ID is required.");

  if (/^[A-Za-z0-9_-]{8,80}$/u.test(input)) return input;

  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Enter a valid Raidbots report URL or report ID.");
  }
  if (!/(^|\.)raidbots\.com$/iu.test(url.hostname))
    throw new Error("The report URL must be hosted on raidbots.com.");
  const match = url.pathname.match(/\/simbot\/report\/([A-Za-z0-9_-]{8,80})(?:\/|$)/u);
  if (!match) throw new Error("This is not a Raidbots simulation report URL.");
  return match[1];
}

// Everything Raidbots needs to run a droptimizer, kept here because two callers
// submit it: a raider's browser from the board, and scripts/rerun-sim.js from an
// export the sheet already holds. A second copy would drift, and the field that
// drifts silently is upgradeLevel - last season's value sims the wrong item
// level and still hands back a report that looks fine.
export const classIds = {
    Warrior: 1,
    Paladin: 2,
    Hunter: 3,
    Rogue: 4,
    Priest: 5,
    "Death Knight": 6,
    Shaman: 7,
    Mage: 8,
    Warlock: 9,
    Monk: 10,
    Druid: 11,
    "Demon Hunter": 12,
    Evoker: 13,
  };

export const specIds = {
  "Arms Warrior": 71, "Fury Warrior": 72, "Protection Warrior": 73,
  "Holy Paladin": 65, "Protection Paladin": 66, "Retribution Paladin": 70,
  "Beast Mastery Hunter": 253, "Marksmanship Hunter": 254, "Survival Hunter": 255,
  "Assassination Rogue": 259, "Outlaw Rogue": 260, "Subtlety Rogue": 261,
  "Discipline Priest": 256, "Holy Priest": 257, "Shadow Priest": 258,
  "Blood Death Knight": 250, "Frost Death Knight": 251, "Unholy Death Knight": 252,
  "Elemental Shaman": 262, "Enhancement Shaman": 263, "Restoration Shaman": 264,
  "Arcane Mage": 62, "Fire Mage": 63, "Frost Mage": 64,
  "Affliction Warlock": 265, "Demonology Warlock": 266, "Destruction Warlock": 267,
  "Brewmaster Monk": 268, "Windwalker Monk": 269, "Mistweaver Monk": 270,
  "Balance Druid": 102, "Feral Druid": 103, "Guardian Druid": 104, "Restoration Druid": 105,
  "Havoc Demon Hunter": 577, "Vengeance Demon Hunter": 581, "Devourer Demon Hunter": 1480,
  "Devastation Evoker": 1467, "Preservation Evoker": 1468, "Augmentation Evoker": 1473,
};

export const simcValue = (text, key) =>
  text.match(new RegExp(`^${key}=(?:"([^"]+)"|([^\\s#]+))`, "m"))?.slice(1).find(Boolean) || "";
export const factionForSimc = (text) =>
  ["human", "dwarf", "night_elf", "gnome", "draenei", "worgen", "pandaren_alliance", "void_elf", "lightforged_draenei", "dark_iron_dwarf", "kul_tiran", "mechagnome", "earthen_alliance"].includes(simcValue(text, "race")) ? "alliance" : "horde";

export const raidbotDifficulty = {
  normal: { value: "raid-normal", upgradeLevel: 12838, label: "Normal", track: "Champion 6/6" },
  heroic: { value: "raid-heroic", upgradeLevel: 12846, label: "Heroic", track: "Hero 6/6" },
  mythic: { value: "raid-mythic", upgradeLevel: 12854, label: "Mythic", track: "Myth 6/6" },
};

export function droptimizerPayload(text, c, selectedSpec, difficulty = "normal") {
  const specId = specIds[selectedSpec];
  if (!specId) throw new Error(`Raidbots spec mapping is missing for ${selectedSpec}.`);
  // SimC writes the actor line with the space removed, not underscored:
  // "deathknight=", "demonhunter=". Death Knight was special-cased and Demon
  // Hunter was not, so every Demon Hunter paste was refused as "not for a Demon
  // Hunter" while holding a perfectly good export. Drop the space for all of
  // them and the special case goes with it.
  const actor = simcValue(text, c.class.toLowerCase().replace(/\s+/gu, ""));
  if (!actor) throw new Error(`This /simc export is not for a ${c.class}.`);
  const raidbot = raidbotDifficulty[difficulty];
  return {
    type: "droptimizer", text, baseActorName: actor,
    reportName: `OnlyFlasks · Season 2 Raids · ${raidbot.label} · ${raidbot.track}`,
    armory: { region: simcValue(text, "region") || "us", realm: simcValue(text, "server"), name: "" },
    email: "", sendEmail: false, spec: selectedSpec.replace(` ${c.class}`, ""), talents: null,
    droptimizer: { instance: -102, difficulty: raidbot.value, upgradeLevel: raidbot.upgradeLevel, upgradeEquipped: true, gem: null,
      classId: classIds[c.class], specId, lootSpecId: specId, faction: factionForSimc(text), craftedStats: "49/32",
      offSpecItems: false, includeConversions: true, excludedItems: [] },
    simcVersion: "latest", iterations: "smart", smartHighPrecision: true, smartAggressive: false,
    fightStyle: "Patchwerk", fightLength: 360, enemyCount: 1, enemyType: "FluffyPillow",
    potion: "", food: "", flask: "", augmentation: "", bloodlust: true, arcaneIntellect: true,
    fortitude: true, battleShout: true, mysticTouch: true, chaosBrand: true, bleeding: true,
    skyfury: true, markOfTheWild: true, powerInfusion: false, huntersMark: true, vantusRune: false,
    reportDetails: false, apl: "", ptr: false, frontendHost: "www.raidbots.com", locale: "en_US",
  };
}
