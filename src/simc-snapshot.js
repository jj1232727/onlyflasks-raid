const itemLine = /^#\s+(head|neck|shoulder|back|chest|wrist|hands|waist|legs|feet|finger\d?|trinket\d?|main_hand|off_hand)=,(.+)$/;

const valueFrom = (options, key) => options.match(new RegExp(`(?:^|,)${key}=([^,]+)`))?.[1] || "";

function parseItems(text, heading, endHeading) {
  const start = text.indexOf(heading);
  if (start < 0) return [];
  const requestedEnd = text.indexOf(endHeading, start + heading.length),
    nextHeading = text.indexOf("\n### ", start + heading.length),
    end = requestedEnd >= 0 ? requestedEnd : nextHeading;
  const lines = text.slice(start + heading.length, end < 0 ? undefined : end).split(/\r?\n/);
  let pendingName = "", pendingLevel = 0;
  return lines.flatMap((line) => {
    const name = line.match(/^#\s+(.+?)\s+\((\d+)\)$/);
    if (name) {
      pendingName = name[1];
      pendingLevel = Number(name[2]);
      return [];
    }
    const match = line.match(itemLine);
    if (!match) return [];
    const id = Number(valueFrom(match[2], "id"));
    if (!id) return [];
    const result = {
      itemId: id,
      name: pendingName || `Item ${id}`,
      slot: match[1].replace(/\d$/, "").toUpperCase(),
      itemLevel: pendingLevel,
      bonusList: valueFrom(match[2], "bonus_id").split("/").map(Number).filter(Number.isFinite),
    };
    pendingName = "";
    pendingLevel = 0;
    return [result];
  });
}

const parsePairs = (text, key, typed = false) => {
  const raw = text.match(new RegExp(`^#\\s*${key}=([^\\r\\n]*)`, "m"))?.[1]?.trim() || "";
  return raw.split("/").reduce((result, entry) => {
    const parts = entry.split(":");
    const id = Number(parts[typed ? 1 : 0]), quantity = Number(parts[typed ? 2 : 1]);
    if (Number.isFinite(id) && Number.isFinite(quantity)) result[String(id)] = quantity;
    return result;
  }, {});
};

// upgrade_currencies mixes two kinds of entry, tagged by a one-letter prefix:
//   c:3444:90   a currency  (Champion Mistcrest)
//   i:232875:21 an item     (Spark of Radiance, a crafting reagent)
// Splitting on the tag keeps reagents out of the crest counts. Anything that is
// not an item is treated as a currency, so an unfamiliar future tag still lands
// on the side that gets looked up by id rather than being silently dropped.
const parseTaggedPairs = (text, key) => {
  const raw = text.match(new RegExp(`^#\\s*${key}=([^\\r\\n]*)`, "m"))?.[1]?.trim() || "";
  const currencies = {}, items = {};
  for (const entry of raw.split("/")) {
    const parts = entry.split(":");
    if (parts.length < 3) continue;
    const id = Number(parts[1]), quantity = Number(parts[2]);
    if (!Number.isFinite(id) || !Number.isFinite(quantity)) continue;
    (parts[0].trim().toLowerCase() === "i" ? items : currencies)[String(id)] = quantity;
  }
  return { currencies, items };
};

export function parseSimcSnapshot(text, capturedAt = new Date().toISOString()) {
  const character = text.match(/^\w+="([^"]+)"/m)?.[1] || "";
  const upgrades = parseTaggedPairs(text, "upgrade_currencies");
  return {
    character,
    spec: text.match(/^spec=([^\s#]+)/m)?.[1] || "",
    lootSpec: text.match(/^#\s*loot_spec=([^\s#]+)/m)?.[1] || "",
    capturedAt,
    bags: parseItems(text, "### Gear from Bags", "### Weekly Reward Choices"),
    vault: parseItems(text, "### Weekly Reward Choices", "### End of Weekly Reward Choices"),
    catalystCurrencies: parsePairs(text, "catalyst_currencies"),
    upgradeCurrencies: upgrades.currencies,
    upgradeItems: upgrades.items,
  };
}

// Verified against Blizzard/Wowhead: 3444 Champion Mistcrest, 3445 Hero
// Mistcrest, 3446 Myth Mistcrest (Midnight Season 2).
export const MIDNIGHT_S2_CRESTS = {
  champion: 3444,
  hero: 3445,
  myth: 3446,
};

// SimC writes upgrade currencies and crest-granting items into one line, so the
// parsed map mixes small currency ids with six-digit item ids. An export that
// carried no currency ids at all did not capture currency data — which is a
// different thing from the character holding none, and must not read as "0".
export const hasCurrencyData = (snapshot) =>
  Object.keys(snapshot?.upgradeCurrencies || {}).some(
    // Snapshots stored before currencies and items were split still carry
    // reagents in this map; those are six-digit item ids.
    (id) => Number(id) > 0 && Number(id) < 100000,
  );

// What a pasted export actually contains, checked before it is submitted.
// The header carries both versions:
//   # SimC Addon 12.0.1-02
//   # WoW 12.1.0.69299, TOC 120100
// An addon built against an older minor than the client does not know that
// patch's currency ids and silently exports none of them, which is how a sim
// can look fine while every crest count comes through empty.
export function inspectSimcExport(text) {
  const source = String(text || "");
  // The client line carries a build number too ("12.1.0.69299"); keep the
  // three-part version so what is shown to the raider matches the launcher.
  const addon = source.match(/^#\s*SimC Addon\s+(\d+\.\d+\.\d+)/m)?.[1] || "",
    client = source.match(/^#\s*WoW\s+(\d+\.\d+\.\d+)/m)?.[1] || "",
    minor = (version) => version.split(".").slice(0, 2).join(".");
  const snapshot = parseSimcSnapshot(source);
  return {
    character: snapshot.character,
    spec: snapshot.spec,
    addon,
    client,
    // Only compare major.minor; the addon's own build suffix moves separately.
    addonStale: Boolean(addon && client && minor(addon) !== minor(client)),
    hasCurrencies: hasCurrencyData(snapshot),
    bags: snapshot.bags.length,
    vault: snapshot.vault.length,
  };
}

// Catalyst charges are a new currency every season, so a /simc export still
// carries last season's leftovers. Keep the known ids named so the board links
// and labels the one this tier actually spends.
export const CATALYST_CURRENCIES = {
  3465: { name: "Venomblight Manaflux", icon: "inv_10_blacksmithing_craftedoptional_blacksmithdye_earth" },
  3378: { name: "Dawnlight Manaflux", icon: "inv_10_blacksmithing_craftedoptional_blacksmithdye_fire" },
};

export const MIDNIGHT_S2_CATALYST = 3465;

// Always report this season's charges, even when the export has none of them.
// A /simc export keeps every season's leftovers, and showing a stale Dawnlight
// balance reads as "you can catalyze now" when you cannot. Only a currency
// newer than ours wins, so this keeps working into the next season.
export function currentCatalystBalance(snapshot, currencies = snapshot?.catalystCurrencies) {
  const newer = Object.keys(currencies || {})
    .map(Number)
    .filter((id) => Number.isFinite(id) && id > MIDNIGHT_S2_CATALYST);
  const currentId = newer.length ? Math.max(...newer) : MIDNIGHT_S2_CATALYST;
  return { id: currentId, quantity: Number(currencies?.[String(currentId)] || 0) };
}
