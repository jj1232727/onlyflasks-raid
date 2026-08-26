// Slot identity and "what does this drop replace?" logic.
//
// This lived inline in App.tsx in three slightly different forms, and the two
// that disagreed both got rings wrong: one compared against the STRONGEST ring
// in the pair (inverting the item-level gain), the other indexed the pair by
// wishlist position (offering up a ring the player is keeping because it is
// already BiS). One implementation, one test file.

export const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export const slot = (s) => {
  const x = norm(s);
  if (/helm|head/.test(x)) return "HEAD";
  if (x.includes("neck")) return "NECK";
  if (x.includes("shoulder")) return "SHOULDER";
  if (/cloak|back/.test(x)) return "BACK";
  if (/chest|robe/.test(x)) return "CHEST";
  if (/wrist|bracer/.test(x)) return "WRIST";
  if (x === "hands" || x.includes("glove")) return "HANDS";
  if (/waist|belt/.test(x)) return "WAIST";
  if (x.includes("leg")) return "LEGS";
  if (/feet|boot/.test(x)) return "FEET";
  if (/ring|finger/.test(x)) return "FINGER";
  if (x.includes("trinket")) return "TRINKET";
  if (x.includes("offhand")) return "OFF_HAND";
  if (/weapon|mainhand|onehand|twohand|sword|axe|mace|staff|dagger|polearm|bow|gun|crossbow|warglaive/.test(x))
    return "MAIN_HAND";
  return "";
};

// Rings and trinkets occupy two slots each.
export const PAIRED_SLOTS = new Set(["FINGER", "TRINKET"]);

// Everything worn in the slot group an item competes for, strongest first.
export const equippedGroup = (c, item) => {
  const w = slot(item.slot);
  return (c.equipment || [])
    .filter((i) => (PAIRED_SLOTS.has(w) ? String(i.slot).startsWith(w) : i.slot === w))
    .sort((a, b) => (b.itemLevel || 0) - (a.itemLevel || 0));
};

// Equipped pieces that already satisfy one of this character's own targets.
// Another target must not offer them up — they are kept.
export const keptForOwnTargets = (c, list) =>
  new Set(
    (c.equipment || [])
      .filter((i) => (list || []).some((t) => +t.itemId === +i.itemId))
      .map((i) => +i.itemId),
  );

// The piece an incoming item would actually displace: an exact copy if one is
// already worn, else the weakest in the slot group that is not spoken for.
//
// Use this for a SINGLE drop ("this ring dropped — what comes off?"). For a
// whole wishlist rendered at once, use assignReplacements instead: asking this
// twice for two ring targets returns the same ring both times.
export const equipped = (c, item, kept) => {
  const group = equippedGroup(c, item),
    exact = group.find((i) => +i.itemId === +item.itemId);
  if (exact) return exact;
  const free = kept ? group.filter((i) => !kept.has(+i.itemId)) : group,
    pool = free.length ? free : group;
  return pool[pool.length - 1];
};

// One-to-one pairing of every wishlist target with the piece it would replace.
// Two ring targets must name two different rings; a piece already worn claims
// its own target first, and each remaining piece is spent once, weakest first.
// Returns a Map keyed by index into `list` (targets can repeat item ids).
export function assignReplacements(c, list) {
  const groups = new Map();
  (list || []).forEach((target, index) => {
    const key = slot(target.slot);
    if (!groups.has(key)) groups.set(key, { indexes: [], worn: equippedGroup(c, target) });
    groups.get(key).indexes.push(index);
  });
  const assigned = new Map();
  for (const { indexes, worn } of groups.values()) {
    const remaining = [...worn];
    for (const index of indexes) {
      const hit = remaining.findIndex((i) => +i.itemId === +list[index].itemId);
      if (hit >= 0) assigned.set(index, remaining.splice(hit, 1)[0]);
    }
    // `remaining` is strongest-first, so pop() hands out the weakest first.
    for (const index of indexes) {
      if (!assigned.has(index)) assigned.set(index, remaining.pop());
    }
  }
  return assigned;
}

// The 16 slots WoW counts toward equipped item level. Shirt and tabard are
// worn but cosmetic, and carry an item level of 1, so averaging them in drags
// a raider down by ~19.
const COSMETIC_SLOTS = new Set(["SHIRT", "TABARD"]);
const COUNTED_SLOTS = 16;

// Equipped item level, matching the armory and Raider.IO exactly.
//
// The audit tile used to average only pieces at 279 or above, which quietly
// deleted a raider's worst gear from their own score: Abenasters wears a 276
// neck and 276 legs, so the board read him at 307.9 while the armory said 303.
// The filter flattered exactly the people an audit exists to catch.
//
// Two details make this agree with Blizzard on all 21 raiders rather than 13:
//
//   1. A two-handed weapon counts twice. WoW fills the off-hand slot with the
//      same weapon for this calculation, so a two-hander is added again rather
//      than dividing by fifteen. Dividing by the number of pieces worn instead
//      lands within a point but still rounds wrong for every 2H user.
//   2. The divisor is always 16. An empty slot is a zero, not an absence -
//      which is the point, since a missing piece should cost a raider score.
//
// Blizzard truncates the result, so 303.88 displays as 303. Do the same and the
// number is checkable against the armory instead of nearly matching it.
export function equippedItemLevel(equipment) {
  const worn = (equipment || []).filter((i) => !COSMETIC_SLOTS.has(String(i.slot)));
  if (!worn.length) return 0;
  const total = worn.reduce((sum, i) => sum + (i.itemLevel || 0), 0);
  const mainHand = worn.find((i) => String(i.slot) === "MAIN_HAND"),
    twoHanded = mainHand && !worn.some((i) => String(i.slot) === "OFF_HAND");
  return (total + (twoHanded ? mainHand.itemLevel || 0 : 0)) / COUNTED_SLOTS;
}

// What the armory shows. Kept separate so callers that want the raw average for
// sorting are not forced through the truncation.
export const displayItemLevel = (equipment) => Math.floor(equippedItemLevel(equipment));

// How many of the 16 counted slots actually hold something. A two-hander
// legitimately leaves the off-hand empty, so it counts for both.
export function filledSlotCount(equipment) {
  const worn = (equipment || []).filter((i) => !COSMETIC_SLOTS.has(String(i.slot)));
  const twoHanded =
    worn.some((i) => String(i.slot) === "MAIN_HAND") &&
    !worn.some((i) => String(i.slot) === "OFF_HAND");
  return worn.length + (twoHanded ? 1 : 0);
}
