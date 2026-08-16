// Tier set accounting.
//
// The rule that matters: a set bonus counts PIECES, not tracks. Three Champion
// pieces plus one Hero piece is four pieces, so 4PC is active — reporting that
// as "Champion 3/4" reads as incomplete when the bonus is already running.
// Track is reported separately, because it says who still owes upgrades.
//
// The second rule: a piece sitting in bags, or a base plus a catalyst charge,
// is a bonus the raider could switch on today. Surfacing that gap is the whole
// point of the board — it is how you see someone sitting on an unspent upgrade.

import { slot } from "./gear-slots.js";

export const TIER_SLOTS = ["HEAD", "SHOULDER", "CHEST", "HANDS", "LEGS"];
export const TIER_SLOT_KEY = { HEAD: "head", SHOULDER: "shoulder", CHEST: "chest", HANDS: "hands", LEGS: "legs" };
const TRACK_NAMES = ["", "Champion", "Hero", "Myth"];

// Upgrade-track bonus id bands for Midnight Season 2.
export const trackOrder = (item) => {
  const bonuses = item?.bonusList || [];
  if (bonuses.some((id) => id >= 12849 && id <= 12854)) return 3;
  if (bonuses.some((id) => id >= 12841 && id <= 12846)) return 2;
  if (bonuses.some((id) => id >= 12833 && id <= 12838)) return 1;
  return 0;
};
export const trackName = (item) => TRACK_NAMES[trackOrder(item)];
// Compact badge for the slot chips: C / H / M, or — for off-season and empty.
export const trackLetter = (item) => TRACK_NAMES[trackOrder(item)]?.[0] || "—";
export const trackRank = (item) => {
  const bonus = (item?.bonusList || []).find(
    (id) => (id >= 12833 && id <= 12838) || (id >= 12841 && id <= 12846) || (id >= 12849 && id <= 12854),
  );
  if (!bonus) return 0;
  return bonus >= 12849 ? bonus - 12848 : bonus >= 12841 ? bonus - 12840 : bonus - 12832;
};

export const bonusForPieces = (pieces) => (pieces >= 4 ? 4 : pieces >= 2 ? 2 : 0);

// The class's tier item ids for this season, keyed by our slot names.
export function tierIdsForClass(tierItemsBySlot, classId) {
  const raw = tierItemsBySlot?.[classId] || tierItemsBySlot?.[String(classId)] || {};
  const ids = {};
  for (const slotName of TIER_SLOTS) {
    const id = Number(raw[TIER_SLOT_KEY[slotName]] || 0);
    if (id) ids[slotName] = id;
  }
  return ids;
}

export function tierSetStatus({ equipment = [], bags = [], tierIds = {}, charges = 0 }) {
  const allTierIds = new Set(Object.values(tierIds).map(Number));

  // A slot describes the character, not their inventory: what is ON them right
  // now. Bags and the vault are separate holdings and get their own rows — the
  // chip row was previously showing a bag item's icon in a slot the raider had
  // something else equipped in, which read as "they are wearing this".
  const slots = TIER_SLOTS.map((slotName) => {
    const tierId = Number(tierIds[slotName] || 0),
      inSlot = equipment.filter((i) => slot(i.slot) === slotName),
      equippedPiece = tierId ? inSlot.find((i) => +i.itemId === tierId) : undefined,
      worn = equippedPiece || inSlot[0],
      // A worn non-tier piece of this season can feed the Catalyst. Off-season
      // gear cannot, so it reads as nothing usable.
      wornBase = equippedPiece ? undefined : inSlot.find((i) => trackOrder(i) > 0 && !allTierIds.has(+i.itemId));
    return {
      slot: slotName,
      tierId,
      worn,
      base: wornBase,
      source: worn,
      sourceTrack: trackName(worn),
      sourceTrackOrder: trackOrder(worn),
      track: trackName(worn),
      trackOrder: trackOrder(worn),
      state: equippedPiece ? "tier" : wornBase ? (charges > 0 ? "ready" : "waiting") : "missing",
      evidence: worn,
    };
  });

  // Everything held elsewhere that could still become a tier piece.
  const inTierSlot = (i) => TIER_SLOTS.includes(slot(i.slot));
  const bagTier = bags.filter((i) => allTierIds.has(+i.itemId)),
    bagBases = bags.filter((i) => inTierSlot(i) && trackOrder(i) > 0 && !allTierIds.has(+i.itemId));

  const bySlot = (items) => new Set(items.map((i) => slot(i.slot)));
  const tierSlots = new Set(slots.filter((x) => x.state === "tier").map((x) => x.slot)),
    bagTierSlots = bySlot(bagTier),
    baseSlots = new Set([
      ...slots.filter((x) => x.state === "ready" || x.state === "waiting").map((x) => x.slot),
      ...bySlot(bagBases),
    ]);

  const count = (state) => slots.filter((x) => x.state === state).length,
    pieces = count("tier"),
    ready = count("ready"),
    waiting = count("waiting"),
    missing = count("missing");

  // Track mix over equipped pieces only — a bag piece is not giving stats yet.
  const trackMix = {};
  for (const entry of slots) {
    if (entry.state === "tier" && entry.track) trackMix[entry.track] = (trackMix[entry.track] || 0) + 1;
  }

  // Count each slot once, best path first: already worn > free from bags >
  // convert with a charge. Otherwise a slot holding both a bag piece and a
  // base would be counted twice and reachable could exceed five.
  const freeSlots = [...bagTierSlots].filter((s) => !tierSlots.has(s)).length,
    convertibleSlots = [...baseSlots].filter((s) => !tierSlots.has(s) && !bagTierSlots.has(s)).length,
    catalysable = Math.min(convertibleSlots, Math.max(0, charges || 0)),
    reachable = Math.min(TIER_SLOTS.length, pieces + freeSlots + catalysable),
    setBonus = bonusForPieces(pieces),
    reachableBonus = bonusForPieces(reachable);

  return {
    slots, pieces, ready, waiting, missing,
    bagTier, bagBases,
    stored: freeSlots,
    trackMix, setBonus, reachable, reachableBonus,
    freePieces: freeSlots,
    convertibleSlots,
    catalysable,
    // A better set bonus available right now, with no new drops needed.
    hiddenUpgrade: reachableBonus > setBonus,
    // The raid-leader verdict, in priority order:
    //   done   — already 4PC, do not spend loot here
    //   self   — can hit 4PC themselves today (bags and/or charges in hand)
    //   charge — has the bases but not the charges; a charge unblocks them
    //   drop   — needs the boss to actually drop something
    verdict:
      pieces >= 4 ? "done"
        : reachable >= 4 ? "self"
          : pieces + freeSlots + convertibleSlots >= 4 ? "charge"
            : "drop",
  };
}

// "Should we go back and clear Normal/Heroic for tier?"
//
// The set-bonus half of that question is difficulty-blind — a piece is a piece,
// so any difficulty fills an empty slot. The item-level half is not: a run only
// upgrades someone if its track beats what they already wear. Scoring both per
// difficulty is the only way to compare Normal against Heroic against Mythic.
//
// `targetTrackOrder`: 1 Champion (Normal), 2 Hero (Heroic), 3 Myth (Mythic).
export function tierDifficultyValue(statuses, targetTrackOrder) {
  let needFor4 = 0, selfSolve = 0, newPieces = 0, trackUpgrades = 0, upgradeSlots = 0;
  for (const status of statuses) {
    const emptySlots = status.slots.filter((s) => s.state !== "tier").length;
    if (emptySlots > 0) newPieces++;
    // Below 4PC and a run here could carry them there.
    if (status.pieces < 4 && status.pieces + emptySlots >= 4) {
      if (status.reachable >= 4) selfSolve++;
      else needFor4++;
    }
    // Count any slot whose best current track is below this run's — an equipped
    // Champion tier piece and a Champion base they have yet to convert are both
    // improved by a Heroic drop.
    const below = status.slots.filter(
      (s) => s.sourceTrackOrder > 0 && s.sourceTrackOrder < targetTrackOrder,
    ).length;
    if (below > 0) trackUpgrades++;
    upgradeSlots += below;
  }
  return {
    needFor4, selfSolve, newPieces, trackUpgrades, upgradeSlots,
    // worth  — someone reaches 4PC who cannot get there alone
    // ilvl   — nobody gains a bonus, but equipped tier would move up a track
    // skip   — nothing here for anyone
    verdict: needFor4 > 0 ? "worth" : upgradeSlots > 0 ? "ilvl" : "skip",
  };
}

// Roster roll-up. Answers "do we need to run this boss for tier?" directly.
export function tierRosterSummary(rows) {
  const tally = { done: 0, self: 0, charge: 0, drop: 0, charges: 0 };
  for (const row of rows) {
    tally[row.verdict] = (tally[row.verdict] || 0) + 1;
    tally.charges += Math.max(0, Number(row.charges) || 0);
  }
  return tally;
}
