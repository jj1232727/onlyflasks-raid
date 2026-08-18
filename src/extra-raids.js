// Bosses the addon export cannot see.
//
// /ofloot only exports the instance you ran it in, so a second raid on its own
// lockout — The Tidebound Grotto, one boss, Nymrissa Wavecaller — never reaches
// data/raid-loot.json and was missing from the board entirely. Blizzard's
// journal already lists those drops through season-loot, so build the boss from
// there rather than asking someone to run the addon again in a second raid.
//
// Her drops sit at the FIRST boss's item levels, not a ninth rung: every
// Nymrissa item comes back at 292 normal, 305 heroic and 318 mythic in QE's
// reports. Bosses here therefore carry their own levels, because the positional
// table in App.tsx only ever described The Venomous Abyss.
//
// Shared so the loot board and the tooltip sweep agree on which items exist —
// an item known to one and not the other renders with no effect text.

import { slot as slotOf } from "./gear-slots.js";

export const EXTRA_RAIDS = [
  { name: "The Tidebound Grotto", levels: { normal: 292, heroic: 305, mythic: 318 } },
];

// Bosses built out of season-loot, in the shape the addon path produces.
export function extraBosses(seasonLoot, raidEffects = { items: {} }) {
  return EXTRA_RAIDS.flatMap((extra) => {
    // Same rule the addon path applies: anything with no wearable slot (mounts,
    // decor, quest junk) is not loot council's business.
    const items = (seasonLoot?.items || []).filter(
        (i) => i.sourceType === "Raid" && i.source === extra.name && i.encounter && slotOf(i.slot),
      ),
      order = [];
    for (const i of items) if (!order.includes(i.encounter)) order.push(i.encounter);
    return order.map((encounter) => ({
      name: encounter,
      raid: extra.name,
      levels: extra.levels,
      items: items
        .filter((i) => i.encounter === encounter)
        // classIds and secondaryStats decide spec eligibility and catalyst stat
        // matching. Dropping them left this boss's items answering differently
        // to the same questions as every other item on the board.
        .map((i) => ({
          itemId: i.itemId,
          name: i.name,
          slot: i.slot,
          armorType: i.armorType,
          icon: i.icon,
          classIds: i.classIds || [],
          secondaryStats: i.secondaryStats || [],
          ...(raidEffects?.items?.[i.itemId] || {}),
        })),
    }));
  });
}
