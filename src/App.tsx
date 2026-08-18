import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  CircleAlert,
  ClipboardCheck,
  Gavel,
  HeartPulse,
  History,
  LayoutDashboard,
  RefreshCw,
  Search,
  Shield,
  Skull,
  Sparkles,
  Star,
  Swords,
  TrendingUp,
} from "lucide-react";
import { isBeforeReset, lastWeeklyReset, simStatus, simTimestamps } from "./raid-week.js";
import {
  tierIdsForClass,
  tierRosterSummary,
  tierSetStatus,
  trackLetter,
  trackName as currentSeasonTrackName,
  trackOrder as currentSeasonTrackOrder,
  trackRank as currentSeasonTrackRank,
} from "./tier-set.js";
import {
  assignReplacements,
  equipped,
  equippedGroup,
  keptForOwnTargets,
  norm,
  slot,
} from "./gear-slots.js";
import {
  CATALYST_CURRENCIES,
  MIDNIGHT_S2_CATALYST,
  MIDNIGHT_S2_CRESTS,
  hasCurrencyData,
  inspectSimcExport,
  currentCatalystBalance,
  parseSimcSnapshot,
} from "./simc-snapshot.js";
type Item = {
  itemId: number;
  name: string;
  slot: string;
  armorType?: string;
  icon?: string;
  track?: string;
  trackRank?: string;
  itemLevel?: number;
  tierToken?: boolean;
  isWeapon?: boolean;
  sourceItemId?: number;
  catalyst?: boolean;
  embellished?: boolean;
  embellishmentName?: string;
  drop?: string;
  crafted?: boolean;
  classIds?: number[];
  secondaryStats?: { type: string; value: number }[];
  source?: string;
  sourceType?: string;
  encounter?: string;
  specialEffect?: boolean;
  effectText?: string;
  bonusList?: number[];
};
type Raider = {
  id: number;
  name: string;
  class: string;
  role: string;
  defaultSpec: string;
  equipment: Item[];
  rosterStatus?: RosterStatus;
};
type RosterStatus = "Main" | "Trial" | "Fill";
// raid and levels are set only for bosses outside the main instance's ladder —
// see bossLevel and the EXTRA_RAIDS merge in scripts/build-app-data.js.
type Boss = {
  name: string;
  items: Item[];
  raid?: string;
  levels?: Record<Difficulty, number>;
};
type Data = {
  raid: { raid: string; bosses: Boss[] };
  characters: Raider[];
  bis: { lists: Record<string, { items: Item[] }> };
  seasonLoot?: { items: Item[] };
  sims: any;
  lootHistory: { history_items?: any[] };
  auditActivity?: {
    fetchedAt?: string;
    period?: number;
    periodInfo?: any;
    characters?: any[];
  };
  raiderio?: { fetchedAt?: string; characters?: any[] };
  // characterId -> QE Live report summary, for healers.
  qeReports?: Record<string, any>;
  // itemId -> icon, for bag/vault items that appear nowhere else.
  itemIcons?: Record<string, string>;
  specs: string[];
  refreshedAt?: string;
};
const colors: Record<string, string> = {
    "Death Knight": "#C41E3A",
    "Demon Hunter": "#A330C9",
    Druid: "#FF7C0A",
    Evoker: "#33937F",
    Hunter: "#AAD372",
    Mage: "#3FC7EB",
    Monk: "#00FF98",
    Paladin: "#F48CBA",
    Priest: "#FFFFFF",
    Rogue: "#FFF468",
    Shaman: "#0070DD",
    Warlock: "#8788EE",
    Warrior: "#C69B6D",
  },
  classIds: Record<string, number> = {
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
  },
  levels = {
    normal: [292, 295, 298, 295, 298, 298, 302, 302],
    heroic: [305, 308, 311, 308, 311, 311, 315, 315],
    mythic: [318, 321, 324, 321, 324, 324, 327, 327],
  },
  tracks = { normal: "Champion", heroic: "Hero", mythic: "Myth" };
type Difficulty = keyof typeof levels;
// What a boss actually drops at. The table above is the ladder inside The
// Venomous Abyss, so it only means anything for a boss's position in that raid.
// A boss from another instance — The Tidebound Grotto is one boss on its own
// lockout — carries its own levels, because it is not the ninth rung of a ladder
// it was never on. The builder refuses to publish such a boss without them.
const bossLevel = (boss: any, difficulty: Difficulty, index: number): number =>
  boss?.levels?.[difficulty] ?? levels[difficulty][index];
type SimState = "idle" | "submitting" | "running" | "refreshing" | "uploaded" | "stale" | "error";
type SimReport = { difficulty: Difficulty; url: string; state: "queued" | "running" | "uploaded" | "error"; error?: string };
const specIds: Record<string, number> = {
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
const specIcons: Record<string, string> = {
  "Arcane Mage": "spell_holy_magicalsentry", "Arms Warrior": "ability_warrior_savageblow", "Assassination Rogue": "ability_rogue_deadliness",
  "Balance Druid": "spell_nature_starfall", "Beast Mastery Hunter": "ability_hunter_bestialdiscipline",
  "Blood Death Knight": "spell_deathknight_bloodpresence", "Destruction Warlock": "spell_shadow_rainoffire",
  "Frost Death Knight": "spell_deathknight_frostpresence", "Fury Warrior": "ability_warrior_innerrage",
  "Holy Paladin": "spell_holy_holybolt", "Holy Priest": "spell_holy_guardianspirit",
  "Mistweaver Monk": "spell_monk_mistweaver_spec", "Preservation Evoker": "classicon_evoker_preservation",
  "Devourer Demon Hunter": "classicon_demonhunter",
  "Protection Warrior": "ability_warrior_defensivestance", "Restoration Druid": "spell_nature_healingtouch",
  "Restoration Shaman": "spell_nature_magicimmunity", "Retribution Paladin": "spell_holy_auraoflight",
  "Survival Hunter": "ability_hunter_camouflage",
  "Unholy Death Knight": "spell_deathknight_unholypresence",
  "Havoc Demon Hunter": "ability_demonhunter_specdps",
  "Vengeance Demon Hunter": "ability_demonhunter_spectank",
  "Feral Druid": "ability_druid_catform",
  "Guardian Druid": "ability_racial_bearform",
  "Augmentation Evoker": "classicon_evoker_augmentation",
  "Devastation Evoker": "classicon_evoker_devastation",
  "Marksmanship Hunter": "ability_hunter_focusedaim",
  "Fire Mage": "spell_fire_firebolt02",
  "Frost Mage": "spell_frost_frostbolt02",
  "Brewmaster Monk": "spell_monk_brewmaster_spec",
  "Windwalker Monk": "spell_monk_windwalker_spec",
  "Protection Paladin": "ability_paladin_shieldofthetemplar",
  "Discipline Priest": "spell_holy_powerwordshield",
  "Shadow Priest": "spell_shadow_shadowwordpain",
  "Outlaw Rogue": "ability_rogue_waylay",
  "Subtlety Rogue": "ability_stealth",
  "Elemental Shaman": "spell_nature_lightning",
  "Enhancement Shaman": "spell_shaman_improvedstormstrike",
  "Affliction Warlock": "spell_shadow_deathcoil",
  "Demonology Warlock": "spell_shadow_metamorphosis",
};
const specIconUrl = (spec: string) =>
  `https://wow.zamimg.com/images/wow/icons/medium/${specIcons[spec] || "inv_misc_questionmark"}.jpg`;
const simcValue = (text: string, key: string) =>
  text.match(new RegExp(`^${key}=(?:"([^"]+)"|([^\\s#]+))`, "m"))?.slice(1).find(Boolean) || "";
const factionForSimc = (text: string) =>
  ["human", "dwarf", "night_elf", "gnome", "draenei", "worgen", "pandaren_alliance", "void_elf", "lightforged_draenei", "dark_iron_dwarf", "kul_tiran", "mechagnome", "earthen_alliance"].includes(simcValue(text, "race")) ? "alliance" : "horde";
const raidbotDifficulty = {
  normal: { value: "raid-normal", upgradeLevel: 12838, label: "Normal", track: "Champion 6/6" },
  heroic: { value: "raid-heroic", upgradeLevel: 12846, label: "Heroic", track: "Hero 6/6" },
  mythic: { value: "raid-mythic", upgradeLevel: 12854, label: "Mythic", track: "Myth 6/6" },
} as const;
const simSpecName = (c: Raider, selectedSpec: string) =>
  selectedSpec.replace(new RegExp(`\\s+${c.class}$`, "i"), "");
const simFreshness = (sims: any, characterId: number, specName: string) => {
  const character = (sims?.characters || []).find((entry: any) => +entry.id === +characterId),
    instance = character?.instances?.find((entry: any) => +entry.id === 80),
    result = {} as Record<Difficulty, string>;
  for (const difficulty of ["normal", "heroic", "mythic"] as Difficulty[]) {
    const wishlist = instance?.difficulties?.find((entry: any) => entry.difficulty === difficulty)?.wishlist;
    result[difficulty] = [wishlist?.report_id?.[specName], wishlist?.updated_at?.[specName], wishlist?.report_uploaded_at?.[specName]]
      .map((value) => String(value || ""))
      .join("|");
  }
  return result;
};
const allSimDifficultiesChanged = (
  before: Record<Difficulty, string>,
  after: Record<Difficulty, string>,
) => (["normal", "heroic", "mythic"] as Difficulty[]).every(
  (difficulty) => Boolean(after[difficulty].replace(/\|/g, "")) && after[difficulty] !== before[difficulty],
);
function droptimizerPayload(text: string, c: Raider, selectedSpec: string, difficulty: Difficulty = "normal") {
  const specId = specIds[selectedSpec];
  if (!specId) throw new Error(`Raidbots spec mapping is missing for ${selectedSpec}.`);
  const actor = simcValue(text, c.class === "Death Knight" ? "deathknight" : c.class.toLowerCase().replace(/\s+/g, "_"));
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
const wishlistSignature = (items: Item[]) => items.map((item) => [
  slot(item.slot),
  +item.itemId,
  +(item.sourceItemId || 0),
  Boolean(item.catalyst),
  Boolean(item.crafted),
].join(":"));
const wishlistIsCustomized = (items: Item[], baseline: Item[]) => {
  const selected = wishlistSignature(items), fallback = wishlistSignature(baseline);
  return selected.length !== fallback.length || selected.some((value, index) => value !== fallback[index]);
};
// Only these five slots turn into a tier set piece in the Catalyst.
const TIER_SLOTS = ["HEAD", "SHOULDER", "CHEST", "HANDS", "LEGS"],
  TIER_SLOT_SET = new Set(TIER_SLOTS);
const TIER_VERDICT_ORDER: Record<string, number> = { drop: 0, charge: 1, self: 2, done: 3 };
const TIER_SLOT_HELP: Record<string, string> = {
  tier: "Tier equipped — slot satisfied",
  stored: "Tier piece is in their bags — they just need to put it on",
  ready: "Not tier, but convertible — they hold a catalyst charge",
  waiting: "Convertible base, but no catalyst charge in hand",
  missing: "Nothing here the Catalyst can use — needs a drop",
};
const VIEWS = ["overview", "bosses", "tier", "contested", "audit", "decisions", "history", "wishlist"] as const;
type View = (typeof VIEWS)[number];
// The tab lives in the URL so a view can be linked, bookmarked, reloaded into,
// and walked with the browser's back button.
const viewFromHash = (): View => {
  const raw = window.location.hash.replace(/^#\/?/, "");
  return (VIEWS as readonly string[]).includes(raw) ? (raw as View) : "overview";
};
type NavCounts = { tonight: number; actions: number; history: number; tierNeedsBoss: number };
// Grouped so the bar reads as three jobs — plan the night, make the call, look
// things up — instead of seven equal-weight buttons. Each destination gets its
// own icon; badges say whether a number is a task or just a total.
const NAV_TABS: {
  id: View;
  label: string;
  icon: React.ReactNode;
  group: "plan" | "decide" | "records";
  count?: (counts: NavCounts) => number;
  alert?: boolean;
}[] = [
  { id: "overview", label: "BiS coverage", icon: <LayoutDashboard />, group: "plan" },
  { id: "bosses", label: "Boss targets", icon: <Skull />, group: "plan" },
  { id: "tier", label: "Tier sets", icon: <Shield />, group: "plan", count: (c) => c.tierNeedsBoss, alert: true },
  { id: "contested", label: "Contested loot", icon: <Swords />, group: "plan", count: (c) => c.tonight },
  { id: "decisions", label: "Loot decisions", icon: <Gavel />, group: "decide" },
  { id: "audit", label: "Raid audit", icon: <ClipboardCheck />, group: "decide", count: (c) => c.actions, alert: true },
  { id: "history", label: "Loot history", icon: <History />, group: "records", count: (c) => c.history },
  { id: "wishlist", label: "My wishlist", icon: <Star />, group: "records" },
];
// Roster priority is the bucket on contested loot — who gets it first is the
// call being made. Ordering INSIDE a bucket is by what the item is worth, so
// the top name in each group is the one it helps most.
const ROSTER_BUCKET_HINT: Record<RosterStatus, string> = {
  Main: "first call",
  Trial: "after mains",
  Fill: "last",
};
// BiS coverage answers "are we done with this difficulty", not "can we clear
// it". A slot already holding something at that track or better is covered, so
// there is nothing to gain by running it for that raider.
const coverageVerdict = (percent: number) =>
  percent >= 90
    ? { id: "done", label: "done — skip it" }
    : percent >= 60
      ? { id: "thin", label: "thin returns" }
      : { id: "worth", label: "still worth running" };
const HOUR = 3600000, STALE_HOURS = 12, OLD_HOURS = 36;
const ageInHours = (iso?: string) => {
  const parsed = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(parsed) ? (Date.now() - parsed) / HOUR : null;
};
const relativeAge = (iso?: string) => {
  const hours = ageInHours(iso);
  if (hours === null) return "never";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m ago`;
  if (hours < 48) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};
const ageClass = (iso?: string) => {
  const hours = ageInHours(iso);
  if (hours === null) return "missing";
  return hours >= OLD_HOURS ? "old" : hours >= STALE_HOURS ? "stale" : "fresh";
};
const crestVisuals = {
  champion: { id: 3444, label: "Champion", icon: "inv_121_crest_champion" },
  hero: { id: 3445, label: "Hero", icon: "inv_121_crest_hero" },
  myth: { id: 3446, label: "Myth", icon: "inv_121_crest_myth" },
} as const;
const wowIcon = (icon: string) => `https://wow.zamimg.com/images/wow/icons/large/${icon}.jpg`;
const currentSeasonCraftOrder = (item?: Item) => {
  const bonuses = item?.bonusList || [];
  if (bonuses.includes(13836)) return 3;
  if (bonuses.includes(13835)) return 2;
  if (bonuses.includes(13751)) return 1;
  return 0;
};
const inferredRole = (c: Raider) =>
  c.role === "Tank" ? "Tank" : c.role === "Heal" ? "Healer" : "DPS";
const roleGlyph = (c: Raider) =>
  inferredRole(c) === "Tank" ? "◆" : inferredRole(c) === "Healer" ? "✚" : "⚔";
const roleOrder = { DPS: 0, Tank: 1, Healer: 2 },
  statusOrder: Record<RosterStatus, number> = { Main: 0, Trial: 1, Fill: 2 };
const priorityValue = (c: Raider, overrides: Record<number, RosterStatus>) =>
  statusOrder[overrides[c.id] || c.rosterStatus || "Main"] * 3 +
  roleOrder[inferredRole(c)];
const isExplicitTierTarget = (data: Data, c: Raider, item: Item) => {
  const classTier =
    data.auditActivity?.periodInfo?.current_season?.tier_items_by_slot?.[
      classIds[c.class]
    ] || {};
  return Object.values(classTier).some(
    (id) => Number(id) === Number(item.itemId),
  );
};
const classArmor: Record<string, string> = {
  Mage: "Cloth",
  Priest: "Cloth",
  Warlock: "Cloth",
  Druid: "Leather",
  Monk: "Leather",
  Rogue: "Leather",
  "Demon Hunter": "Leather",
  Hunter: "Mail",
  Shaman: "Mail",
  Evoker: "Mail",
  Warrior: "Plate",
  Paladin: "Plate",
  "Death Knight": "Plate",
};
const tokenFitsClass = (token: Item, c: Raider) =>
  !token.tierToken || norm(token.armorType) === norm(classArmor[c.class]);
const weaponFamilies: Record<string, string[]> = {
  "Death Knight": ["axe", "mace", "sword", "polearm"],
  "Demon Hunter": ["warglaive", "dagger", "fist", "sword"],
  Druid: ["dagger", "fist", "mace", "polearm", "staff"],
  Evoker: ["dagger", "fist", "mace", "staff", "sword"],
  Hunter: [
    "axe",
    "bow",
    "crossbow",
    "fist",
    "gun",
    "polearm",
    "staff",
    "sword",
  ],
  Mage: ["dagger", "staff", "sword"],
  Monk: ["axe", "fist", "mace", "polearm", "staff", "sword"],
  Paladin: ["axe", "mace", "sword", "polearm", "shield"],
  Priest: ["dagger", "mace", "staff"],
  Rogue: ["axe", "dagger", "fist", "mace", "sword"],
  Shaman: ["axe", "dagger", "fist", "mace", "staff", "shield"],
  Warlock: ["dagger", "staff", "sword"],
  Warrior: [
    "axe",
    "dagger",
    "fist",
    "mace",
    "polearm",
    "staff",
    "sword",
    "shield",
  ],
};
const itemEligibleForSpec = (item: Item, c: Raider, spec: string) => {
  const s = slot(item.slot),
    armor = classArmor[c.class];
  if (item.classIds?.length && !item.classIds.includes(classIds[c.class]))
    return false;
  if (
    [
      "HEAD",
      "SHOULDER",
      "CHEST",
      "WRIST",
      "HANDS",
      "WAIST",
      "LEGS",
      "FEET",
    ].includes(s) &&
    item.armorType
  )
    return norm(item.armorType) === norm(armor);
  if (!["MAIN_HAND", "OFF_HAND"].includes(s)) return true;
  const type = norm(item.armorType || item.slot),
    allowed = weaponFamilies[c.class] || [];
  if (
    s === "OFF_HAND" &&
    (type.includes("miscellaneous") ||
      type === "offhand" ||
      type.includes("heldinoffhand"))
  )
    return [
      "Druid",
      "Evoker",
      "Mage",
      "Monk",
      "Priest",
      "Shaman",
      "Warlock",
    ].includes(c.class);
  if (!allowed.some((family) => type.includes(norm(family)))) return false;
  if (c.class === "Hunter")
    return /Survival/.test(spec)
      ? !/(bow|gun|crossbow)/.test(type)
      : /(bow|gun|crossbow)/.test(type);
  if (/Protection Warrior|Protection Paladin/.test(spec) && s === "OFF_HAND")
    return type.includes("shield");
  if (
    /Holy Paladin|Restoration Shaman|Elemental Shaman/.test(spec) &&
    s === "OFF_HAND"
  )
    return type.includes("shield") || /heldinoffhand/.test(type);
  return true;
};

const catalystStatsMatch = (equippedItem?: Item, desiredBase?: Item) => {
  const profile = (item?: Item) => {
    const stats = (item?.secondaryStats || []).filter((stat) => stat.value > 0),
      total = stats.reduce((sum, stat) => sum + stat.value, 0);
    return total
      ? new Map(
          stats.map((stat) => [
            stat.type.replace(/_RATING$/u, ""),
            stat.value / total,
          ]),
        )
      : null;
  };
  const actual = profile(equippedItem),
    desired = profile(desiredBase);
  if (!actual || !desired) return null;
  if (
    actual.size !== desired.size ||
    [...desired.keys()].some((key) => !actual.has(key))
  )
    return false;
  return [...desired].every(
    ([key, ratio]) => Math.abs((actual.get(key) || 0) - ratio) <= 0.06,
  );
};
const trackValue = (track?: string) => {
  const value = norm(track);
  return value.includes("myth")
    ? 3
    : value.includes("hero")
      ? 2
      : value.includes("champion")
        ? 1
        : 0;
};
const targetSatisfiedAtTrack = (
  data: Data,
  c: Raider,
  target: Item,
  targetTrack: string,
) => {
  const required = trackValue(targetTrack),
    exact = c.equipment.find((item) => +item.itemId === +target.itemId),
    base = target.sourceItemId
      ? c.equipment.find((item) => +item.itemId === Number(target.sourceItemId))
      : undefined;
  if (base && trackValue(base.track) >= required) return true;
  if (!exact || trackValue(exact.track) < required) return false;
  if (!target.catalyst) return true;
  const desiredBase = data.seasonLoot?.items.find(
    (item) => +item.itemId === Number(target.sourceItemId),
  );
  return catalystStatsMatch(exact, desiredBase) === true;
};
const enchantSlots = new Set([
  "HEAD",
  "SHOULDER",
  "CHEST",
  "LEGS",
  "FEET",
  "FINGER_1",
  "FINGER_2",
  "MAIN_HAND",
]);
// `week` carries this raid week's homework: the droptimizer WoWAudit holds and
// the /simc capture the tier page needs. Both expire at Tuesday's reset, so
// "ran it once in week one" is not the same as done.
function auditRaider(c: Raider, week?: { sims?: any; snapshot?: any }) {
  const issues: {
    severity: "critical" | "warning";
    label: string;
    detail: string;
    item?: Item;
  }[] = [];
  const embellishments = c.equipment.filter((item) => item.embellished);
  if (embellishments.length < 2)
    issues.push({
      severity: "critical",
      label: "Missing embellishment",
      detail: `${embellishments.length}/2 equipped · Add ${2 - embellishments.length} more`,
    });
  for (const item of c.equipment) {
    const enchants = (item as any).enchantments || [];
    const needsEnchant =
      enchantSlots.has(item.slot) ||
      (item.slot === "OFF_HAND" && item.isWeapon);
    if (needsEnchant && (item.itemLevel || 0) >= 279 && !enchants.length)
      issues.push({
        severity: "critical",
        label: "Missing enchant",
        detail: item.slot.replace("_", " "),
        item,
      });
    const permanent = enchants.filter(
      (e: any) => e.enchantment_slot?.type === "PERMANENT",
    );
    if (
      permanent.some(
        (e: any) => Number(e.display_string?.match(/Tier(\d+)/)?.[1] || 2) < 2,
      )
    )
      issues.push({
        severity: "warning",
        label: "Lower-tier enchant",
        detail:
          permanent[0]?.display_string?.replace(/\|A.*$/u, "") || item.slot,
        item,
      });
    const emptySockets = ((item as any).sockets || []).filter(
      (s: any) => !s.item?.id,
    );
    if (emptySockets.length)
      issues.push({
        severity: "critical",
        label: "Empty socket",
        detail: `${item.slot.replace("_", " ")} · ${emptySockets.length} empty`,
        item,
      });
    const lowGems = ((item as any).sockets || []).filter(
      (s: any) =>
        s.item?.id &&
        !/^Flawless /u.test(s.item.name) &&
        !/ Diamond$/u.test(s.item.name),
    );
    if (lowGems.length)
      issues.push({
        severity: "warning",
        label: "Lower-tier gem",
        detail: lowGems.map((s: any) => s.item.name).join(", "),
        item,
      });
  }
  const gems = c.equipment
    .flatMap((i: any) => i.sockets || [])
    .filter((s: any) => s.item?.id);
  if (gems.length && !gems.some((s: any) => / Diamond$/u.test(s.item.name)))
    issues.push({
      severity: "warning",
      label: "Epic gem missing",
      detail: "No Eversong Diamond equipped",
    });
  const endgame = c.equipment.filter((i) => (i.itemLevel || 0) >= 279);
  const average = endgame.length
    ? endgame.reduce((n, i) => n + (i.itemLevel || 0), 0) / endgame.length
    : 0;
  if (c.equipment.length < 15)
    issues.push({
      severity: "warning",
      label: "Gear incomplete",
      detail: `${c.equipment.length}/16 slots detected`,
    });
  // A missing or stale droptimizer is not cosmetic: simFor drops last week's
  // numbers, so loot ranking silently falls back to item level for this raider.
  const newestSim = simTimestamps(week?.sims, c.id)[0];
  if (!newestSim)
    issues.push({
      severity: "critical",
      label: "No droptimizer sim",
      detail: "Never uploaded · loot ranking falls back to item level",
    });
  else if (isBeforeReset(newestSim))
    issues.push({
      severity: "critical",
      label: "Sim expired at reset",
      detail: `Last run ${new Date(newestSim).toLocaleDateString()} · re-run for this week`,
    });
  const capturedAt = week?.snapshot?.capturedAt;
  if (!capturedAt)
    issues.push({
      severity: "warning",
      label: "No /simc capture",
      detail: "Tier pieces, vault, crests and catalyst charges all unknown",
    });
  else if (isBeforeReset(capturedAt))
    issues.push({
      severity: "warning",
      label: "/simc capture expired",
      detail: `Captured ${new Date(capturedAt).toLocaleDateString()} · vault and charges are last week's`,
    });
  return {
    c,
    issues,
    average,
    critical: issues.filter((i) => i.severity === "critical").length,
  };
}
const unlockedProgress = (slots: number[], thresholds: number[]) =>
  slots.length ? thresholds[Math.min(slots.length, thresholds.length) - 1] : 0;
function vaultTip(
  kind: "raid" | "dungeon" | "world",
  index: number,
  value: number | undefined,
  weekly: any,
  rio: any,
) {
  const thresholds =
    kind === "raid" ? [2, 4, 6] : kind === "dungeon" ? [1, 4, 8] : [2, 4, 8];
  const threshold = thresholds[index],
    label =
      kind === "raid"
        ? "raid bosses"
        : kind === "dungeon"
          ? "qualifying dungeon runs"
          : "Delve / World activities";
  const ordinal =
    threshold === 1
      ? "highest"
      : `${threshold}${threshold === 2 ? "nd" : threshold === 4 ? "th" : "th"}-highest`;
  let detail =
    "REPORTED ONLY · WoWAudit supplies the reward level, but public APIs do not expose the underlying weekly activities.";
  const rioRuns = rio?.weeklyRuns || [];
  if (kind === "dungeon" && rioRuns.length >= threshold) {
    const runs = [...rioRuns].sort(
      (a: any, b: any) =>
        Number(b.mythic_level || 0) - Number(a.mythic_level || 0),
    );
    detail = `ACTIVITY VERIFIED · Raider.IO\n${runs
      .slice(0, threshold)
      .map((r: any) => `${r.dungeon} +${r.mythic_level}`)
      .join(" · ")}`;
  }
  return value
    ? `UNLOCKED · ${value} item level (WoWAudit reported)\nUses the ${ordinal} result after ${threshold} ${label}.\n${detail}`
    : `LOCKED\nComplete ${threshold} ${label} to unlock this reward choice.`;
}
function WowItem({ item, size = 44 }: { item: Item; size?: number }) {
  const bonus = item.bonusList?.length ? item.bonusList.join(":") : "",
    options = [
      bonus ? `bonus=${bonus}` : "",
      item.itemLevel ? `ilvl=${item.itemLevel}` : "",
    ].filter(Boolean),
    wowhead = `item=${item.itemId}${options.length ? `&${options.join("&")}` : ""}`;
  return (
    <a
      className="item-art"
      href={`https://www.wowhead.com/item=${item.itemId}${options.length ? `?${options.join("&")}` : ""}`}
      data-wowhead={wowhead}
      target="_blank" rel="noreferrer"
    >
      <img
        src={
          item.icon ||
          "https://wow.zamimg.com/images/wow/icons/large/inv_misc_questionmark.jpg"
        }
        width={size}
        height={size}
      />
    </a>
  );
}
function TierResourceSnapshot({ info, visuals, icons = {}, compact = false }: { info: any; visuals: Map<number, Item>; icons?: Record<string, string>; compact?: boolean }) {
  if (!info?.snapshotAt) return (
    <div className={`tier-resource-snapshot no-data ${compact ? "compact" : ""}`}>
      <div className="resource-empty"><CircleAlert /><span><strong>SIMC NEEDED</strong><small>Tier resources not captured</small></span></div>
    </div>
  );
  const catalystId = info.catalystId || MIDNIGHT_S2_CATALYST,
    catalyst = (CATALYST_CURRENCIES as Record<string, { name: string; icon: string }>)[String(catalystId)],
    catalystName = catalyst?.name || `Catalyst currency ${catalystId}`,
    choices = [
      ...(info.vaultTier || []).map((item: Item) => ({ item, kind: "tier" as const })),
      ...(info.vaultCatalyst || []).map((item: Item) => ({ item, kind: "catalyst" as const })),
      ...(info.vaultOther || []).map((item: Item) => ({ item, kind: "other" as const })),
    ],
    // Bags are a holding, not something the character is wearing. Own row.
    bagged = [
      ...(info.bagTier || []).map((item: Item) => ({ item, kind: "tier" as const })),
      ...(info.bagBases || []).map((item: Item) => ({ item, kind: "base" as const })),
    ];
  const preReset = isBeforeReset(info.snapshotAt);
  return (
    <div className={`tier-resource-snapshot ${compact ? "compact" : ""}`} title={`SimC captured ${new Date(info.snapshotAt).toLocaleString()}`}>
      <div className={`snapshot-age ${preReset ? "pre-reset" : ageClass(info.snapshotAt)}`}>
        {preReset ? <CircleAlert /> : <RefreshCw />}
        <span>
          {info.crestsMissing
            ? `SimC captured ${relativeAge(info.snapshotAt)}, but it exported no currencies — crest counts are unknown. Usually an out-of-date SimulationCraft addon: update it and re-export.`
            : preReset
            ? `SimC captured ${relativeAge(info.snapshotAt)} — before this week's reset. Crests, vault and catalyst below are last week's.`
            : `SimC captured ${relativeAge(info.snapshotAt)}`}
        </span>
      </div>
      <div className="resource-currencies">
        <a className={`catalyst-currency ${info.catalystCharges > 0 ? "available" : "empty"}`} href={`https://www.wowhead.com/currency=${catalystId}`} data-wowhead={`currency=${catalystId}`} target="_blank" rel="noreferrer" title={`${catalystName} · ${info.catalystCharges} charge${info.catalystCharges === 1 ? "" : "s"}`}>
          <img src={wowIcon(catalyst?.icon || CATALYST_CURRENCIES[MIDNIGHT_S2_CATALYST].icon)} />
          <span><strong>{info.catalystCharges}</strong><small>{catalyst ? catalystName.split(" ")[0].toUpperCase() : "CATALYST"}</small></span>
          {info.catalystDelta !== null && info.catalystDelta !== 0 && <em>{info.catalystDelta > 0 ? "+" : ""}{info.catalystDelta}</em>}
        </a>
        <div className="crest-icons">
          {(Object.keys(crestVisuals) as (keyof typeof crestVisuals)[]).map((key) => { const crest = crestVisuals[key]; return (
            <a href={`https://www.wowhead.com/currency=${crest.id}`} data-wowhead={`currency=${crest.id}`} target="_blank" rel="noreferrer" className={key} key={key}>
              <img src={wowIcon(crest.icon)} /><span><strong>{info.crestsMissing ? "?" : info.crests?.[key] || 0}</strong><small>{crest.label}</small></span>
            </a>
          ); })}
        </div>
      </div>
      <div className="vault-choice-icons">
        <b>VAULT</b>
        {choices.length === 0 && <span className="vault-empty">No reward choices unlocked this week.</span>}
        {choices.map(({ item, kind }, index) => {
          const visual = { ...item, ...(visuals.get(+item.itemId) || {}), icon: visuals.get(+item.itemId)?.icon || item.icon || icons[String(item.itemId)], bonusList: item.bonusList, itemLevel: item.itemLevel },
            track = currentSeasonTrackName(item), rank = currentSeasonTrackRank(item),
            badge = kind === "tier" ? "TIER" : kind === "catalyst" ? "↻" : "",
            detail = [visual.itemLevel ? `${visual.itemLevel} ilvl` : "", track ? `${track} ${rank}/6` : "", badge].filter(Boolean).join(" · ");
          return <div className={kind === "tier" ? "exact" : kind} key={`${item.itemId}-${index}`} title={`${visual.name}\n${detail}\n${kind === "tier" ? "Exact tier option" : kind === "catalyst" ? "Can be catalyzed into tier" : "Vault reward choice"}`}>
            <WowItem item={visual} size={compact ? 32 : 38} />
            <span><strong>{visual.name}</strong><small>{detail || "—"}</small></span>
          </div>;
        })}
      </div>
      {bagged.length > 0 && (
        <div className="vault-choice-icons bags-row">
          <b>BAGS</b>
          {bagged.map(({ item, kind }, index) => {
            const visual = { ...item, ...(visuals.get(+item.itemId) || {}), icon: visuals.get(+item.itemId)?.icon || item.icon || icons[String(item.itemId)], bonusList: item.bonusList, itemLevel: item.itemLevel },
              track = currentSeasonTrackName(item), rank = currentSeasonTrackRank(item),
              detail = [
                slot(item.slot)[0] + slot(item.slot).slice(1).toLowerCase(),
                track ? `${track} ${rank}/6` : "",
                kind === "tier" ? "EQUIP IT" : "↻ BASE",
              ].filter(Boolean).join(" · ");
            return (
              <div
                className={kind === "tier" ? "exact" : "catalyst"}
                key={`bag-${item.itemId}-${index}`}
                title={`${visual.name}\n${detail}\n${kind === "tier" ? "Tier piece in their bags — they only need to equip it" : "Catalyst base in their bags"}`}
              >
                <WowItem item={visual} size={compact ? 32 : 38} />
                <span><strong>{visual.name}</strong><small>{detail}</small></span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
// Every source below is a snapshot taken by a local npm script, so the board can
// look confidently wrong hours after the game state moved on. Show the age.
// The board never tells anyone to run a command — refreshing is the scheduled
// workflow's job. This only reports how old the numbers are.
function DataFreshness({ data, compact = false }: { data: Data; compact?: boolean }) {
  const sources = [
    { label: "Roster & gear", at: data.refreshedAt },
    { label: "WoWAudit activity", at: data.auditActivity?.fetchedAt },
    { label: "Raider.IO", at: data.raiderio?.fetchedAt },
  ];
  const stale = sources.filter((s) => ["stale", "old", "missing"].includes(ageClass(s.at))),
    sims = simStatus(data.sims),
    resetAt = lastWeeklyReset();
  return (
    <div className={`data-freshness ${stale.length ? "has-stale" : ""} ${compact ? "compact" : ""}`}>
      <div className="freshness-sources">
        <RefreshCw />
        {sources.map((source) => (
          <span
            className={`freshness-source ${ageClass(source.at)}`}
            key={source.label}
            title={`${source.label}\nCaptured ${source.at ? new Date(source.at).toLocaleString() : "never"}`}
          >
            <b>{source.label}</b>
            <em>{relativeAge(source.at)}</em>
          </span>
        ))}
        <span
          className={`freshness-source ${sims.expired > 0 ? "old" : sims.current > 0 ? "fresh" : "missing"}`}
          title={`Droptimizer sims\nValid for this raid week only (since ${resetAt.toLocaleString()}).\n${sims.current} current · ${sims.expired} expired at reset · ${sims.never} never simmed`}
        >
          <b>Sims</b>
          <em>{sims.current}/{sims.current + sims.expired + sims.never}</em>
        </span>
      </div>
      {(sims.expired > 0 || sims.current === 0) && (
        <p className="freshness-warning">
          <CircleAlert />
          {sims.expired > 0
            ? `${sims.expired} raider${sims.expired === 1 ? "'s sim" : "s' sims"} expired at Tuesday's reset and no longer count toward loot ranking.`
            : "No current droptimizer sims — loot ranking is falling back to item level."}{" "}
          Sims must be re-run each week after reset.
        </p>
      )}
      {stale.length > 0 && (
        <p className="freshness-warning">
          <CircleAlert />
          {stale.length === sources.length
            ? `Gear and activity are from ${relativeAge(sources[0].at)} — this board is a snapshot, not a live feed.`
            : `${stale.map((s) => s.label).join(" and ")} ${stale.length === 1 ? "is" : "are"} behind (${stale.map((s) => relativeAge(s.at)).join(", ")}).`}
        </p>
      )}
    </div>
  );
}
type Command = { id: string; label: string; hint: string; kind: string; run: () => void };
// Seven destinations plus 25 raiders plus 8 bosses is too much to put in a bar,
// and burying any of it in dropdowns trades discoverability for tidiness. A
// palette is how real products square that: everything stays one keystroke away.
function CommandPalette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [query, setQuery] = useState(""),
    [active, setActive] = useState(0),
    inputRef = useRef<HTMLInputElement>(null),
    listRef = useRef<HTMLDivElement>(null);
  const needle = norm(query),
    matches = (needle ? commands.filter((c) => norm(`${c.label} ${c.kind}`).includes(needle)) : commands).slice(0, 40);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, matches.length]);
  const choose = (command?: Command) => { if (command) { command.run(); onClose(); } };
  return (
    <div className="palette-backdrop" onClick={onClose} role="presentation">
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Jump to"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          placeholder="Jump to a view, raider, or boss…"
          aria-label="Jump to"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
            else if (event.key === "ArrowDown") { event.preventDefault(); setActive((n) => Math.min(n + 1, matches.length - 1)); }
            else if (event.key === "ArrowUp") { event.preventDefault(); setActive((n) => Math.max(n - 1, 0)); }
            else if (event.key === "Enter") { event.preventDefault(); choose(matches[active]); }
          }}
        />
        <div className="palette-results" ref={listRef}>
          {matches.length === 0 && <p className="palette-empty">Nothing matches “{query}”.</p>}
          {matches.map((command, index) => (
            <button
              type="button"
              key={command.id}
              data-active={index === active}
              className={index === active ? "active" : ""}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(command)}
            >
              <span className="palette-kind">{command.kind}</span>
              <strong>{command.label}</strong>
              <em>{command.hint}</em>
            </button>
          ))}
        </div>
        <footer className="palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
        </footer>
      </div>
    </div>
  );
}
function RaiderIdentity({
  c,
  spec,
  status = "Main",
  detail,
  compact = false,
  chip = false,
}: {
  c: Raider;
  spec: string;
  status?: RosterStatus;
  detail?: string;
  compact?: boolean;
  chip?: boolean;
}) {
  const role = inferredRole(c);
  // Main is the default and every list is mostly Mains, so a chip on all three
  // would be noise that hides the two worth noticing.
  const showChip = chip && status !== "Main";
  return (
    <div
      className={`raider-identity ${status.toLowerCase()} ${compact ? "compact" : ""} ${showChip ? "has-chip" : ""}`}
      style={{ "--class": colors[c.class] } as React.CSSProperties}
      title={`${status} · ${role} · ${spec}`}
    >
      <span className="raider-portrait">
        <img src={specIconUrl(spec)} alt="" />
        <i className={`wow-role-icon ${role.toLowerCase()}`} aria-label={role} />
      </span>
      <span className="raider-copy">
        <strong>{c.name}</strong>
        {showChip && <em className={`roster-chip ${status.toLowerCase()}`}>{status.toUpperCase()}</em>}
        {detail && <small>{detail}</small>}
      </span>
    </div>
  );
}
// Healers sim in QE Live, which WoWAudit does not hold, so their droptimizer
// lookup finds nothing and the item falls back to item level. If this character
// has a QE report for the spec and difficulty being asked about, use it. QE
// percentages are the same measure as a droptimizer's, and both expire at reset.
function qeSimFor(
  data: Data,
  c: Raider,
  item: Item,
  selectedDifficulty: Difficulty,
  selectedSpec: string,
) {
  const report = data.qeReports?.[String(c.id)];
  if (!report || isBeforeReset(report.capturedAt)) return null;
  // A report describes one spec. Do not lend its numbers to another.
  if (report.spec && norm(report.spec) !== norm(selectedSpec)) return null;
  const value = report.difficulties?.[selectedDifficulty]?.[String(item.itemId)];
  return Number.isFinite(Number(value)) ? Number(value) : null;
}
// WoWAudit files a wishlist per instance, and this used to pin instance 80 —
// The Venomous Abyss. Every sim for a boss in any other raid was therefore read
// as "no sim": The Tidebound Grotto is instance 81, already simmed on all three
// difficulties for the whole roster, and all of it was being thrown away, so
// Nymrissa's drops ranked on item level alone.
//
// Match the instance the boss actually belongs to. Fall back to the encounter
// name, then to the old pin, so a rename upstream degrades to today's behaviour
// rather than to nothing.
function simInstanceFor(entry: any, boss: Boss, data: Data) {
  const instances = entry?.instances || [],
    raidName = boss.raid || data.raid.raid;
  return (
    instances.find((x: any) => norm(x.name) === norm(raidName)) ||
    instances.find((x: any) =>
      (x.difficulties || []).some((d: any) =>
        (d.wishlist?.encounters || []).some((e: any) => norm(e.name) === norm(boss.name)),
      ),
    ) ||
    instances.find((x: any) => +x.id === 80)
  );
}
// Leave a trace for every /simc paste, so "he says he simmed and the board has
// nothing" is answerable. A failure is the case that matters and the case that
// currently records nothing: the snapshot is only written on success, and a
// client-side failure never reaches Apps Script at all. Send the export with a
// failure so the attempt can be reproduced.
//
// Never awaited and never allowed to throw. Diagnostics must not be able to
// break the thing they are diagnosing.
function logSimcAttempt(
  wishlistApiUrl: string,
  c: Raider,
  lootSpec: string,
  step: string,
  ok: boolean,
  detail = "",
  simc = "",
) {
  if (!wishlistApiUrl) return;
  try {
    void fetch(wishlistApiUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "logSimcAttempt",
        characterId: c.id, characterName: c.name, lootSpec,
        step, ok, detail: String(detail).slice(0, 500),
        ...(ok ? {} : { simc }),
      }),
    }).catch(() => {});
  } catch {
    /* diagnostics are best effort */
  }
}
function simFor(
  data: Data,
  c: Raider,
  item: Item,
  boss: Boss,
  selectedDifficulty: Difficulty,
  selectedSpec = c.defaultSpec,
) {
  // QE is the authoritative source for healers, so it outranks a droptimizer
  // rather than merely filling in for a missing one. A healer who also ran
  // Raidbots would otherwise be ranked on a number built for damage.
  if (inferredRole(c) === "Healer") {
    const healerScore = qeSimFor(data, c, item, selectedDifficulty, selectedSpec);
    if (healerScore !== null) return healerScore;
  }
  const root = data.sims?.characters || [],
    entry = root.find((x: any) => +x.id === +c.id),
    instance = simInstanceFor(entry, boss, data),
    difficulty = instance?.difficulties?.find(
      (x: any) => x.difficulty === selectedDifficulty,
    ),
    encounter = difficulty?.wishlist?.encounters?.find(
      (x: any) => norm(x.name) === norm(boss.name),
    ),
    hit = encounter?.items?.find(
      (x: any) =>
        +(x.item_id ?? x.itemId ?? x.id) === +item.itemId ||
        norm(x.name ?? x.item_name) === norm(item.name),
    );
  const specName = selectedSpec.replace(new RegExp(`\\s+${c.class}$`, "i"), ""),
    reportIds = difficulty?.wishlist?.report_id,
    specReportId = reportIds?.[specName];
  // A droptimizer only describes the week it ran in. Gear, vault and crests all
  // move at Tuesday's reset, so last week's percentages rank people wrongly —
  // drop them rather than let a stale number decide who gets loot.
  if (isBeforeReset(difficulty?.wishlist?.updated_at?.[specName]))
    return qeSimFor(data, c, item, selectedDifficulty, selectedSpec);
  const
    specScore = hit?.score_by_spec?.[specName]?.percentage,
    wishScore = hit?.wishes?.find(
      (wish: any) => norm(wish.specialization) === norm(specName),
    )?.percentage;
  for (const value of [specScore, wishScore]) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  // Generic percentages belong to the spec that generated the report. Do not
  // leak them into a newly selected spec that has not been simulated yet.
  if (reportIds && !specReportId) return qeSimFor(data, c, item, selectedDifficulty, selectedSpec);
  for (const k of [
    "upgrade_percentage",
    "item_percentage",
    "percentage",
    "relative_gain",
    "relative",
    "gain_percentage",
  ]) {
    const n = Number(hit?.[k]);
    if (Number.isFinite(n)) return n;
  }
  return qeSimFor(data, c, item, selectedDifficulty, selectedSpec);
}
function targetSatisfactionReason(data: Data, c: Raider, entry: any, selectedDifficulty: Difficulty, selectedSpec: string) {
  const required = selectedDifficulty === "mythic" ? 3 : selectedDifficulty === "heroic" ? 2 : 1;
  if (entry.target?.crafted && entry.exact && !entry.suboptimal && currentSeasonCraftOrder(entry.current) >= required) return "bis";
  const
    currentOrder = currentSeasonTrackOrder(entry.current);
  if (entry.exact && !entry.suboptimal && currentOrder >= required) return "bis";
  if (!entry.exact && currentOrder > required) return "higher";
  if (!entry.inRaid) return null;
  const simulatedGain = simFor(data, c, entry.source.item, entry.source.raidBoss, selectedDifficulty, selectedSpec);
  return simulatedGain !== null && simulatedGain <= 0 ? "sim" : null;
}
const targetSatisfiedAtDifficulty = (data: Data, c: Raider, entry: any, selectedDifficulty: Difficulty, selectedSpec: string) =>
  Boolean(targetSatisfactionReason(data, c, entry, selectedDifficulty, selectedSpec));
export default function App() {
  const simResumeAttempted = useRef(false);
  const [data, setData] = useState<Data | null>(null),
    [liveSims, setLiveSims] = useState<any>(null),
    [bossIndex, setBoss] = useState(0),
    [difficulty, setDifficulty] = useState<Difficulty>(
      () =>
        (localStorage.getItem("onlyflasks-difficulty") as Difficulty) ||
        "mythic",
    ),
    [view, setView] = useState<View>(viewFromHash),
    [open, setOpen] = useState(false),
    [rosterStatuses, setRosterStatuses] = useState<
      Record<number, RosterStatus>
    >({}),
    [specs, setSpecs] = useState<Record<number, string>>(() =>
      JSON.parse(localStorage.getItem("onlyflasks-board-specs-v1") || "{}"),
    ),
    [customWishlists, setCustomWishlists] = useState<Record<number, Item[]>>(
      () =>
        JSON.parse(
          localStorage.getItem("onlyflasks-custom-wishlists-v3") || "{}",
        ),
    ),
    [simcSnapshots, setSimcSnapshots] = useState<Record<number, any>>({}),
    [qeReports, setQeReports] = useState<Record<string, any>>({}),
    [qeQueue, setQeQueue] = useState<Record<string, any>>({}),
    [wishlistCharacter, setWishlistCharacter] = useState<number | null>(null),
    [wishlistApiUrl, setWishlistApiUrl] = useState(""),
    [officerUnlocked, setOfficerUnlocked] = useState(false),
    [officerPrompt, setOfficerPrompt] = useState(false),
    [officerPassphrase, setOfficerPassphrase] = useState(""),
    [officerError, setOfficerError] = useState(""),
    [officerBusy, setOfficerBusy] = useState(false),
    [rosterSaveState, setRosterSaveState] = useState<
      "idle" | "saving" | "saved" | "error"
    >("idle"),
    [syncState, setSyncState] = useState<
      "idle" | "loading" | "saving" | "saved" | "error"
    >("idle"),
    [loadError, setLoadError] = useState(""),
    [reloadToken, setReloadToken] = useState(0),
    [paletteOpen, setPaletteOpen] = useState(false),
    [simcText, setSimcText] = useState(""),
    [simState, setSimState] = useState<SimState>("idle"),
    [simMessage, setSimMessage] = useState(""),
    [simReports, setSimReports] = useState<SimReport[]>([]);
  useEffect(() => {
    let cancelled = false;
    setLoadError("");
    fetch("./loot-data.json", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`loot-data.json returned HTTP ${r.status}`);
        return r.json();
      })
      .then((payload) => { if (!cancelled) setData(payload); })
      .catch((error) => {
        console.error(error);
        // Without this the app sat on the loading message forever.
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Could not load the board data.");
      });
    return () => { cancelled = true; };
  }, [reloadToken]);
  useEffect(() => {
    const onHashChange = () => setView(viewFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((wasOpen) => !wasOpen);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      // Never steal a digit from someone filling in the SimC box or a picker.
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (event.key === "/") { event.preventDefault(); setPaletteOpen(true); return; }
      const index = Number(event.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < NAV_TABS.length) setView(NAV_TABS[index].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (viewFromHash() !== view) window.location.hash = `#/${view}`;
  }, [view]);
  useEffect(() => {
    if (liveSims) setData((current) => current ? { ...current, sims: liveSims } : current);
  }, [liveSims]);
  useEffect(() => {
    setData((current) => (current ? { ...current, qeReports } : current));
  }, [qeReports]);
  // A queued QE run lands in well under a minute, but nothing pushes that back
  // to the page, so the panel used to sit there telling the healer to reload —
  // which reads as a hang however fast the run actually was. Poll while a job is
  // in flight and let the difficulty tiles fill themselves in.
  //
  // Depend on the boolean, not on qeQueue: polling replaces that object every
  // tick, so an effect keyed on it would tear down and restart its own timer.
  const qeWaiting = Object.values(qeQueue).some(
    (job: any) => job?.state === "pending" || job?.state === "running",
  );
  useEffect(() => {
    if (!wishlistApiUrl || !qeWaiting) return;
    let stopped = false;
    const startedAt = Date.now(),
      timer = setInterval(async () => {
        // Give up after six minutes rather than polling a wedged job forever;
        // the panel still shows whatever state the queue last reported.
        if (stopped || Date.now() - startedAt > 360000) { clearInterval(timer); return; }
        try {
          const payload = await (await fetch(wishlistApiUrl, { cache: "no-store" })).json();
          if (stopped || !payload.ok) return;
          setQeQueue(payload.qeQueue || {});
          setQeReports(payload.qeReports || {});
        } catch {
          // A dropped poll is not worth surfacing — the next tick retries.
        }
      }, 5000);
    return () => { stopped = true; clearInterval(timer); };
  }, [wishlistApiUrl, qeWaiting]);
  useEffect(() => {
    fetch("./app-config.json", { cache: "no-store" })
      .then((r) => r.json())
      .then(async (config) => {
        const url = String(config.wishlistApiUrl || "").trim();
        setWishlistApiUrl(url);
        if (!url) return;
        setSyncState("loading");
        const response = await fetch(url, { cache: "no-store" });
        const payload = await response.json();
        if (!payload.ok)
          throw new Error(payload.error || "Could not load shared wishlists");
        const lists: Record<number, Item[]> = {},
          sharedSpecs: Record<number, string> = {};
        for (const entry of payload.wishlists || []) {
          lists[+entry.characterId] = entry.wishlist || [];
          sharedSpecs[+entry.characterId] = entry.lootSpec;
        }
        setRosterStatuses(payload.rosterStatuses || {});
        setSimcSnapshots(payload.simcSnapshots || {});
        setQeReports(payload.qeReports || {});
        setQeQueue(payload.qeQueue || {});
        fetch(url, {
          method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ action: "getWowauditSims" }),
        }).then((result) => result.json()).then((result) => { if (result.ok && result.sims) setLiveSims(result.sims); }).catch(console.error);
        setCustomWishlists(lists);
        setSpecs((current) => ({ ...current, ...sharedSpecs }));
        localStorage.setItem(
          "onlyflasks-custom-wishlists-v3",
          JSON.stringify(lists),
        );
        localStorage.setItem(
          "onlyflasks-board-specs-v1",
          JSON.stringify({ ...specs, ...sharedSpecs }),
        );
        const officerToken =
          localStorage.getItem("onlyflasks-officer-session") || "";
        if (officerToken) {
          const verifyResponse = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
              action: "officerVerify",
              token: officerToken,
            }),
          });
          const verification = await verifyResponse.json();
          if (verification.ok && verification.authorized)
            setOfficerUnlocked(true);
          else localStorage.removeItem("onlyflasks-officer-session");
        }
        setSyncState("idle");
      })
      .catch((error) => {
        console.error(error);
        setSyncState("error");
      });
  }, []);
  useEffect(() => {
    (window as any).$WowheadPower?.refreshLinks();
  }, [data, bossIndex, difficulty, view, customWishlists]);
  const refreshLiveSims = async ({
    before,
    character,
    selectedSpec,
    attempts = 1,
    announce = true,
  }: {
    before?: Record<Difficulty, string>;
    character?: Raider;
    selectedSpec?: string;
    attempts?: number;
    announce?: boolean;
  } = {}) => {
    if (!wishlistApiUrl) return false;
    if (announce) {
      setSimState("refreshing");
      setSimMessage(before ? "Waiting for all three new WoWAudit reports…" : "Refreshing simulations from WoWAudit…");
    }
    try {
      for (let attempt = 0; attempt < attempts; attempt++) {
        const response = await fetch(wishlistApiUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ action: "getWowauditSims" }),
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok || !result.ok || !result.sims)
          throw new Error(result.error || `WoWAudit refresh failed (${response.status}).`);
        const fresh = !before || !character || !selectedSpec || allSimDifficultiesChanged(
          before,
          simFreshness(result.sims, character.id, simSpecName(character, selectedSpec)),
        );
        if (fresh) {
          setLiveSims(result.sims);
          if (announce) {
            setSimState("uploaded");
            setSimMessage("Normal, Heroic, and Mythic simulations are synchronized.");
          }
          localStorage.removeItem("onlyflasks-pending-sim-refresh-v1");
          return true;
        }
        if (attempt < attempts - 1)
          await new Promise((resolve) => window.setTimeout(resolve, 5000));
      }
      if (announce) {
        setSimState("stale");
        setSimMessage("Raidbots finished, but WoWAudit still has the previous reports. Retry refresh—do not rerun the sims.");
      }
      return false;
    } catch (error) {
      if (announce) {
        setSimState("stale");
        setSimMessage(error instanceof Error ? `${error.message} Retry refresh—your completed sims are safe.` : "Refresh failed. Retry without rerunning sims.");
      }
      return false;
    }
  };
  useEffect(() => {
    if (!wishlistApiUrl || !data || simResumeAttempted.current) return;
    let pending: any = null;
    try { pending = JSON.parse(localStorage.getItem("onlyflasks-pending-sim-refresh-v1") || "null"); } catch { /* ignore damaged local state */ }
    if (!pending?.before || !pending?.characterId || !pending?.selectedSpec) return;
    const character = data.characters.find((entry) => +entry.id === +pending.characterId);
    if (!character) return;
    simResumeAttempted.current = true;
    setWishlistCharacter(character.id);
    if (Array.isArray(pending.reportUrls))
      setSimReports(pending.reportUrls.map((report: any) => ({ ...report, state: "uploaded" })));
    void refreshLiveSims({ before: pending.before, character, selectedSpec: pending.selectedSpec, attempts: 13 });
  }, [wishlistApiUrl, data]);
  const officerLogin = async () => {
    if (!wishlistApiUrl || !officerPassphrase) return;
    setOfficerBusy(true);
    setOfficerError("");
    try {
      const response = await fetch(wishlistApiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "officerLogin",
          passphrase: officerPassphrase,
        }),
      });
      const payload = await response.json();
      if (!payload.ok || !payload.token)
        throw new Error(payload.error || "Officer access failed");
      localStorage.setItem("onlyflasks-officer-session", payload.token);
      setOfficerPassphrase("");
      setOfficerPrompt(false);
      setOfficerUnlocked(true);
    } catch (error) {
      setOfficerError(
        error instanceof Error ? error.message : "Officer access failed",
      );
    } finally {
      setOfficerBusy(false);
    }
  };
  const saveRosterStatus = async (c: Raider, status: RosterStatus) => {
    const previous = rosterStatuses[c.id] || c.rosterStatus || "Main",
      next = { ...rosterStatuses, [c.id]: status };
    setRosterStatuses(next);
    setRosterSaveState("saving");
    try {
      const token = localStorage.getItem("onlyflasks-officer-session") || "";
      const response = await fetch(wishlistApiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "setRosterStatus",
          token,
          characterId: c.id,
          characterName: c.name,
          status,
        }),
      });
      const payload = await response.json();
      if (!payload.ok)
        throw new Error(payload.error || "Could not save roster status");
      setRosterSaveState("saved");
      window.setTimeout(() => setRosterSaveState("idle"), 1800);
    } catch (error) {
      setRosterStatuses((current) => ({ ...current, [c.id]: previous }));
      setRosterSaveState("error");
      if (String(error).toLowerCase().includes("expired")) {
        localStorage.removeItem("onlyflasks-officer-session");
        setOfficerUnlocked(false);
      }
    }
  };
  const wishlistFor = (c: Raider) =>
    customWishlists[c.id] ||
    data?.bis.lists[specs[c.id] || c.defaultSpec]?.items ||
    [];
  const model = useMemo(() => {
    if (!data) return [];
    const boss = data.raid.bosses[bossIndex],
      expected = bossLevel(boss, difficulty, bossIndex),
      targetTrack = tracks[difficulty];
    return boss.items
      .map((item) => {
        const people = data.characters.flatMap((c) => {
          const chosen = specs[c.id] || c.defaultSpec,
            list = wishlistFor(c),
            target = list.find(
              (t) =>
                +t.itemId === +item.itemId ||
                Number(t.sourceItemId) === +item.itemId ||
                norm(t.name) === norm(item.name) ||
                (item.tierToken &&
                  !t.catalyst &&
                  tokenFitsClass(item, c) &&
                  isExplicitTierTarget(data, c, t) &&
                  slot(t.slot) === slot(item.slot)),
            );
          if (!target) return [];
          const cur = equipped(c, item, keptForOwnTargets(c, list));
          if (targetSatisfiedAtTrack(data, c, target, targetTrack)) return [];
          return [
            {
              c,
              cur,
              // Everything worn in the slot group. Rings and trinkets fill two
              // slots and we cannot know which one they would actually swap, so
              // the card shows both rather than claiming one is kept.
              worn: equippedGroup(c, item),
              target,
              sim: simFor(data, c, item, boss, difficulty, chosen),
              ilvl: cur ? expected - (cur.itemLevel || 0) : expected,
            },
          ];
        });
        people.sort((a, b) => {
          const roleDifference =
            priorityValue(a.c, rosterStatuses) -
            priorityValue(b.c, rosterStatuses);
          if (roleDifference) return roleDifference;
          return a.sim !== null && b.sim === null
            ? -1
            : a.sim === null && b.sim !== null
              ? 1
              : a.sim !== null && b.sim !== null
                ? b.sim - a.sim
                : b.ilvl - a.ilvl;
        });
        return { item, people };
      })
      .filter((x) => x.people.length);
  }, [data, bossIndex, specs, difficulty, rosterStatuses, customWishlists]);
  const tonight = useMemo(() => {
    if (!data) return [];
    return data.raid.bosses
      .flatMap((boss, bossIndex) => {
        const expected = bossLevel(boss, difficulty, bossIndex),
          targetTrack = tracks[difficulty];
        return boss.items.flatMap((item) => {
          const people = data.characters
            .flatMap((c) => {
              const chosen = specs[c.id] || c.defaultSpec,
                list = wishlistFor(c);
              const target = list.find(
                (t) =>
                  +t.itemId === +item.itemId ||
                  Number(t.sourceItemId) === +item.itemId ||
                  norm(t.name) === norm(item.name) ||
                  (item.tierToken &&
                    !t.catalyst &&
                    tokenFitsClass(item, c) &&
                    isExplicitTierTarget(data, c, t) &&
                    slot(t.slot) === slot(item.slot)),
              );
              if (!target) return [];
              const cur = equipped(c, item, keptForOwnTargets(c, list));
              if (targetSatisfiedAtTrack(data, c, target, targetTrack))
                return [];
              return [
                {
                  c,
                  cur,
                  sim: simFor(data, c, item, boss, difficulty, chosen),
                  ilvl: cur ? expected - (cur.itemLevel || 0) : expected,
                },
              ];
            })
            .sort((a, b) => {
              const ap = priorityValue(a.c, rosterStatuses),
                bp = priorityValue(b.c, rosterStatuses);
              return (
                ap - bp ||
                (a.sim !== null && b.sim === null
                  ? -1
                  : a.sim === null && b.sim !== null
                    ? 1
                    : a.sim !== null && b.sim !== null
                      ? b.sim - a.sim
                      : b.ilvl - a.ilvl)
              );
            });
          const highImpact =
            slot(item.slot) === "TRINKET" ||
            ["MAIN_HAND", "OFF_HAND"].includes(slot(item.slot)) ||
            item.specialEffect;
          return highImpact && people.length > 1
            ? [{ boss, bossIndex, item, people, expected }]
            : [];
        });
      })
      .sort((a, b) => b.people.length - a.people.length)
      .slice(0, 12);
  }, [data, specs, difficulty, rosterStatuses, customWishlists]);
  if (loadError)
    return (
      <div className="board-status error" role="alert">
        <CircleAlert />
        <strong>Could not load the raid board</strong>
        <p>{loadError}</p>
        <p className="muted">
          The board reads a pre-built <code>loot-data.json</code>. If this keeps failing, run{" "}
          <code>npm run build:data</code> to regenerate it.
        </p>
        <button onClick={() => setReloadToken((n) => n + 1)}>
          <RefreshCw /> Try again
        </button>
      </div>
    );
  if (!data)
    return (
      <div className="board-status" role="status" aria-live="polite">
        <RefreshCw className="spin" />
        <strong>Loading the raid board…</strong>
        <p className="muted">Pulling roster, gear, sims, and loot tables.</p>
      </div>
    );
  const visualItems = new Map<number, Item>([
      ...(data.seasonLoot?.items || []),
      ...data.raid.bosses.flatMap((entry) => entry.items),
      ...Object.values(data.bis.lists).flatMap((entry) => entry.items),
    ].map((item) => [+item.itemId, item])),
    boss = data.raid.bosses[bossIndex],
    activityById = new Map(
      (data.auditActivity?.characters || []).map((x: any) => [+x.id, x.data]),
    ),
    raiderById = new Map(
      (data.raiderio?.characters || []).map((x: any) => [+x.id, x]),
    ),
    audits = data.characters
      .map((c) => auditRaider(c, { sims: data.sims, snapshot: simcSnapshots[c.id] }))
      .sort(
        (a, b) =>
          b.critical - a.critical ||
          b.issues.length - a.issues.length ||
          a.c.name.localeCompare(b.c.name),
      ),
    actionCount = audits.filter((x) => x.issues.length).length,
    paletteCommands: Command[] = [
      ...NAV_TABS.map((tab, index) => ({
        id: `view-${tab.id}`,
        label: tab.label,
        hint: `View · press ${index + 1}`,
        kind: "Go to",
        run: () => setView(tab.id),
      })),
      ...data.raid.bosses.map((raidBoss, index) => ({
        id: `boss-${index}`,
        label: raidBoss.name,
        hint: raidBoss.raid && raidBoss.raid !== data.raid.raid ? raidBoss.raid : `Boss ${index + 1} of ${data.raid.bosses.length}`,
        kind: "Boss",
        run: () => { setBoss(index); setView("bosses"); },
      })),
      ...data.characters.map((c) => ({
        id: `raider-${c.id}`,
        label: c.name,
        hint: `${c.class} · ${specs[c.id] || c.defaultSpec || c.role}`,
        kind: "Raider",
        run: () => { setWishlistCharacter(c.id); setView("wishlist"); },
      })),
      ...(["normal", "heroic", "mythic"] as Difficulty[]).map((value) => ({
        id: `difficulty-${value}`,
        label: `Switch to ${value}`,
        hint: "Changes every difficulty-aware view",
        kind: "Difficulty",
        run: () => { setDifficulty(value); localStorage.setItem("onlyflasks-difficulty", value); },
      })),
    ],
    tierStatus = data.characters
      .map((c) => {
        const snapshot = simcSnapshots[c.id],
          snapshotBags: Item[] = snapshot?.bags || [],
          snapshotVault: Item[] = snapshot?.vault || [],
          catalystBalance = currentCatalystBalance(snapshot),
          catalystCharges = catalystBalance?.quantity ?? null,
          // The class's real tier ids, not whatever the wishlist happens to name.
          tierIds = tierIdsForClass(
            data.auditActivity?.periodInfo?.current_season?.tier_items_by_slot,
            classIds[c.class],
          ),
          tierIdSet = new Set(Object.values(tierIds).map(Number)),
          set = tierSetStatus<Item>({
            equipment: c.equipment,
            bags: snapshotBags,
            tierIds,
            charges: catalystCharges,
          }),
          { slots, trackMix, setBonus, reachable, reachableBonus, hiddenUpgrade, freePieces, catalysable } = set,
          equippedCount = set.pieces,
          storedCount = set.stored,
          readyCount = set.ready,
          waitingCount = set.waiting,
          missingCount = set.missing;
        return {
          // Spread the status verbatim so the row and the module agree on one
          // shape. Hand-listing fields silently dropped `pieces`, and every
          // backfarm number read zero because `undefined < 4` is false.
          ...set,
          c, equippedCount, storedCount, readyCount, waitingCount, missingCount,
          charges: catalystCharges || 0,
          catalystCharges,
          catalystId: catalystBalance?.id || null,
          catalystDelta: catalystBalance && snapshot?.previousCatalystCurrencies && Number.isFinite(Number(snapshot.previousCatalystCurrencies[String(catalystBalance.id)]))
            ? catalystBalance.quantity - Number(snapshot.previousCatalystCurrencies[String(catalystBalance.id)])
            : null,
          vaultTier: snapshotVault.filter((item) => tierIdSet.has(+item.itemId)),
          vaultCatalyst: snapshotVault.filter((item) => !tierIdSet.has(+item.itemId) && TIER_SLOT_SET.has(slot(item.slot))),
          vaultOther: snapshotVault.filter((item) => !tierIdSet.has(+item.itemId) && !TIER_SLOT_SET.has(slot(item.slot))),
          // null when the export carried no currency data at all — that is an
          // incomplete capture, not a character holding zero crests.
          crests: snapshot && hasCurrencyData(snapshot) ? {
            champion: Number(snapshot.upgradeCurrencies?.[MIDNIGHT_S2_CRESTS.champion] || 0),
            hero: Number(snapshot.upgradeCurrencies?.[MIDNIGHT_S2_CRESTS.hero] || 0),
            myth: Number(snapshot.upgradeCurrencies?.[MIDNIGHT_S2_CRESTS.myth] || 0),
          } : null,
          crestsMissing: Boolean(snapshot && !hasCurrencyData(snapshot)),
          snapshotAt: snapshot?.capturedAt || null,
        };
      })
      // Everyone short of 4PC first, closest to finishing at the top — 3 pieces
      // is the cheapest to close out. Finished players sink to the bottom.
      .sort(
        (a, b) =>
          Number(a.pieces >= 4) - Number(b.pieces >= 4) ||
          b.pieces - a.pieces ||
          a.c.name.localeCompare(b.c.name),
      ),
    rosterTier = tierRosterSummary(tierStatus),
    // The only question this page answers: who is not at 4PC yet.
    tierCounts = {
      four: tierStatus.filter((row) => row.pieces >= 4).length,
      three: tierStatus.filter((row) => row.pieces === 3).length,
      two: tierStatus.filter((row) => row.pieces === 2).length,
      under: tierStatus.filter((row) => row.pieces < 2).length,
      self: tierStatus.filter((row) => row.pieces < 4 && row.reachable >= 4).length,
    },
    navCounts: NavCounts = {
      tonight: tonight.length,
      actions: actionCount,
      history: data.lootHistory?.history_items?.length || 0,
      tierNeedsBoss: tierCounts.two + tierCounts.under,
    },
    tierById = new Map(tierStatus.map((row) => [row.c.id, row])),
    tierSummary = {
      fourPiece: tierStatus.filter((row) => row.equippedCount >= 4).length,
      twoPiece: tierStatus.filter(
        (row) => row.equippedCount >= 2 && row.equippedCount < 4,
      ).length,
      building: tierStatus.filter((row) => row.equippedCount < 2).length,
      complete: tierStatus.filter(
        (row) => row.slots.length > 0 && row.equippedCount === row.slots.length,
      ).length,
    },
    overviewSlots = [
      "HEAD",
      "NECK",
      "SHOULDER",
      "BACK",
      "CHEST",
      "WRIST",
      "HANDS",
      "WAIST",
      "LEGS",
      "FEET",
      "FINGER",
      "TRINKET",
      "MAIN_HAND",
      "OFF_HAND",
    ],
    raidSources = data.raid.bosses.flatMap((raidBoss, bossOrder) =>
      raidBoss.items.map((item) => ({ item, raidBoss, bossOrder })),
    ),
    weeklyOverview = data.characters
      .map((c) => {
        const list = wishlistFor(c),
          // One-to-one, so two ring rows never point at the same ring.
          replacements = assignReplacements(c, list);
        const targets = list.flatMap((target, targetIndex) => {
          let source = raidSources.find(
            (x) =>
              +x.item.itemId === +target.itemId ||
              +x.item.itemId === Number(target.sourceItemId),
          );
          if (!source && isExplicitTierTarget(data, c, target))
            source = raidSources.find(
              (x) =>
                x.item.tierToken &&
                tokenFitsClass(x.item, c) &&
                slot(x.item.slot) === slot(target.slot),
            );
          const inRaid = Boolean(source);
          if (!source)
            source = {
              item: target,
              raidBoss: {
                name:
                  target.drop ||
                  target.source ||
                  target.sourceType ||
                  "Outside raid",
                items: [],
              },
              bossOrder: -1,
            };
          const exact = c.equipment.find(
              (item) => +item.itemId === +target.itemId,
            ),
            base = c.equipment.find(
              (item) => +item.itemId === Number(target.sourceItemId),
            ),
            current = exact || (target.catalyst ? base : undefined),
            desiredBase = data.seasonLoot?.items.find(
              (item) => +item.itemId === Number(target.sourceItemId),
            ),
            catalystStatMatch =
              exact && target.catalyst
                ? catalystStatsMatch(exact, desiredBase)
                : null,
            seasonTrackOrder = currentSeasonTrackOrder(current);
          const state = !current
            ? "missing"
            : seasonTrackOrder === 3
              ? "myth"
              : seasonTrackOrder === 2
                ? "hero"
                : seasonTrackOrder === 1
                  ? "champion"
                  : target.crafted && exact
                    ? currentSeasonCraftOrder(current) > 0 ? "crafted" : "crafted-old"
                    : "missing";
          // Was: equippedInSlot[occurrence] — pairing ring target #2 with the
          // 2nd-best equipped ring. That named a ring the player is keeping
          // because it satisfies target #1. Ask the shared rule instead.
          const slotCurrent = replacements.get(targetIndex);
          return [
            {
              target,
              source,
              inRaid,
              current: current || slotCurrent,
              state,
              catalystReady: Boolean(!exact && base && target.catalyst),
              catalystStatMatch,
              suboptimal: Boolean(
                exact && target.catalyst && catalystStatMatch === false,
              ),
              exact: Boolean(exact),
            },
          ];
        });
        const exactCount = targets.filter(
            (x) => x.exact && !x.suboptimal,
          ).length,
          mythCount = targets.filter((x) => x.state === "myth").length,
          heroCount = targets.filter((x) => x.state === "hero").length,
          championCount = targets.filter((x) => x.state === "champion").length,
          readiness = (["normal", "heroic", "mythic"] as Difficulty[]).reduce((result, selectedDifficulty) => {
            result[selectedDifficulty] = targets.filter((entry) => targetSatisfiedAtDifficulty(data, c, entry, selectedDifficulty, specs[c.id] || c.defaultSpec)).length;
            return result;
          }, {} as Record<Difficulty, number>);
        return { c, targets, exactCount, readiness, mythCount, heroCount, championCount };
      })
      .sort(
        (a, b) =>
          priorityValue(a.c, rosterStatuses) -
            priorityValue(b.c, rosterStatuses) ||
          a.c.name.localeCompare(b.c.name),
      ),
    overviewInsights = (["normal", "heroic", "mythic"] as Difficulty[]).map((selectedDifficulty) => {
      const evaluated = weeklyOverview.flatMap((row) => row.targets.map((entry) => ({
          reason: targetSatisfactionReason(data, row.c, entry, selectedDifficulty, specs[row.c.id] || row.c.defaultSpec),
        }))),
        total = evaluated.length,
        bis = evaluated.filter((x) => x.reason === "bis").length,
        higher = evaluated.filter((x) => x.reason === "higher").length,
        sim = evaluated.filter((x) => x.reason === "sim").length,
        satisfied = bis + higher + sim,
        complete = weeklyOverview.filter((row) => row.targets.length > 0 && row.readiness[selectedDifficulty] === row.targets.length).length;
      return { difficulty: selectedDifficulty, total, satisfied, complete, bis, higher, sim };
    }),
    bossAnalyticsFor = (selectedDifficulty: Difficulty) => data.raid.bosses
      .map((raidBoss, bossOrder) => {
        const targetTrackOrder =
            selectedDifficulty === "mythic" ? 3 : selectedDifficulty === "heroic" ? 2 : 1,
          expected = bossLevel(raidBoss, selectedDifficulty, bossOrder);
        const wishlistClaims: any[] = weeklyOverview.flatMap((row) =>
            row.targets
              .filter(
                (x) =>
                  x.inRaid &&
                  x.source.raidBoss.name === raidBoss.name &&
                  !x.catalystReady,
              )
              .flatMap((x) => {
                const currentTrackOrder = currentSeasonTrackOrder(x.current),
                  sim = simFor(
                    data,
                    row.c,
                    x.source.item,
                    raidBoss,
                    selectedDifficulty,
                    specs[row.c.id] || row.c.defaultSpec,
                  ),
                  ilvlGain = expected - (x.current?.itemLevel || 0),
                  equalOrHigher = currentTrackOrder >= targetTrackOrder;
                if (x.exact && equalOrHigher && !x.suboptimal) return [];
                if (!x.exact && equalOrHigher && !(sim !== null && sim > 0))
                  return [];
                return [
                  {
                    ...x,
                    c: row.c,
                    sim,
                    ilvlGain,
                    trackUpgrade: currentTrackOrder < targetTrackOrder,
                  },
                ];
              }),
          ),
          simulatedNonBis: any[] = weeklyOverview.flatMap((row) => raidBoss.items.flatMap((item) => {
            const selectedSpec = specs[row.c.id] || row.c.defaultSpec;
            // A catalyst claim's target is the tier piece, but the item this boss
            // drops is the base — so matching on the target alone let the base
            // through again as a bare "SIM UPGRADE", listing one drop twice for
            // the same raider. Match the source too: that is what falls on the
            // floor, and it is the row a council actually sees.
            if (!itemEligibleForSpec(item, row.c, selectedSpec) || wishlistClaims.some((claim) => claim.c.id === row.c.id && (+claim.target.itemId === +item.itemId || +claim.source.item.itemId === +item.itemId))) return [];
            const sim = simFor(data, row.c, item, raidBoss, selectedDifficulty, selectedSpec);
            if (sim === null || sim <= 0) return [];
            const current = equipped(row.c, item);
            return [{ target: item, source: { item, raidBoss, bossOrder }, inRaid: true, current, state: "sim-upgrade", catalystReady: false, catalystStatMatch: null, suboptimal: false, exact: false, c: row.c, sim, ilvlGain: expected - (current?.itemLevel || 0), trackUpgrade: currentSeasonTrackOrder(current) < targetTrackOrder, simUpgradeOnly: true }];
          })),
          claims: any[] = [...wishlistClaims, ...simulatedNonBis],
          raiders = [...new Map(claims.map((x) => [x.c.id, x.c])).values()],
          missing = wishlistClaims.filter((x) => !x.exact || x.suboptimal),
          trackUpgrades = wishlistClaims.filter((x) => x.trackUpgrade),
          simulated = claims.filter((x) => x.sim !== null && x.sim > 0),
          bestSimByPlayer = [...new Map(simulated.sort((a, b) => (b.sim || 0) - (a.sim || 0)).map((x) => [x.c.id, x.sim || 0])).values()],
          totalSim = bestSimByPlayer.reduce((sum, value) => sum + value, 0),
          maxSim = simulated.reduce((max, x) => Math.max(max, x.sim || 0), 0),
          impact = claims.filter((x) =>
            ["TRINKET", "MAIN_HAND", "OFF_HAND"].includes(slot(x.target.slot)),
          ),
          tier = claims.filter((x) => x.source.item.tierToken),
          tierPlayers = new Set(tier.map((x) => x.c.id)).size,
          score = (simulated.length ? 1000 : 0) + totalSim * 100 + tierPlayers * 12 + new Set(impact.map((x) => x.c.id)).size * 8 + raiders.length * 3 + missing.length;
        return {
          raidBoss,
          bossOrder,
          claims,
          raiders,
          missing,
          trackUpgrades,
          simulated,
          totalSim,
          maxSim,
          impact,
          tier,
          tierPlayers,
          score,
        };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.raiders.length - a.raiders.length ||
          a.bossOrder - b.bossOrder,
      ),
    bossAnalyticsByDifficulty = {
      normal: bossAnalyticsFor("normal"),
      heroic: bossAnalyticsFor("heroic"),
      mythic: bossAnalyticsFor("mythic"),
    },
    bossPlanning = data.raid.bosses.map((raidBoss, bossOrder) => {
      const values = (["normal", "heroic", "mythic"] as Difficulty[]).reduce((result, selectedDifficulty) => {
        result[selectedDifficulty] = bossAnalyticsByDifficulty[selectedDifficulty].find((row) => row.raidBoss.name === raidBoss.name)!;
        return result;
      }, {} as Record<Difficulty, ReturnType<typeof bossAnalyticsFor>[number]>);
      return { raidBoss, bossOrder, values, score: values.normal.score + values.heroic.score + values.mythic.score };
    }).sort((a, b) => b.score - a.score || a.bossOrder - b.bossOrder);
  return (
    <>
      {paletteOpen && (
        <CommandPalette commands={paletteCommands} onClose={() => setPaletteOpen(false)} />
      )}
      <header>
        <div className="shell mast">
          <div>
            <p className="rune">OnlyFlasks · Raid readiness</p>
            <h1>The Venomous Abyss</h1>
            <p className="muted">Gear auditing, tier tracking and sim-backed loot calls</p>
          </div>
          <button type="button" className="palette-trigger" onClick={() => setPaletteOpen(true)}>
            <Search />
            <span>Jump to…</span>
            <kbd>{navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl"}K</kbd>
          </button>
        </div>
        <div className="shell nav-row">
          <nav className="app-tabs" aria-label="Board sections">
            {NAV_TABS.map((tab, index) => (
              <Fragment key={tab.id}>
                {index > 0 && NAV_TABS[index - 1].group !== tab.group && (
                  <span className="tab-divider" aria-hidden="true" />
                )}
                <button
                  type="button"
                  className={view === tab.id ? "active" : ""}
                  aria-current={view === tab.id ? "page" : undefined}
                  title={`${tab.label} — press ${index + 1}`}
                  onClick={() => setView(tab.id)}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {(() => {
                    const count = tab.count?.(navCounts);
                    if (count === undefined) return null;
                    return (
                      <b className={tab.alert && count > 0 ? "alert" : "neutral"}>
                        {count}
                      </b>
                    );
                  })()}
                </button>
              </Fragment>
            ))}
          </nav>
        </div>
      </header>
      <main className="shell">
        {view === "overview" && (
          <section className="weekly-page">
            <div className="weekly-head">
              <div>
                <p className="rune">Tuesday planning board</p>
                <h2>Overall BiS coverage</h2>
                <p>
                  Every overall wishlist target—including raid, Mythic+,
                  crafted, and catalyst gear—on one board.
                </p>
              </div>
            </div>
            <div className="coverage-insights difficulty-summary">{overviewInsights.map((summary) => {
              const percent = summary.total ? Math.round(summary.satisfied / summary.total * 100) : 0,
                verdict = coverageVerdict(percent),
                outstanding = summary.total - summary.satisfied;
              return <div className={`coverage-score ${summary.difficulty} ${verdict.id}`} key={summary.difficulty}>
                <span className="coverage-ring" style={{ "--coverage": `${percent}%` } as React.CSSProperties}><b>{percent}%</b></span>
                <span>
                  <strong>{raidbotDifficulty[summary.difficulty].label} covered</strong>
                  <i className={`coverage-verdict ${verdict.id}`}>{verdict.label}</i>
                  <small>{summary.satisfied} of {summary.total} targets already at {tracks[summary.difficulty]} or better</small>
                  <em>{outstanding} still want a {raidbotDifficulty[summary.difficulty].label} drop</em>
                </span>
              </div>;
            })}</div>
            <div className="overview-legend">
              <span className="myth">
                <b>M</b> Myth track
              </span>
              <span className="hero">
                <b>H</b> Hero track
              </span>
              <span className="champion">
                <b>C</b> Champion track
              </span>
              <span className="crafted">
                <b>⚒</b> Crafted BiS
              </span>
              <span className="missing">
                <b>!</b> Missing BiS
              </span>
              <small>
                <b className="exact-mark">✓</b> Myth-level BiS complete{" "}
                <b className="suboptimal-mark">≈</b> Suboptimal catalyst stats{" "}
                <b className="catalyst-mark">↻</b> Ready to catalyze · large icon
                = target · small icon = current
              </small>
            </div>
            <div className="overview-scroll">
              <div className="overview-grid">
                <div className="overview-corner">
                  <b>Raider</b>
                  <small>BiS · track coverage</small>
                </div>
                {overviewSlots.map((slotName) => (
                  <div className="overview-slot" key={slotName}>
                    {slotName
                      .replace("MAIN_HAND", "WEAPON")
                      .replace("OFF_HAND", "OFFHAND")
                      .replace("SHOULDER", "SHOULDERS")}
                  </div>
                ))}
                {weeklyOverview.map((row) => (
                  <Fragment key={row.c.id}>
                    <div
                      className="overview-player"
                      style={
                        {
                          "--class": colors[row.c.class],
                        } as React.CSSProperties
                      }
                    >
                      <span>
                        <RaiderIdentity
                          c={row.c}
                          spec={specs[row.c.id] || row.c.defaultSpec}
                          status={rosterStatuses[row.c.id] || row.c.rosterStatus || "Main"}
                          compact
                        />
                        <div className="overview-coverage">
                          {(["normal", "heroic", "mythic"] as Difficulty[]).map((selectedDifficulty) => <strong className={selectedDifficulty} key={selectedDifficulty}><b>{row.readiness[selectedDifficulty]}</b>/{row.targets.length}<small> {selectedDifficulty[0].toUpperCase()}</small></strong>)}
                        </div>
                      </span>
                    </div>
                    {overviewSlots.map((slotName) => {
                      const cells = row.targets.filter(
                        (x) => slot(x.target.slot) === slotName,
                      );
                      return (
                        <div
                          className={`overview-cell ${cells.length ? "" : "na"}`}
                          key={`${row.c.id}-${slotName}`}
                        >
                          {cells.length ? (
                            cells.map(
                              (
                                {
                                  target,
                                  source,
                                  current,
                                  state,
                                  catalystReady,
                                  suboptimal,
                                  exact,
                                },
                                index,
                              ) => {
                                const seasonTrack = currentSeasonTrackName(current),
                                  craftOrder = target.crafted && exact ? currentSeasonCraftOrder(current) : 0,
                                  craftedIlvl = target.crafted && exact ? Number(current?.itemLevel || 0) : 0,
                                  craftedReady = craftOrder === 3 ? "Mythic craft" : craftOrder === 2 ? "Heroic craft" : craftOrder === 1 ? "Normal craft" : "previous-season craft",
                                  track = craftedIlvl
                                    ? `Crafted · ${craftedIlvl} ilvl · ${craftedReady}`
                                    : seasonTrack
                                    ? `${seasonTrack} ${current?.trackRank || ""}`.trim()
                                    : current
                                      ? `${current.track || "Untracked"} · previous season / no current-season upgrade marker`
                                      : "No item detected in this slot",
                                  actualStats = (current?.secondaryStats || [])
                                    .map(
                                      (stat) =>
                                        `+${stat.value} ${stat.type.replace(/_RATING$/u, "").replace("CRIT", "Critical Strike").replaceAll("_", " ").toLowerCase()}`,
                                    )
                                    .join(" · "),
                                  detail =
                                    state === "crafted" || state === "crafted-old"
                                      ? `Crafted BiS owned · ${craftedReady}`
                                      : state === "missing"
                                      ? `Missing · currently ${current?.name || "empty"} · ${track}`
                                      : catalystReady
                                        ? `Catalyst base equipped · ${track}`
                                        : suboptimal
                                          ? `Tier equipped with suboptimal retained stats · ${track}`
                                        : `Exact BiS equipped · ${track}`;
                                return (
                                  <div
                                    className="overview-pair"
                                    key={`${target.itemId}-${index}`}
                                  >
                                    <a
                                      className={`overview-target ${state} ${suboptimal ? "suboptimal" : exact && target.catalyst ? "optimal" : catalystReady ? "catalyst-ready" : ""}`}
                                      href={`https://www.wowhead.com/item=${target.itemId}`}
                                      data-wowhead={`item=${target.itemId}`}
                                      target="_blank" rel="noreferrer"
                                      title={`BIS TARGET\n${target.name}\n${target.crafted ? "Crafted stats are selected with missives\n" : ""}${detail}\nSource: ${source.raidBoss.name}`}
                                    >
                                      <img
                                        src={target.icon || source.item.icon}
                                      />
                                      <em>
                                        {state === "missing"
                                          ? "!"
                                          : state === "crafted-old"
                                            ? "OLD"
                                          : state === "crafted"
                                            ? current?.itemLevel || "⚒"
                                          : state === "myth"
                                            ? "M"
                                            : state === "hero"
                                              ? "H"
                                              : "C"}
                                      </em>
                                      {((exact && !suboptimal && (state === "myth" || (state === "crafted" && craftOrder === 3))) || catalystReady) && (
                                        <i>
                                          {catalystReady
                                            ? "↻"
                                            : suboptimal
                                              ? "≈"
                                              : "✓"}
                                        </i>
                                      )}
                                    </a>
                                    {!exact && current && (
                                      <a
                                        className="current-mini"
                                        href={`https://www.wowhead.com/item=${current.itemId}${current.bonusList?.length ? `?bonus=${current.bonusList.join(":")}` : ""}`}
                                        data-wowhead={`item=${current.itemId}${current.bonusList?.length ? `&bonus=${current.bonusList.join(":")}` : ""}`}
                                        target="_blank" rel="noreferrer"
                                        title={`CURRENTLY EQUIPPED\n${current.name}\n${current.itemLevel || "?"} ilvl · ${track}${actualStats ? `\n${actualStats}` : ""}`}
                                      >
                                        <img src={current.icon} />
                                      </a>
                                    )}
                                  </div>
                                );
                              },
                            )
                          ) : (
                            <span>—</span>
                          )}
                        </div>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
            </div>
          </section>
        )}
        {view === "bosses" && (
          <section className="boss-target-page">
            <div className="boss-target-head">
              <div><p className="rune">Weekly route planning</p><h2>Boss targets</h2><p>Ranked for the selected difficulty using current-season gear, wishlist gaps, and verified sims.</p></div>
              <div className="difficulty-picker">{(["normal", "heroic", "mythic"] as Difficulty[]).map((value) => <button className={difficulty === value ? "selected" : ""} key={value} onClick={() => { setDifficulty(value); localStorage.setItem("onlyflasks-difficulty", value); }}>{value}</button>)}</div>
            </div>
            <div className="boss-target-table">
              <div className="boss-target-columns"><span>#</span><span>Boss</span><span>Players</span><span>BiS gaps</span><span>Sim upgrades</span><span>Weapons / trinkets</span><span>Tier</span><span>Best sim</span></div>
              {bossAnalyticsByDifficulty[difficulty].map((row, index) => <details className="boss-target-entry" key={row.raidBoss.name}>
                <summary className={row.claims.length ? "has-value" : "no-value"}>
                  <b className="boss-target-rank">{index + 1}</b><span className="boss-target-name"><strong>{row.raidBoss.name}</strong><small>{row.raidBoss.raid && row.raidBoss.raid !== data.raid.raid ? `${row.raidBoss.raid} · ` : ""}{row.claims.length ? "Open for loot targets" : `No ${difficulty} value`}</small></span>
                  <b>{row.raiders.length}</b><b>{row.missing.length}</b><b className={row.simulated.length ? "sim" : "muted"}>{row.simulated.length || "—"}</b><b className={row.impact.length ? "impact" : ""}>{row.impact.length}</b><b className={row.tierPlayers ? "tier" : ""}>{row.tierPlayers}</b><b className={row.maxSim > 0 ? "sim" : "muted"}>{row.maxSim > 0 ? `+${row.maxSim.toFixed(2)}%` : "—"}</b><ChevronDown />
                </summary>
                {row.claims.length > 0 && <div className="boss-target-expanded">
                  <div className="boss-target-reason"><strong>Why this boss matters</strong><span>{row.raiders.length} players · {row.missing.length} unsatisfied BiS targets{row.simulated.length ? ` · ${row.simulated.length} verified item upgrades` : ""}{row.impact.length ? ` · ${row.impact.length} high-impact drops` : ""}{row.tierPlayers ? ` · tier for ${row.tierPlayers}` : ""}</span></div>
                  <div className="boss-target-claims">{[...row.claims.reduce((groups: Map<number, { c: Raider; claims: any[] }>, claim: any) => { const group = groups.get(claim.c.id) || { c: claim.c, claims: [] as any[] }; group.claims.push(claim); groups.set(claim.c.id, group); return groups; }, new Map<number, { c: Raider; claims: any[] }>()).values()].sort((a, b) => Math.max(...b.claims.map((x) => x.sim || -1)) - Math.max(...a.claims.map((x) => x.sim || -1)) || priorityValue(a.c, rosterStatuses) - priorityValue(b.c, rosterStatuses)).map((group) => {
                    const bestSim = Math.max(...group.claims.map((x) => x.sim || -1)), bestIlvl = Math.max(...group.claims.map((x) => Math.max(0, x.ilvlGain)));
                    return <article className="boss-target-player" key={group.c.id} style={{ "--class": colors[group.c.class] } as React.CSSProperties}>
                      <div className="boss-player-summary"><RaiderIdentity c={group.c} spec={specs[group.c.id] || group.c.defaultSpec} status={rosterStatuses[group.c.id] || group.c.rosterStatus || "Main"} compact /><span>{group.claims.length} {group.claims.length === 1 ? "item" : "items"}</span><div className="gain-badges"><b className={bestIlvl > 0 ? "ilvl" : "muted"}>{bestIlvl > 0 ? `up to +${bestIlvl} ilvl` : "0 ilvl"}</b><b className={bestSim > 0 ? "sim" : "muted"}>{bestSim > 0 ? `up to +${bestSim.toFixed(2)}%` : "— sim"}</b></div></div>
                      <div className="boss-player-items">{group.claims.sort((a, b) => (b.sim || -1) - (a.sim || -1) || b.ilvlGain - a.ilvlGain).map((claim, claimIndex) => { const ilvlGain = Math.max(0, claim.ilvlGain);
                        // Boss targets are about the item that drops. For a catalyst
                        // target that is the base, not the tier piece it becomes — and
                        // the sim score is the base's too, because a lone tier piece
                        // with no set bonus scores as a weak standalone item.
                        //
                        // Loot decisions already draws "what drops → what it becomes"
                        // as a conversion-route, and covers tier tokens as well as the
                        // catalyst. Reuse it rather than invent a second dialect.
                        const route = claim.source?.item && +claim.source.item.itemId !== +claim.target.itemId
                            ? claim.target.catalyst ? "catalyst" : claim.source.item.tierToken ? "token" : null
                            : null,
                          dropped = route ? claim.source.item : claim.target;
                        return <div className={`boss-player-item ${route ? "has-route" : ""}`} key={`${claim.target.itemId}-${claimIndex}`}><WowItem item={dropped} size={30} /><span><b>{dropped.name}</b><small>{claim.simUpgradeOnly ? "SIM UPGRADE" : "BiS TARGET"}</small></span>{route && <div className={`conversion-route compact ${route}`}><span className="conversion-arrow" aria-hidden="true">→</span><WowItem item={claim.target} size={24} /><a href={`https://www.wowhead.com/item=${claim.target.itemId}`} data-wowhead={`item=${claim.target.itemId}`} target="_blank" rel="noreferrer"><small>{route === "catalyst" ? "CATALYST RESULT" : "TIER RESULT"}</small><b>{claim.target.name}</b></a></div>}<div className="gain-badges"><b className={ilvlGain > 0 ? "ilvl" : "muted"}>{ilvlGain > 0 ? `+${ilvlGain} ilvl` : "0 ilvl"}</b><b className={claim.sim !== null && claim.sim > 0 ? "sim" : "muted"}>{claim.sim !== null ? `${claim.sim > 0 ? "+" : ""}${claim.sim.toFixed(2)}%` : "— sim"}</b></div></div>; })}</div>
                    </article>;
                  })}</div>
                </div>}
              </details>)}
            </div>
          </section>
        )}
        {view === "tier" && (
          <section className="tier-page">
            <div className="plan-head">
              <div>
                <p className="rune">Set completion</p>
                <h2>Tier sets</h2>
                <p>Who has 4PC, who can get there alone, and who needs a kill.</p>
              </div>
            </div>
          <section className="tier-board">
            <div className="plan-section-title">
              <div>
                <p className="rune">Set completion</p>
                <h3>Tier set status</h3>
              </div>
              <span>
                Equipped tier, stored bases, Vault options, and captured catalyst resources
              </span>
            </div>
            <div className="tier-verdicts">
              <div className="tier-verdict done">
                <strong>{tierCounts.four}</strong>
                <span>AT 4PC</span>
                <em>Done — stop prioritising tier for them</em>
              </div>
              <div className="tier-verdict three">
                <strong>{tierCounts.three}</strong>
                <span>AT 3PC</span>
                <em>One piece from 4 — cheapest to close out</em>
              </div>
              <div className="tier-verdict two">
                <strong>{tierCounts.two}</strong>
                <span>AT 2PC</span>
                <em>Two pieces short of the 4-set</em>
              </div>
              <div className="tier-verdict under">
                <strong>{tierCounts.under}</strong>
                <span>UNDER 2PC</span>
                <em>0 or 1 piece — furthest out</em>
              </div>
              <div className="tier-verdict self">
                <strong>{tierCounts.self}</strong>
                <span>CAN SELF-SOLVE</span>
                <em>Reach 4PC from bags or charges, no loot needed</em>
              </div>
            </div>
            <div className="tier-legend">
              <span className="k-tier"><i />Tier equipped</span>
              <span className="k-ready"><i />Worn base, charge in hand</span>
              <span className="k-waiting"><i />Worn base, no charge</span>
              <span className="k-missing"><i />Nothing usable equipped</span>
              <span className="legend-split">
                Letter = track of the item they have on:
                <b className="tC">C</b> Champion / Normal
                <b className="tH">H</b> Hero / Heroic
                <b className="tM">M</b> Myth / Mythic
                <b className="tX">—</b> nothing usable
              </span>
            </div>
            <div className="tier-grid">
              {tierStatus.map(
                ({ c, slots, equippedCount, storedCount, readyCount, waitingCount, trackMix, setBonus, reachable, reachableBonus, hiddenUpgrade, freePieces, catalysable, catalystCharges, catalystId, catalystDelta, vaultTier, vaultCatalyst, vaultOther, bagTier, bagBases, crests, crestsMissing, snapshotAt }) => (
                <div
                  className={`tier-person ${equippedCount === 5 ? "tier-complete" : ""} ${hiddenUpgrade ? "tier-actionable" : ""}`}
                  key={c.id}
                  style={
                    { "--class": colors[c.class] } as React.CSSProperties
                  }
                >
                  <div className="tier-card-head">
                    <RaiderIdentity c={c} spec={specs[c.id] || c.defaultSpec} status={rosterStatuses[c.id] || c.rosterStatus || "Main"} />
                    <span
                      className={`tier-charges ${catalystCharges ? "has" : "none"}`}
                      title={`${catalystCharges ?? 0} Venomblight Manaflux held${catalystCharges === null ? " (no /simc captured)" : ""}`}
                    >
                      <strong>{catalystCharges ?? "?"}</strong>
                      <small>CATA</small>
                    </span>
                    <span className={`tier-bonus b${setBonus}`} title={`${equippedCount} tier pieces equipped\nSet bonuses count pieces, not tracks.`}>
                      <strong>{setBonus ? `${setBonus}PC` : "0PC"}</strong>
                      <small>{equippedCount}/5</small>
                    </span>
                  </div>
                  <div className="tier-slots">
                    {slots.map(({ slot: slotName, state, evidence, source, sourceTrack }) => (
                      <div
                        className={`tier-slot-visual ${state}`}
                        key={slotName}
                        title={`${slotName[0] + slotName.slice(1).toLowerCase()}\n${evidence?.name || "Empty"}${sourceTrack ? ` · ${sourceTrack} track` : ""}\n${TIER_SLOT_HELP[state]}`}
                      >
                        <b
                          className={`slot-track t${/^[CHM]$/.test(trackLetter(source)) ? trackLetter(source) : "X"}`}
                          title={sourceTrack ? `${sourceTrack} track` : "Nothing usable in this slot"}
                        >
                          {trackLetter(source)}
                        </b>
                        {evidence?.itemId ? (
                          <WowItem item={{ ...evidence, ...(visualItems.get(+evidence.itemId) || {}), itemId: +evidence.itemId, bonusList: evidence.bonusList, itemLevel: evidence.itemLevel } as Item} size={32} />
                        ) : (
                          <span className="tier-slot-blank" aria-hidden="true" />
                        )}
                        <span>
                          <strong>{slotName[0] + slotName.slice(1).toLowerCase()}</strong>
                          {/* Only label what the colour cannot say on its own. Red
                              already means "needs a drop"; blue and amber both mean
                              convertible, so those keep a word. */}
                          {state !== "missing" && (
                            <small>
                              {state === "tier" ? "TIER" : state === "stored" ? "IN BAGS" : "CATALYZE"}
                            </small>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                  <TierResourceSnapshot info={{ catalystCharges, catalystId, catalystDelta, vaultTier, vaultCatalyst, vaultOther, bagTier, bagBases, crests, crestsMissing, snapshotAt }} visuals={visualItems} icons={data.itemIcons || {}} />
                </div>
              ))}
            </div>
          </section>
          </section>
        )}
        {view === "contested" && (
          <section className="plan-page">
            <div className="plan-head">
              <div>
                <p className="rune">Pre-raid briefing</p>
                <h2>Contested loot</h2>
                <p>Only decisions involving multiple raiders.</p>
              </div>
              <div className="difficulty-picker">
                {(["normal", "heroic", "mythic"] as Difficulty[]).map(
                  (value) => (
                    <button
                      className={difficulty === value ? "selected" : ""}
                      key={value}
                      onClick={() => {
                        setDifficulty(value);
                        localStorage.setItem("onlyflasks-difficulty", value);
                      }}
                    >
                      {value}
                    </button>
                  ),
                )}
              </div>
            </div>
            {officerUnlocked ? (
              <details className="roster-control">
                <summary>
                  <span>
                    <b>Roster priority</b>
                    <small>
                      Main roles → Trial roles → Fill roles · combat role
                      inferred automatically{" "}
                      {rosterSaveState === "saving"
                        ? "· Saving…"
                        : rosterSaveState === "saved"
                          ? "· Saved"
                          : rosterSaveState === "error"
                            ? "· Save failed"
                            : ""}
                    </small>
                  </span>
                  <ChevronDown />
                </summary>
                <div className="roster-priority-grid">
                  {data.characters.map((c) => {
                    const value =
                      rosterStatuses[c.id] || c.rosterStatus || "Main";
                    return (
                      <label
                        key={c.id}
                        style={
                          { "--class": colors[c.class] } as React.CSSProperties
                        }
                      >
                        <RaiderIdentity c={c} spec={specs[c.id] || c.defaultSpec} status={value} compact />
                        <select
                          value={value}
                          disabled={rosterSaveState === "saving"}
                          onChange={(e) =>
                            saveRosterStatus(c, e.target.value as RosterStatus)
                          }
                        >
                          {(["Main", "Trial", "Fill"] as RosterStatus[]).map(
                            (p) => (
                              <option key={p}>{p}</option>
                            ),
                          )}
                        </select>
                      </label>
                    );
                  })}
                </div>
              </details>
            ) : (
              <div className="officer-gate">
                {officerPrompt ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      officerLogin();
                    }}
                  >
                    <input
                      type="password"
                      autoFocus
                      value={officerPassphrase}
                      onChange={(e) => setOfficerPassphrase(e.target.value)}
                      placeholder="Officer passphrase"
                      autoComplete="current-password"
                    />
                    <button disabled={officerBusy || !officerPassphrase}>
                      {officerBusy ? "Checking…" : "Unlock"}
                    </button>
                    <button
                      type="button"
                      className="cancel"
                      onClick={() => {
                        setOfficerPrompt(false);
                        setOfficerError("");
                      }}
                    >
                      Cancel
                    </button>
                    {officerError && <small>{officerError}</small>}
                  </form>
                ) : (
                  <button onClick={() => setOfficerPrompt(true)}>
                    <Shield /> Officer access
                  </button>
                )}
              </div>
            )}

            <div className="plan-section-title contested-title">
              <div>
                <p className="rune">Needs discussion</p>
                <h3>Contested weapons & trinkets</h3>
              </div>
              <span>{tonight.length} decisions</span>
            </div>
            <div className="plan-list">
              {tonight.length ? (
                tonight.map(({ boss, item, people, expected }) => (
                  <article
                    className="plan-row contested"
                    key={`${boss.name}-${item.itemId}`}
                  >
                    <WowItem
                      item={{ ...item, itemLevel: expected }}
                      size={48}
                    />
                    <div className="plan-drop">
                      <strong>{item.name}</strong>
                      <div className="plan-meta">
                        <span
                          className={`type ${
                            slot(item.slot) === "TRINKET"
                              ? "trinket"
                              : ["MAIN_HAND", "OFF_HAND"].includes(
                                    slot(item.slot),
                                  )
                                ? "weapon"
                                : "effect"
                          }`}
                          title={item.effectText}
                        >
                          {slot(item.slot) === "TRINKET"
                            ? "TRINKET"
                            : ["MAIN_HAND", "OFF_HAND"].includes(
                                  slot(item.slot),
                                )
                              ? "WEAPON"
                              : "SPECIAL EFFECT"}
                        </span>
                        <span className="drop-boss">
                          <small>DROPS FROM</small>
                          {boss.name}
                        </span>
                        <span className="drop-level">
                          {expected}
                          <small> ILVL · {tracks[difficulty]}</small>
                        </span>
                      </div>
                    </div>
                    <div className="contender-buckets">
                      {(["Main", "Trial", "Fill"] as RosterStatus[]).map((groupStatus) => {
                        const group = people
                          .filter((p) => (rosterStatuses[p.c.id] || p.c.rosterStatus || "Main") === groupStatus)
                          .sort((a, b) => {
                            // Value first: an unsimmed raider cannot outrank a
                            // measured gain, and ties fall back to roster order.
                            const as = a.sim ?? Number.NEGATIVE_INFINITY,
                              bs = b.sim ?? Number.NEGATIVE_INFINITY;
                            if (as !== bs) return bs - as;
                            return (
                              b.ilvl - a.ilvl ||
                              priorityValue(a.c, rosterStatuses) - priorityValue(b.c, rosterStatuses)
                            );
                          });
                        if (!group.length) return null;
                        return (
                          <section className={`contender-bucket ${groupStatus.toLowerCase()}`} key={groupStatus}>
                            <div className="bucket-head">
                              <strong>{groupStatus}</strong>
                              <em>{ROSTER_BUCKET_HINT[groupStatus]}</em>
                              <span>{group.length}</span>
                            </div>
                            <div className="contenders">
                              {group.map((p) => {
                                return (
                                  <div
                                    className={`contender ${groupStatus.toLowerCase()}`}
                                    key={p.c.id}
                                    style={{ "--class": colors[p.c.class] } as React.CSSProperties}
                                  >
                                    <RaiderIdentity
                                      c={p.c}
                                      spec={specs[p.c.id] || p.c.defaultSpec}
                                      status={groupStatus}
                                      compact
                                    />
                                    <div className="contender-gain">
                                      <span className={`gain-sim ${p.sim === null ? "none" : p.sim > 0 ? "up" : p.sim < 0 ? "down" : "flat"}`}>
                                        <strong>{p.sim === null ? "—" : `${p.sim > 0 ? "+" : ""}${p.sim.toFixed(2)}%`}</strong>
                                        <small>{p.sim === null ? "NO SIM" : "SIM"}</small>
                                      </span>
                                      <span className={`gain-ilvl ${p.ilvl > 0 ? "up" : p.ilvl < 0 ? "down" : "flat"}`}>
                                        <strong>{p.ilvl > 0 ? "+" : ""}{p.ilvl}</strong>
                                        <small>ILVL</small>
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </section>
                        );
                      })}
                    </div>
                    <strong className="contest-count">
                      {people.length}
                      <small> candidates</small>
                    </strong>
                  </article>
                ))
              ) : (
                <div className="empty">
                  No contested weapons or trinkets for this difficulty.
                </div>
              )}
            </div>
          </section>
        )}
        {view === "wishlist" &&
          (() => {
            const c =
              data.characters.find((x) => x.id === wishlistCharacter) ||
              data.characters[0];
            if (!c)
              return (
                <div className="empty">No roster characters available.</div>
              );
            const selectedSpec = specs[c.id] || c.defaultSpec;
            const classSpecs = data.specs.filter((s) => s.endsWith(c.class));
            const baseline = data.bis.lists[selectedSpec]?.items || [];
            const current = customWishlists[c.id] || baseline;
            const customized = wishlistIsCustomized(current, baseline);
            const save = (items: Item[]) => {
              const next = { ...customWishlists, [c.id]: items };
              setCustomWishlists(next);
              setSyncState("idle");
              localStorage.setItem(
                "onlyflasks-custom-wishlists-v3",
                JSON.stringify(next),
              );
            };
            const submit = async () => {
              if (!wishlistApiUrl) return;
              setSyncState("saving");
              try {
                const response = await fetch(wishlistApiUrl, {
                  method: "POST",
                  headers: { "Content-Type": "text/plain;charset=utf-8" },
                  body: JSON.stringify({
                    characterId: c.id,
                    characterName: c.name,
                    characterClass: c.class,
                    lootSpec: selectedSpec,
                    wishlist: current,
                    version: 1,
                  }),
                });
                const payload = await response.json();
                if (!payload.ok)
                  throw new Error(payload.error || "Submission failed");
                const sharedResponse = await fetch(wishlistApiUrl, { cache: "no-store" });
                const shared = await sharedResponse.json();
                if (!shared.ok) throw new Error(shared.error || "Saved, but could not verify the shared wishlist");
                const verifiedLists: Record<number, Item[]> = {}, verifiedSpecs: Record<number, string> = {};
                for (const entry of shared.wishlists || []) {
                  verifiedLists[+entry.characterId] = entry.wishlist || [];
                  verifiedSpecs[+entry.characterId] = entry.lootSpec;
                }
                setSimcSnapshots(shared.simcSnapshots || {});
                setQeReports(shared.qeReports || {});
                setQeQueue(shared.qeQueue || {});
                setCustomWishlists(verifiedLists);
                setSpecs((existing) => ({ ...existing, ...verifiedSpecs }));
                localStorage.setItem("onlyflasks-custom-wishlists-v3", JSON.stringify(verifiedLists));
                localStorage.setItem("onlyflasks-board-specs-v1", JSON.stringify({ ...specs, ...verifiedSpecs }));
                setSyncState("saved");
                setTimeout(() => setSyncState("idle"), 2500);
              } catch (error) {
                console.error(error);
                setSyncState("error");
              }
            };
            const qeJob = qeQueue[String(c.id)]?.state && qeQueue[String(c.id)].state !== "done" ? qeQueue[String(c.id)] : null,
              qeStored = qeReports[String(c.id)],
              qeFresh = Boolean(qeStored?.capturedAt) && !isBeforeReset(qeStored.capturedAt),
              qeHave = qeFresh ? Object.keys(qeStored.difficulties || {}) : [];
            // What this character still owes this week. Both expire at reset.
            const newestSim = simTimestamps(data.sims, c.id)[0],
              simCurrent = Boolean(newestSim) && !isBeforeReset(newestSim),
              captureAt = simcSnapshots[c.id]?.capturedAt,
              captureCurrent = Boolean(captureAt) && !isBeforeReset(captureAt),
              simcOutstanding = [
                simCurrent ? "" : "droptimizer sim",
                captureCurrent ? "" : "/simc capture",
              ].filter(Boolean);
            // Plain const, not a hook: this block runs inside a JSX IIFE.
            const pasted = simcText.trim(),
              simcCheck = pasted.length >= 100 ? inspectSimcExport(pasted) : null,
              wrongCharacter = Boolean(simcCheck?.character && norm(simcCheck.character) !== norm(c.name));
            const submitSim = async () => {
              if (!wishlistApiUrl || !simcText.trim()) return;
              // A <select> whose value matches no option still DISPLAYS the first
              // one, so a character with no default spec looks configured while
              // selectedSpec is "". That reached Apps Script as an empty lootSpec
              // and came back as a validation error the code below then blamed on
              // an outdated deployment. Catch it here, where the cause is known.
              if (!selectedSpec) {
                setSimState("error");
                setSimMessage("Pick a loot specialization first — none is selected for this character yet, even though the dropdown shows one.");
                logSimcAttempt(wishlistApiUrl, c, "", "spec-check", false, "no loot spec selected", simcText.trim());
                return;
              }
              const parsedSnapshot = parseSimcSnapshot(simcText.trim()),
                tierSlots = new Set(["HEAD", "SHOULDER", "CHEST", "HANDS", "LEGS"]),
                tierIds = new Set(baseline.flatMap((item) => [Number(item.itemId), Number(item.sourceItemId || 0)]).filter(Boolean)),
                tierEvidence = (item: Item) => tierSlots.has(slot(item.slot)) && (currentSeasonTrackOrder(item) > 0 || tierIds.has(+item.itemId)),
                snapshot = {
                  ...parsedSnapshot,
                  bags: parsedSnapshot.bags.filter(tierEvidence),
                  vault: parsedSnapshot.vault.filter(tierEvidence),
                };
              if (norm(parsedSnapshot.character) !== norm(c.name)) {
                setSimState("error");
                setSimMessage(`This /simc export belongs to ${parsedSnapshot.character || "another character"}, not ${c.name}.`);
                logSimcAttempt(wishlistApiUrl, c, selectedSpec, "character-check", false, `export is for ${parsedSnapshot.character || "unknown"}`, simcText.trim());
                return;
              }
              const before = simFreshness(data.sims, c.id, simSpecName(c, selectedSpec));
              setSimState("submitting");
              setSimMessage("Submitting all three raid difficulties…");
              setSimReports([]);
              try {
                const snapshotResponse = await fetch(wishlistApiUrl, {
                  method: "POST",
                  headers: { "Content-Type": "text/plain;charset=utf-8" },
                  body: JSON.stringify({ action: "saveSimcSnapshot", characterId: c.id, characterName: c.name, lootSpec: selectedSpec, snapshot, simc: simcText.trim() }),
                });
                const snapshotResult = await snapshotResponse.json();
                if (!snapshotResult.ok || !snapshotResult.snapshot) {
                  // Only saveWishlist_ says these, and doPost falls through to it
                  // for an action the deployment does not have. saveSimcSnapshot_'s
                  // own complaint is "Character identity, lootSpec, and snapshot
                  // are required." — one word apart, and it used to match here, so
                  // any thin payload to a perfectly current deployment was reported
                  // as an outdated one. Match the fallthrough, not the prefix.
                  const deploymentMissing = /character identity and lootSpec are required|wishlist must contain/i.test(String(snapshotResult.error || ""));
                  throw new Error(deploymentMissing
                    ? "The Google Apps Script deployment is outdated and does not support SimC audit snapshots yet."
                    : snapshotResult.error || "Could not save the SimC audit snapshot");
                }
                setSimcSnapshots((existing) => ({ ...existing, [c.id]: snapshotResult.snapshot }));
                logSimcAttempt(wishlistApiUrl, c, selectedSpec, "snapshot", true);
                // Healers rank on QE, so three Raidbots runs would burn their
                // time and produce numbers the board deliberately ignores. The
                // /simc paste still matters: tier, vault, crests and bags all
                // come from it, and no sim provides those.
                if (inferredRole(c) === "Healer") {
                  // QE only computes in a browser, so the board parks the export
                  // and a worker drives QE Live with it.
                  const queued = await fetch(wishlistApiUrl, {
                    method: "POST",
                    headers: { "Content-Type": "text/plain;charset=utf-8" },
                    body: JSON.stringify({ action: "queueQeRun", characterId: c.id, characterName: c.name, lootSpec: selectedSpec, simc: simcText.trim() }),
                  });
                  const queueResult = await queued.json();
                  if (!queueResult.ok) throw new Error(queueResult.error || "Could not queue the QE run.");
                  // Keep whether the dispatch landed: "pending" means a run is
                  // seconds away when it did, and up to 15 minutes when it did
                  // not, and the panel should not promise the wrong one.
                  setQeQueue((current) => ({ ...current, [String(c.id)]: { state: "pending", requestedAt: queueResult.requestedAt, characterName: c.name, lootSpec: selectedSpec, error: "", dispatched: queueResult.dispatched } }));
                  setSimState("uploaded");
                  setSimMessage(queueResult.dispatched
                    ? "Gear captured. QE is running now for all three difficulties — the panel below updates itself, no reload needed."
                    : "Gear captured and QE queued. It runs on the next sync, usually within 15 minutes.");
                  return;
                }
                const difficulties: Difficulty[] = ["normal", "heroic", "mythic"];
                const jobs: { difficulty: Difficulty; simId: string; reportUrl: string }[] = [];
                for (let index = 0; index < difficulties.length; index++) {
                  const simDifficulty = difficulties[index], label = raidbotDifficulty[simDifficulty].label;
                  setSimMessage(`${label} · submitting ${index + 1} of 3…`);
                  const response = await fetch(wishlistApiUrl, {
                    method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
                    body: JSON.stringify({ action: "submitDroptimizer", characterId: c.id, payload: droptimizerPayload(simcText.trim(), c, selectedSpec, simDifficulty) }),
                  });
                  const result = await response.json();
                  if (!result.ok || !result.simId) throw new Error(`${label}: ${result.error || "Raidbots submission failed"}`);
                  jobs.push({ difficulty: simDifficulty, simId: result.simId, reportUrl: result.reportUrl || `https://www.raidbots.com/simbot/report/${result.simId}` });
                  setSimReports(jobs.map((job) => ({ difficulty: job.difficulty, url: job.reportUrl, state: "queued" })));
                }
                setSimState("running");
                setSimReports(jobs.map((job) => ({ difficulty: job.difficulty, url: job.reportUrl, state: "running" })));
                for (let index = 0; index < jobs.length; index++) {
                  const job = jobs[index], label = raidbotDifficulty[job.difficulty].label;
                  setSimReports((reports) => reports.map((report) => report.difficulty === job.difficulty ? { ...report, state: "running" } : report));
                  setSimMessage(`${label} · waiting for report ${index + 1} of 3…`);
                  let uploaded = false;
                  for (let attempt = 0; attempt < 180; attempt++) {
                    await new Promise((resolve) => window.setTimeout(resolve, 10000));
                    const reportResponse = await fetch(`https://www.raidbots.com/reports/${encodeURIComponent(job.simId)}/data.json`, { cache: "no-store" });
                    if (reportResponse.status === 403 || reportResponse.status === 404) continue;
                    if (reportResponse.ok) {
                      const report = await reportResponse.json();
                      if (report.error || report.errors || report.meta?.error) throw new Error(`${label}: ${String(report.error || report.meta?.error || "Raidbots simulation failed")}`);
                    } else throw new Error(`${label}: Raidbots status check failed (${reportResponse.status}).`);
                    setSimMessage(`${label} · report complete, uploading to WoWAudit…`);
                    for (let uploadAttempt = 0; uploadAttempt < 3; uploadAttempt++) {
                      const statusResponse = await fetch(wishlistApiUrl, {
                        method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
                        body: JSON.stringify({ action: "checkDroptimizer", simId: job.simId, reportReady: true, upload: true,
                          characterId: c.id, characterName: c.name, configurationName: "Single Target", replaceManualEdits: false }),
                      });
                      const status = await statusResponse.json();
                      if (status.ok && status.state === "uploaded") { uploaded = true; break; }
                      if (uploadAttempt === 2) throw new Error(`${label}: ${status.error || "WoWAudit upload failed"}`);
                      await new Promise((resolve) => window.setTimeout(resolve, (uploadAttempt + 1) * 3000));
                    }
                    if (uploaded) break;
                  }
                  if (!uploaded) throw new Error(`${label} is still running. Use its report link to check it later.`);
                  setSimReports((reports) => reports.map((report) => report.difficulty === job.difficulty ? { ...report, state: "uploaded" } : report));
                }
                localStorage.setItem("onlyflasks-pending-sim-refresh-v1", JSON.stringify({
                  characterId: c.id,
                  selectedSpec,
                  before,
                  reportUrls: jobs.map((job) => ({ difficulty: job.difficulty, url: job.reportUrl })),
                }));
                await refreshLiveSims({ before, character: c, selectedSpec, attempts: 13 });
                logSimcAttempt(wishlistApiUrl, c, selectedSpec, "submitted", true, `${jobs.length} difficulties`);
              } catch (error) {
                setSimState("error");
                const detail = error instanceof Error ? error.message : "Simulation failed";
                setSimMessage(detail);
                // Everything past the snapshot lands here: the Raidbots submit,
                // each difficulty, and the WoWAudit upload. That is exactly the
                // stretch where a raider sees a sim run and the board still ends
                // up with nothing.
                logSimcAttempt(wishlistApiUrl, c, selectedSpec, "submit", false, detail, simcText.trim());
              }
            };
            const retrySimRefresh = async () => {
              let pending: any = null;
              try { pending = JSON.parse(localStorage.getItem("onlyflasks-pending-sim-refresh-v1") || "null"); } catch { /* ignore damaged local state */ }
              const matches = pending && +pending.characterId === +c.id && pending.selectedSpec === selectedSpec;
              if (matches && Array.isArray(pending.reportUrls)) {
                setSimReports(pending.reportUrls.map((report: any) => ({ ...report, state: "uploaded" })));
              }
              await refreshLiveSims({
                before: matches ? pending.before : undefined,
                character: c,
                selectedSpec,
                attempts: matches ? 13 : 1,
              });
            };
            const allCandidates = [
              ...(data.seasonLoot?.items || []).map((i) => ({
                ...i,
                drop: i.encounter ? `${i.encounter} · ${i.source}` : i.source,
              })),
              ...data.raid.bosses.flatMap((b) =>
                b.items.map((i) => ({ ...i, drop: b.name })),
              ),
              ...classSpecs.flatMap((s) => data.bis.lists[s]?.items || []),
            ];
            const candidateMap = new Map<number, Item>();
            for (const item of allCandidates) {
              const existing = candidateMap.get(item.itemId);
              candidateMap.set(
                item.itemId,
                existing
                  ? {
                      ...existing,
                      ...item,
                      slot: item.slot || existing.slot,
                      armorType: item.armorType || existing.armorType,
                      icon: item.icon || existing.icon,
                      drop: item.drop || existing.drop,
                    }
                  : item,
              );
            }
            const uniqueCandidates = [...candidateMap.values()].filter((i) =>
              itemEligibleForSpec(i, c, selectedSpec),
            );
            const rows = current
              .map((item, originalIndex) => ({ item, originalIndex }))
              .filter(
                ({ item }) => !["SHIRT", "TABARD"].includes(slot(item.slot)),
              );
            return (
              <section className="wishlist-page">
                <div className="wishlist-hero">
                  <div>
                    <p className="rune">Raider setup</p>
                    <h2>Build my wishlist</h2>
                    <p>
                      Your saved choices immediately replace the Icy Veins
                      fallback in loot decisions.
                    </p>
                  </div>
                  <span
                    className={customized ? "custom-list" : "fallback-list"}
                  >
                    {customized
                      ? "CUSTOM ACTIVE"
                      : customWishlists[c.id]
                        ? "ICY VEINS SAVED"
                        : "ICY VEINS DEFAULT"}
                  </span>
                </div>
                <div className="wishlist-steps" aria-label="Wishlist steps">
                  <span className="active"><b>1</b><em>Choose your character and loot spec</em></span>
                  <span><b>2</b><em>Change only the items you want</em></span>
                  <span><b>3</b><em>Save your wishlist</em></span>
                </div>
                <div className="wishlist-controls">
                  <label>
                    <small>CHARACTER · A–Z</small>
                    <div
                      className="character-select-wrap"
                      style={
                        { "--class": colors[c.class] } as React.CSSProperties
                      }
                    >
                      <i />
                      <select
                        value={c.id}
                        onChange={(e) => {
                          setWishlistCharacter(+e.target.value);
                          setSimcText("");
                          setSimState("idle");
                          setSimMessage("");
                          setSimReports([]);
                          setSyncState("idle");
                        }}
                      >
                        {[...data.characters]
                          .sort((a, b) =>
                            a.name.localeCompare(b.name, undefined, {
                              sensitivity: "base",
                            }),
                          )
                          .map((x) => (
                            <option
                              value={x.id}
                              key={x.id}
                              style={{ color: colors[x.class] }}
                            >
                              {roleGlyph(x)} {x.name}
                            </option>
                          ))}
                      </select>
                      <em
                        className={`picker-role ${inferredRole(c).toLowerCase()}`}
                        title={inferredRole(c)}
                        aria-label={inferredRole(c)}
                      >
                        {inferredRole(c) === "Tank" ? (
                          <Shield />
                        ) : inferredRole(c) === "Healer" ? (
                          <HeartPulse />
                        ) : (
                          <Swords />
                        )}
                      </em>
                    </div>
                  </label>
                  <label>
                    <small>LOOT SPECIALIZATION</small>
                    <select
                      value={selectedSpec}
                      onChange={(e) => {
                        const nextSpecs = { ...specs, [c.id]: e.target.value };
                        setSpecs(nextSpecs);
                        localStorage.setItem(
                          "onlyflasks-board-specs-v1",
                          JSON.stringify(nextSpecs),
                        );
                        const nextLists = { ...customWishlists };
                        delete nextLists[c.id];
                        setCustomWishlists(nextLists);
                        localStorage.setItem(
                          "onlyflasks-custom-wishlists-v3",
                          JSON.stringify(nextLists),
                        );
                        setSimcText("");
                        setSimState("idle");
                        setSimMessage("This loot spec needs its own simulations. Save the wishlist, then paste a fresh /simc export.");
                        setSimReports([]);
                        setSyncState("idle");
                      }}
                    >
                      {/* A <select> whose value matches no option still renders
                          the first one, so an unlisted spec looks selected when
                          it is not — the exact trap an empty spec fell into.
                          Always carry an option for the current value. */}
                      {!classSpecs.includes(selectedSpec) && (
                        <option value={selectedSpec}>
                          {selectedSpec ? `${selectedSpec} — no BiS list` : "Select a loot specialization…"}
                        </option>
                      )}
                      {classSpecs.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="reset-list"
                    disabled={!customized}
                    onClick={() => {
                      const next = { ...customWishlists };
                      delete next[c.id];
                      setCustomWishlists(next);
                      localStorage.setItem(
                        "onlyflasks-custom-wishlists-v3",
                        JSON.stringify(next),
                      );
                    }}
                  >
                    Restore Icy Veins
                  </button>
                  <button
                    className={`submit-list ${syncState}`}
                    disabled={
                      !wishlistApiUrl ||
                      syncState === "saving" ||
                      syncState === "loading"
                    }
                    onClick={submit}
                  >
                    {!wishlistApiUrl
                      ? "Shared save not configured"
                      : syncState === "saving"
                        ? "Submitting…"
                        : syncState === "saved"
                            ? "Wishlist saved ✓"
                          : syncState === "error"
                            ? "Retry save"
                            : customized
                              ? "Save my wishlist"
                              : "Save loot spec"}
                  </button>
                </div>
                <div className="wishlist-notice">
                  <strong>Your list is already filled in</strong>
                  <span>
                    Icy Veins is the starting point. Change only what you want, then press <b>Save my wishlist</b>. Choices are limited to valid {selectedSpec} loot.
                  </span>
                </div>
                <details className={`simc-disclosure ${simcOutstanding.length ? "needed" : "done"}`}>
                  <summary>
                    <span className="simc-summary-copy">
                      <b>{simcOutstanding.length ? "NEEDED THIS WEEK" : "DONE THIS WEEK"}</b>
                      <strong>
                        {simcOutstanding.length
                          ? `Update my simulations — no current ${simcOutstanding.join(" or ")}`
                          : "Simulations are current for this week"}
                      </strong>
                      <em>
                        {simcOutstanding.length
                          ? "Without a sim, loot ranking falls back to item level and your tier, vault and crests stay blank."
                          : `Sim ${relativeAge(newestSim)} · capture ${relativeAge(captureAt)}. Re-run after Tuesday's reset.`}
                      </em>
                    </span>
                    <ChevronDown />
                  </summary>
                <section className={`simc-panel ${simState}`}>
                  <div className="simc-panel-head">
                    <div>
                      <p className="rune">Raidbots pilot</p>
                      <h3>Update my loot simulation</h3>
                      <p>Paste one complete <code>/simc</code> export. We run and upload separate Normal, Heroic, and Mythic raid Droptimizers.</p>
                    </div>
                    {simReports.length > 0 && <div className="sim-report-links">{simReports.map((report) => <a className={report.state} href={report.url} target="_blank" rel="noreferrer" key={report.difficulty}><b>{report.difficulty[0].toUpperCase()}</b><span className="sim-report-copy"><strong>{raidbotDifficulty[report.difficulty].label}</strong><small>{report.state === "uploaded" ? "Added to WoWAudit" : report.state === "running" ? "Running on Raidbots" : "Submitted"}</small></span><em>View ↗</em></a>)}</div>}
                  </div>
                  <textarea
                    value={simcText}
                    onChange={(e) => setSimcText(e.target.value)}
                    placeholder={'hunter="Character"\nlevel=90\n…'}
                    aria-label="SimulationCraft export"
                  />
                  {simcCheck && (
                    <div className={`simc-check ${wrongCharacter ? "bad" : simcCheck.hasCurrencies ? "good" : "warn"}`}>
                      {wrongCharacter ? (
                        <><CircleAlert /><span><strong>This export belongs to {simcCheck.character}, not {c.name}.</strong> Paste {c.name}&rsquo;s own <code>/simc</code>.</span></>
                      ) : simcCheck.hasCurrencies ? (
                        <><ClipboardCheck /><span><strong>{simcCheck.character} &middot; {simcCheck.bags} bag {simcCheck.bags === 1 ? "item" : "items"}, {simcCheck.vault} vault.</strong> Crests and catalyst charges came through.</span></>
                      ) : (
                        <><CircleAlert /><span>
                          <strong>No currencies in this export &mdash; crests and catalyst charges will be blank.</strong>{" "}
                          {simcCheck.addonStale
                            ? <>Your SimulationCraft addon is <b>{simcCheck.addon}</b> but the game is <b>{simcCheck.client}</b>. Update the addon and run <code>/simc</code> again.</>
                            : <>Update the SimulationCraft addon and run <code>/simc</code> again.</>}{" "}
                          Gear, bags and vault are still fine, so you can submit anyway.
                        </span></>
                      )}
                    </div>
                  )}
                  <div className="simc-actions">
                    <span>{simMessage || "Nothing is submitted until you press Run and upload."}</span>
                    <div className="simc-action-buttons">
                    <button className="refresh-sims" disabled={!wishlistApiUrl || simState === "submitting" || simState === "running" || simState === "refreshing"} onClick={retrySimRefresh}>
                      <RefreshCw /> Refresh existing sims
                    </button>
                    <button disabled={!wishlistApiUrl || simcText.trim().length < 100 || wrongCharacter || simState === "submitting" || simState === "running" || simState === "refreshing"} onClick={submitSim}>
                      {simState === "submitting" ? "Submitting simulations…" : simState === "running" ? "Updating simulations…" : simState === "error" ? "Retry simulation update" : simState === "uploaded" ? "Update simulations again" : simcCheck && !simcCheck.hasCurrencies && !wrongCharacter ? "Submit without crest data" : "Update my simulations"}
                    </button>
                    </div>
                  </div>
                  {inferredRole(c) === "Healer" && (
                    <div className={`qe-steps ${qeHave.length === 3 ? "done" : qeJob?.state === "error" ? "failed" : qeJob ? "running" : ""}`}>
                      <div className="qe-step-head">
                        <b>QE LIVE · YOUR LOOT RANKING</b>
                        {/* "Queued" and "running" are different facts and the panel
                            used to call both of them running — so a job still
                            waiting on the worker claimed to be underway, which is
                            what makes 40 seconds of yellow look broken. */}
                        <span>
                          {qeJob?.state === "error"
                            ? `Failed: ${qeJob.error || "unknown error"}. Re-paste to retry.`
                            : qeJob?.state === "running"
                              ? `Running · started ${relativeAge(qeJob.requestedAt)}`
                              : qeJob
                                ? `Queued ${relativeAge(qeJob.requestedAt)}${qeJob.dispatched === false ? " · waiting for the next sync" : qeJob.dispatched ? " · starting now" : ""}`
                                : qeHave.length === 3
                                  ? `Scored from your ${qeStored.spec} export, ${relativeAge(qeStored.capturedAt)}.`
                                  : "Paste your /simc above. QE is run for you."}
                        </span>
                      </div>
                      <div className="qe-difficulty-state">
                        {(["normal", "heroic", "mythic"] as Difficulty[]).map((d) => {
                          const working = Boolean(qeJob) && qeJob.state !== "error",
                            scored = !working && qeHave.includes(d),
                            // Each difficulty is its own QE report, so each tile
                            // can link to the run behind its own number.
                            reportId = scored ? qeStored.reportIds?.[d] : "",
                            // When one difficulty fails, saveQeReport_ merges the
                            // previous run's scores forward under a fresh
                            // capturedAt — so the tile reads as current when it is
                            // not. Scores with no id of their own are exactly that
                            // case. Only judge it once the report carries ids at
                            // all, or every report predating them looks stale.
                            carried = scored && !reportId && Object.keys(qeStored.reportIds || {}).length > 0,
                            className = working ? "working" : carried ? "carried" : scored ? "have" : "missing",
                            label = <><b>{raidbotDifficulty[d].label}</b><small>{working ? (qeJob.state === "running" ? "running…" : "queued…") : carried ? "earlier run" : scored ? `${Object.keys(qeStored.difficulties[d]).length} items` : "not scored"}</small></>;
                          return reportId
                            ? <a className={className} key={d} href={`https://questionablyepic.com/live/upgradereport/${reportId}`} target="_blank" rel="noreferrer" title="Open this difficulty's QE report">{label}</a>
                            : <span className={className} key={d} title={carried ? "This difficulty failed in the last run — these scores are carried over from an earlier one. Re-paste to refresh them." : undefined}>{label}</span>;
                        })}
                      </div>
                    </div>
                  )}
                </section>
                </details>
                <div className="wishlist-grid">
                  {rows.map(({ item: target, originalIndex }, index) => {
                    const targetSlot = slot(target.slot),
                      occurrence = rows
                        .slice(0, index + 1)
                        .filter((x) => slot(x.item.slot) === targetSlot).length,
                      repeated = ["FINGER", "TRINKET"].includes(targetSlot),
                      label = `${targetSlot.replace("_", " ")}${repeated ? ` ${occurrence}` : ""}`,
                      rawChoices = uniqueCandidates.filter(
                        (i) => slot(i.slot) === targetSlot && !i.catalyst,
                      ),
                      raidSource = target.sourceItemId
                        ? data.raid.bosses
                            .flatMap((b) =>
                              b.items.map((i) => ({
                                ...i,
                                source: b.name,
                                sourceType: "Raid",
                              })),
                            )
                            .find((i) => +i.itemId === Number(target.sourceItemId))
                        : null,
                      seasonSource = target.sourceItemId
                        ? data.seasonLoot?.items.find(
                            (i) => +i.itemId === Number(target.sourceItemId),
                          )
                        : null,
                      sourceItem = raidSource || seasonSource,
                      crafted = Boolean(
                        target.crafted || /craft/i.test(target.drop || ""),
                      ),
                      choices = target.catalyst
                        ? rawChoices.filter((i) => !i.crafted && !i.tierToken)
                        : rawChoices,
                      tierKey: Record<string, string> = {
                        HEAD: "head",
                        SHOULDER: "shoulder",
                        CHEST: "chest",
                        HANDS: "hands",
                        LEGS: "legs",
                      },
                      tierId = Number(
                        data.auditActivity?.periodInfo?.current_season
                          ?.tier_items_by_slot?.[classIds[c.class]]?.[
                          tierKey[targetSlot]
                        ] || 0,
                      ),
                      tierMeta = Object.values(data.bis.lists)
                        .flatMap((x) => x.items)
                        .find((i) => +i.itemId === tierId),
                      canCatalyze = Boolean(
                        tierId && !crafted && !target.tierToken,
                      );
                    const toggleCatalyst = () => {
                      const next = [...current];
                      if (target.catalyst) {
                        const base =
                          sourceItem ||
                          uniqueCandidates.find(
                            (i) => +i.itemId === Number(target.sourceItemId),
                          );
                        if (base) next[originalIndex] = base;
                      } else if (tierMeta) {
                        next[originalIndex] = {
                          ...tierMeta,
                          sourceItemId: target.itemId,
                          catalyst: true,
                          crafted: false,
                          drop: `Catalyst from ${target.drop || target.name}`,
                        };
                      }
                      save(next);
                    };
                    return (
                      <article
                        className="wishlist-slot"
                        key={`${targetSlot}-${index}`}
                      >
                        <div className="wishlist-slot-label">
                          <span>{label}</span>
                          {target.catalyst ? (
                            <b className="catalyst-tag">CATALYST</b>
                          ) : crafted ? (
                            <b className="crafted-tag">CRAFTED</b>
                          ) : (
                            <b>DROP</b>
                          )}
                        </div>
                        <div className="wishlist-choice">
                          <WowItem item={target} size={42} />
                          <div>
                            <strong>{target.name}</strong>
                            <small>
                              {target.catalyst
                                ? "Result after Catalyst"
                                : target.drop || "Selected target"}
                            </small>
                          </div>
                        </div>
                        {target.catalyst && sourceItem && (
                          <div className="catalyst-base">
                            <WowItem item={sourceItem} size={30} />
                            <div>
                              <small>BASE ITEM TO CATALYZE</small>
                              <strong>{sourceItem.name}</strong>
                              <span>
                                {sourceItem.encounter
                                  ? `${sourceItem.encounter} · `
                                  : ""}
                                {sourceItem.source || target.drop}
                              </span>
                            </div>
                          </div>
                        )}
                        <label className="wishlist-item-picker">
                          <small>
                            {target.catalyst
                              ? "CHOOSE BASE ITEM"
                              : "CHOOSE TARGET ITEM"}
                          </small>
                          <select
                            value={
                              target.catalyst
                                ? target.sourceItemId
                                : target.itemId
                            }
                            onChange={(e) => {
                              const picked = choices.find(
                                (i) => +i.itemId === +e.target.value,
                              );
                              if (!picked) return;
                              const next = [...current];
                              next[originalIndex] = target.catalyst
                                ? {
                                    ...target,
                                    sourceItemId: picked.itemId,
                                    drop: `Catalyst from ${picked.source || picked.drop || picked.name}`,
                                  }
                                : picked;
                              save(next);
                            }}
                          >
                            {choices.map((i) => (
                              <option value={i.itemId} key={i.itemId}>
                                {i.name}
                                {i.crafted || /craft/i.test(i.drop || "")
                                  ? " · Crafted"
                                  : ` · ${i.source || i.drop || "Raid"}`}
                              </option>
                            ))}
                          </select>
                        </label>
                        {canCatalyze && (
                          <button
                            className={`catalyst-toggle ${target.catalyst ? "active" : ""}`}
                            onClick={toggleCatalyst}
                          >
                            {target.catalyst
                              ? "Use base item"
                              : "Catalyze this item"}
                          </button>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })()}
        {view === "decisions" && (
          <>
            <section className="raid-context">
              <div>
                <p className="rune">Raid difficulty</p>
                <div className="difficulty-picker">
                  {(["normal", "heroic", "mythic"] as Difficulty[]).map(
                    (value) => (
                      <button
                        className={difficulty === value ? "selected" : ""}
                        key={value}
                        onClick={() => {
                          setDifficulty(value);
                          localStorage.setItem("onlyflasks-difficulty", value);
                        }}
                      >
                        {value}
                      </button>
                    ),
                  )}
                </div>
              </div>
            </section>
            <nav>
              {data.raid.bosses.map((b, i) => {
                const count = b.items.reduce(
                  (n, item) =>
                    n +
                    data.characters.filter((c) => {
                      const list = wishlistFor(c);
                      const wanted = list.some(
                        (t) =>
                          +t.itemId === +item.itemId ||
                          Number(t.sourceItemId) === +item.itemId ||
                          norm(t.name) === norm(item.name) ||
                          (item.tierToken &&
                            !t.catalyst &&
                            tokenFitsClass(item, c) &&
                            isExplicitTierTarget(data, c, t) &&
                            slot(t.slot) === slot(item.slot)),
                      );
                      if (!wanted) return false;
                      const target = list.find(
                          (t) =>
                            +t.itemId === +item.itemId ||
                            Number(t.sourceItemId) === +item.itemId ||
                            norm(t.name) === norm(item.name) ||
                            (item.tierToken &&
                              !t.catalyst &&
                              tokenFitsClass(item, c) &&
                              isExplicitTierTarget(data, c, t) &&
                              slot(t.slot) === slot(item.slot)),
                        ),
                        satisfied = Boolean(
                          target &&
                            targetSatisfiedAtTrack(
                              data,
                              c,
                              target,
                              tracks[difficulty],
                            ),
                        );
                      return Boolean(target) && !satisfied;
                    }).length,
                  0,
                );
                return (
                  <button
                    className={i === bossIndex ? "active" : ""}
                    onClick={() => setBoss(i)}
                    key={b.name}
                  >
                    {b.name}
                    <b>{count}</b>
                  </button>
                );
              })}
            </nav>
            <section className="section-head">
              <div>
                {/* "Boss 9" would be a lie for a boss sitting in its own raid on
                    its own lockout, so name the instance instead of the rung. */}
                <p className="rune">{boss.raid && boss.raid !== data.raid.raid ? boss.raid : `Boss ${bossIndex + 1}`}</p>
                <h2>{boss.name}</h2>
              </div>
            </section>
            <div className="key">
              <span className="sim">
                <Sparkles /> SIM result
              </span>
              <span className="fallback">
                <Swords /> Icy Veins fallback
              </span>
              <span className="upgrade">
                <TrendingUp /> Item-level context
              </span>
            </div>
            <section className="loot-list">
              {model.length ? (
                model.map(({ item, people }) => (
                  <article className="loot" key={item.itemId}>
                    <div className="loot-title">
                      <WowItem item={item} size={58} />
                      <div>
                        <a
                          className="wow-name"
                          href={`https://www.wowhead.com/item=${item.itemId}`}
                          data-wowhead={`item=${item.itemId}`}
                          target="_blank" rel="noreferrer"
                        >
                          {item.name}
                        </a>
                        <p>
                          {item.slot} <i /> {difficulty}{" "}
                          {bossLevel(boss, difficulty, bossIndex)} · {tracks[difficulty]}{" "}
                          track
                        </p>
                      </div>
                      <strong className={people.length ? "has-needs" : "none"}>
                        {people.length}
                        <small> need{people.length === 1 ? "" : "s"}</small>
                      </strong>
                    </div>
                    {people.length ? (
                      <div className="candidates">
                        <div className="candidate-head" aria-hidden="true">
                          <span>Priority</span>
                          <span>Raider</span>
                          <span>Currently equipped</span>
                          <span>Upgrade</span>
                        </div>
                        {people.map(({ c, worn, target, sim, ilvl }, rank) => (
                          <div
                            className={`candidate ${(rosterStatuses[c.id] || c.rosterStatus || "Main").toLowerCase()}`}
                            style={
                              {
                                "--class": colors[c.class],
                              } as React.CSSProperties
                            }
                            key={c.id}
                          >
                            <div className="rank">{rank + 1}</div>
                            <div className="player">
                              <RaiderIdentity
                                c={c}
                                spec={specs[c.id] || c.defaultSpec}
                                status={rosterStatuses[c.id] || c.rosterStatus || "Main"}
                                chip
                              />
                            </div>
                            <div className="current-card">
                              <div className="current-copy">
                                <small>
                                  {(worn || []).length > 1
                                    ? "EQUIPPED — REPLACES ONE OF THESE"
                                    : "CURRENTLY EQUIPPED"}
                                </small>
                                {(worn || []).length === 0 && (
                                  <span className="gear-meta">No equipped slot match</span>
                                )}
                                {(worn || []).map((piece: Item) => (
                                  <span className="worn-item" key={piece.slot}>
                                    <WowItem item={piece} size={30} />
                                    <a
                                      href={`https://www.wowhead.com/item=${piece.itemId}`}
                                      data-wowhead={`item=${piece.itemId}`}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {piece.name}
                                    </a>
                                    <em>
                                      {piece.itemLevel}
                                      {piece.track ? ` · ${piece.track} ${piece.trackRank || ""}` : ""}
                                    </em>
                                  </span>
                                ))}
                              </div>
                              {(item.tierToken || target.catalyst) && (
                                <div
                                  className={`conversion-route ${target.catalyst ? "catalyst" : "token"}`}
                                >
                                  <span
                                    className="conversion-arrow"
                                    aria-hidden="true"
                                  >
                                    →
                                  </span>
                                  <WowItem item={target} size={30} />
                                  <a
                                    href={`https://www.wowhead.com/item=${target.itemId}`}
                                    data-wowhead={`item=${target.itemId}`}
                                    target="_blank" rel="noreferrer"
                                  >
                                    <small>
                                      {target.catalyst
                                        ? "CATALYST RESULT"
                                        : "TIER RESULT"}
                                    </small>
                                    <b>{target.name}</b>
                                  </a>
                                </div>
                              )}
                            </div>
                            <div className="decision-metrics">
                              <div className={`decision-metric sim ${sim === null ? "missing" : sim > 0 ? "positive" : sim < 0 ? "negative" : "neutral"}`}>
                                <small>SIM</small>
                                <strong>{sim === null ? "—" : `${sim > 0 ? "+" : ""}${sim.toFixed(2)}%`}</strong>
                              </div>
                              <div className={`decision-metric ilvl ${ilvl > 0 ? "positive" : ilvl < 0 ? "negative" : "neutral"}`}>
                                <small>ILVL</small>
                                <strong>{`${ilvl > 0 ? "+" : ""}${ilvl}`}</strong>
                              </div>
                            </div>
                            <div
                              className={`evidence ${sim !== null ? "has-sim" : "estimated"}`}
                            >
                              <small>
                                {sim !== null
                                  ? "SIMULATED GAIN"
                                  : "ITEM-LEVEL GAP"}
                              </small>
                              <strong>
                                {sim !== null
                                  ? `+${sim.toFixed(2)}%`
                                  : `+${ilvl}`}
                              </strong>
                              <span>
                                {sim !== null
                                  ? `+${ilvl} item levels`
                                  : "item levels below drop"}
                              </span>
                              {sim === null && (
                                <em>Icy Veins · Awaiting sim</em>
                              )}
                            </div>
                            <div
                              className={`signal ${sim !== null ? "sim" : "fallback"}`}
                            >
                              {sim !== null ? (
                                <>
                                  <Sparkles /> SIM
                                </>
                              ) : (
                                <>
                                  <Swords /> ICY VEINS
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="no-needs">No matching recommendation.</p>
                    )}
                  </article>
                ))
              ) : (
                <div className="empty">No actionable needs for this boss.</div>
              )}
            </section>
            <button className="spec-toggle" onClick={() => setOpen(!open)}>
              <ChevronDown className={open ? "rotated" : ""} /> Review assumed
              specs
            </button>
            {open && (
              <div className="spec-grid">
                {data.characters.map((c) => (
                  <label
                    key={c.id}
                    style={
                      { "--class": colors[c.class] } as React.CSSProperties
                    }
                  >
                    <RaiderIdentity c={c} spec={specs[c.id] || c.defaultSpec} status={rosterStatuses[c.id] || c.rosterStatus || "Main"} compact />
                    <select
                      value={specs[c.id] || c.defaultSpec}
                      onChange={(e) => {
                        const next = { ...specs, [c.id]: e.target.value };
                        setSpecs(next);
                        localStorage.setItem(
                          "onlyflasks-board-specs-v1",
                          JSON.stringify(next),
                        );
                      }}
                    >
                      {!data.specs.includes(specs[c.id] || c.defaultSpec) && (
                        <option value={specs[c.id] || c.defaultSpec}>
                          {specs[c.id] || c.defaultSpec || "Select a loot specialization…"}
                        </option>
                      )}
                      {data.specs
                        .filter((s) => s.endsWith(c.class))
                        .map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                    </select>
                  </label>
                ))}
              </div>
            )}
          </>
        )}
        {view === "history" && (
          <section className="history-page">
            <div className="history-page-head">
              <div>
                <p className="rune">WoWAudit · RC Loot Council</p>
                <h2>Loot history</h2>
                <p>
                  Addon response, previous gear, award source, and equipped
                  verification.
                </p>
              </div>
              <button onClick={() => location.reload()}>
                <RefreshCw />
                Reload latest data
              </button>
            </div>
            <div className="history-group">
              <h3>
                WoWAudit history{" "}
                <span>{data.lootHistory?.history_items?.length || 0}</span>
              </h3>
              <p className="group-note">
                Authoritative RC Loot Council awards and the response selected
                in the addon.
              </p>
              {data.lootHistory?.history_items?.length ? (
                <div className="history-list">
                  {data.lootHistory.history_items.map((h: any) => {
                    const c = data.characters.find(
                        (x) => +x.id === +h.character_id,
                      ),
                      owned = Boolean(
                        c?.equipment.some((i) => +i.itemId === +h.item_id),
                      );
                    return (
                      <div className="history-row audit" key={h.id}>
                        <WowItem
                          item={{
                            itemId: h.item_id,
                            name: h.name,
                            slot: h.slot,
                            bonusList: h.bonus_list || h.bonus_ids || [],
                            icon: `https://wow.zamimg.com/images/wow/icons/large/${h.icon}.jpg`,
                          }}
                          size={42}
                        />
                        <div className="history-item">
                          <strong>{h.name}</strong>
                          <span>
                            {h.slot} · {h.difficulty}{" "}
                            {h.note ? `· ${h.note}` : ""}
                          </span>
                          {h.old_items?.length > 0 && (
                            <div className="old-items">
                              Replaced:{" "}
                              {h.old_items.map((old: any) => (
                                <a
                                  key={old.item_id}
                                  href={`https://www.wowhead.com/item=${old.item_id}${(old.bonus_list || old.bonus_ids || []).length ? `?bonus=${(old.bonus_list || old.bonus_ids).join(":")}` : ""}`}
                                  data-wowhead={`item=${old.item_id}${(old.bonus_list || old.bonus_ids || []).length ? `&bonus=${(old.bonus_list || old.bonus_ids).join(":")}` : ""}`}
                                >
                                  #{old.item_id}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                        <div
                          className="history-player"
                          style={{ "--class": c ? colors[c.class] : "#cfc4bd" } as React.CSSProperties}
                        >
                          <strong>
                            {c?.name || `Character ${h.character_id}`}
                          </strong>
                          <span>
                            {new Date(h.awarded_at).toLocaleString()} · by{" "}
                            {h.awarded_by_name}
                          </span>
                        </div>
                        <span
                          className="response"
                          style={{
                            background: h.response_type?.rgba || "#51483f",
                          }}
                        >
                          {h.response_type?.name || "Unknown response"}
                        </span>
                        <span className={owned ? "verified" : "unverified"}>
                          {owned ? "EQUIPPED" : "NOT EQUIPPED / NOT DETECTED"}
                        </span>
                        <span></span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty">
                  No Season 2 awards are currently recorded in WoWAudit.
                </div>
              )}
            </div>
          </section>
        )}
        {view === "audit" && (
          <section className="audit-page">
            <div className="audit-hero">
              <div>
                <p className="rune">Weekly readiness</p>
                <h2>Raid audit</h2>
                <p>
                  Only exceptions that need attention. Healthy players stay
                  compact.
                </p>
              </div>
              <div className="audit-kpis">
                <div className="danger">
                  <strong>{actionCount}</strong>
                  <span>need attention</span>
                </div>
                <div className="good">
                  <strong>{audits.length - actionCount}</strong>
                  <span>ready</span>
                </div>
                <div>
                  <strong>{data.auditActivity?.period || "—"}</strong>
                  <span>weekly period</span>
                </div>
              </div>
            </div>
            <div className="source-warning activity-live">
              <ClipboardCheck />
              <div>
                <strong>Weekly activity connected from WoWAudit.</strong>
                <span>
                  M0 count and unlocked Dungeon/Delve vault item levels. Everything on
                  this page is as of the capture below — it does not update on its own.
                </span>
              </div>
            </div>
            <DataFreshness data={data} />
            <div className="audit-table">
              <div className="audit-table-head">
                <span>Raider</span>
                <span>Readiness</span>
                <span>Gear status</span>
                <span></span>
              </div>
              {audits.map(({ c, issues, average }) => {
                const weekly: any = activityById.get(+c.id) || {},
                  rio: any = raiderById.get(+c.id),
                  tierInfo: any = tierById.get(+c.id),
                  vault = weekly.vault_options || {},
                  raidVault = Object.values(vault.raids || {}).filter(
                    Boolean,
                  ) as number[],
                  dungeon = Object.values(vault.dungeons || {}).filter(
                    Boolean,
                  ) as number[],
                  delves = Object.values(vault.world || {}).filter(
                    Boolean,
                  ) as number[],
                  mplus = (weekly.dungeons_done || []).length,
                  raidProgress = unlockedProgress(raidVault, [2, 4, 6]),
                  worldProgress = Math.max(
                    Number(weekly.world_quests_done || 0),
                    unlockedProgress(delves, [2, 4, 8]),
                  ),
                  dungeonProgress = Math.max(
                    Number(weekly.regular_mythic_dungeons_done || 0),
                    mplus,
                    unlockedProgress(dungeon, [1, 4, 8]),
                  );
                return (
                  <details
                    className={`audit-player ${issues.length ? "needs-work" : "ready"}`}
                    key={c.id}
                    open={issues.length > 0}
                  >
                    <summary>
                      <div
                        className="audit-identity"
                        style={
                          { "--class": colors[c.class] } as React.CSSProperties
                        }
                      >
                        <RaiderIdentity c={c} spec={specs[c.id] || c.defaultSpec} status={rosterStatuses[c.id] || c.rosterStatus || "Main"} compact />
                      </div>
                      <span
                        className={`readiness ${issues.length ? "bad" : "ok"}`}
                      >
                        {issues.length
                          ? `${issues.length} ACTION${issues.length === 1 ? "" : "S"}`
                          : "READY"}
                      </span>
                      <div className="audit-gear-status">
                        <span
                          className={`embellishment-count ${c.equipment.filter((item) => item.embellished).length >= 2 ? "complete" : "missing"}`}
                          title={
                            c.equipment
                              .filter((item) => item.embellished)
                              .map(
                                (item) =>
                                  `${item.name}: ${item.embellishmentName}`,
                              )
                              .join("\n") || "No embellishments detected"
                          }
                        >
                          <b>
                            {Math.min(
                              c.equipment.filter((item) => item.embellished)
                                .length,
                              2,
                            )}
                            /2
                          </b>
                          <small>embellishments</small>
                        </span>
                        <strong className="audit-ilvl">
                          {average ? average.toFixed(1) : "—"}
                          <small>avg ilvl</small>
                        </strong>
                      </div>
                      <ChevronDown />
                    </summary>
                    <div className="audit-detail">
                      {issues.length ? (
                        issues.map((issue, i) => (
                          <div
                            className={`audit-issue ${issue.severity}`}
                            key={i}
                          >
                            {issue.item ? (
                              <WowItem item={issue.item} size={34} />
                            ) : (
                              <CircleAlert />
                            )}
                            <div>
                              <strong>
                                {issue.item
                                  ? `${issue.detail.split(" · ")[0]} — ${issue.label}`
                                  : issue.label}
                              </strong>
                              {issue.item && <span>{issue.item.name}</span>}
                              {!issue.item && issue.detail && (
                                <span>{issue.detail}</span>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="all-clear">
                          <ClipboardCheck /> Gear checks passed
                        </div>
                      )}
                      <TierResourceSnapshot info={tierInfo} visuals={visualItems} icons={data.itemIcons || {}} compact />
                      <div className="vault-placeholder live">
                        <strong>Weekly activity</strong>
                        <span className={raidProgress >= 6 ? "done" : "behind"}>
                          Raid {raidProgress}/6
                        </span>
                        <span
                          className={dungeonProgress >= 8 ? "done" : "behind"}
                        >
                          Dungeons {Math.min(dungeonProgress, 8)}/8
                        </span>
                        <span
                          className={
                            (weekly.regular_mythic_dungeons_done || 0) >= 8
                              ? "done"
                              : "behind"
                          }
                        >
                          M0 {weekly.regular_mythic_dungeons_done || 0}
                        </span>
                        <span className={mplus >= 8 ? "done" : "behind"}>
                          Mythic+ {mplus}
                        </span>
                        <span
                          className={worldProgress >= 8 ? "done" : "behind"}
                        >
                          Delves / World {Math.min(worldProgress, 8)}/8
                        </span>
                      </div>
                      <div className="vault-rewards">
                        <strong>Great Vault rewards</strong>
                        <div>
                          <b>Raid bosses</b>
                          {[0, 1, 2].map((i) => (
                            <span
                              className={raidVault[i] ? "unlocked" : "locked"}
                              key={i}
                            >
                              {[2, 4, 6][i]} bosses
                              <em>
                                {raidVault[i]
                                  ? `${raidVault[i]} ilvl`
                                  : "Locked"}
                              </em>
                            </span>
                          ))}
                        </div>
                        <div>
                          <b>Dungeons</b>
                          {[0, 1, 2].map((i) => {
                            const verified =
                              (rio?.weeklyRuns?.length || 0) >= [1, 4, 8][i];
                            return (
                              <span
                                className={`${dungeon[i] ? "unlocked" : "locked"} ${verified ? "vault-choice corroborated" : ""}`}
                                data-tip={
                                  verified
                                    ? vaultTip(
                                        "dungeon",
                                        i,
                                        dungeon[i],
                                        weekly,
                                        rio,
                                      )
                                    : undefined
                                }
                                key={i}
                              >
                                {[1, 4, 8][i]} activities
                                <em>
                                  {dungeon[i] ? `${dungeon[i]} ilvl` : "Locked"}
                                </em>
                              </span>
                            );
                          })}
                        </div>
                        <div>
                          <b>Delves / World</b>
                          {[0, 1, 2].map((i) => (
                            <span
                              className={delves[i] ? "unlocked" : "locked"}
                              key={i}
                            >
                              {[2, 4, 8][i]} activities
                              <em>
                                {delves[i] ? `${delves[i]} ilvl` : "Locked"}
                              </em>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
        )}
        <footer>
          <DataFreshness data={data} compact />
        </footer>
      </main>
    </>
  );
}
