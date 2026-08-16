export class WowheadError extends Error {
  constructor(message, { status, cause } = {}) {
    super(message, { cause });
    this.name = "WowheadError";
    this.status = status;
  }
}

export function parseUpgradeTrack(tooltip) {
  const match = tooltip?.match(/Upgrade Level:\s*([^<]+?)\s*<!--uindex-->\s*(\d+\s*\/\s*\d+)/iu);
  if (!match) return null;
  return {
    track: match[1].trim(),
    rank: match[2].replace(/\s/gu, ""),
  };
}

export async function fetchUpgradeTrack(item, fetchImpl = fetch) {
  const bonuses = item.bonusList.join(":");
  const url = new URL(`https://nether.wowhead.com/tooltip/item/${item.itemId}`);
  url.searchParams.set("dataEnv", "1");
  url.searchParams.set("locale", "0");
  url.searchParams.set("bonus", bonuses);

  let response;
  try {
    response = await fetchImpl(url, { headers: { accept: "application/json" } });
  } catch (cause) {
    throw new WowheadError(`Could not resolve item ${item.itemId}: ${cause.message}`, { cause });
  }
  if (!response.ok) {
    throw new WowheadError(`Wowhead returned HTTP ${response.status} for item ${item.itemId}.`, {
      status: response.status,
    });
  }
  const payload = await response.json();
  return parseUpgradeTrack(payload.tooltip);
}

