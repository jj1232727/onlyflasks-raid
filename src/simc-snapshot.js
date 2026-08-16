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

export function parseSimcSnapshot(text, capturedAt = new Date().toISOString()) {
  const character = text.match(/^\w+="([^"]+)"/m)?.[1] || "";
  return {
    character,
    spec: text.match(/^spec=([^\s#]+)/m)?.[1] || "",
    lootSpec: text.match(/^#\s*loot_spec=([^\s#]+)/m)?.[1] || "",
    capturedAt,
    bags: parseItems(text, "### Gear from Bags", "### Weekly Reward Choices"),
    vault: parseItems(text, "### Weekly Reward Choices", "### End of Weekly Reward Choices"),
    catalystCurrencies: parsePairs(text, "catalyst_currencies"),
    upgradeCurrencies: parsePairs(text, "upgrade_currencies", true),
  };
}

export const MIDNIGHT_S2_CRESTS = {
  champion: 3444,
  hero: 3445,
  myth: 3446,
};

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
