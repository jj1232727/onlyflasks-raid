const DEFAULT_BASE_URL = "https://wowaudit.com";

export class WowauditError extends Error {
  constructor(message, { status, cause } = {}) {
    super(message, { cause });
    this.name = "WowauditError";
    this.status = status;
  }
}

export class WowauditClient {
  constructor({ apiKey, baseUrl = DEFAULT_BASE_URL, fetchImpl = fetch }) {
    if (!apiKey?.trim()) {
      throw new WowauditError("WOWAUDIT_API_KEY is missing. Copy .env.example to .env and add the replacement key.");
    }

    this.apiKey = apiKey.trim();
    this.baseUrl = baseUrl.replace(/\/$/u, "");
    this.fetch = fetchImpl;
  }

  async request(path, { method = "GET", body } = {}) {
    let response;
    try {
      response = await this.fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.apiKey}`,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch (cause) {
      throw new WowauditError(`Could not connect to WoWAudit: ${cause.message}`, { cause });
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const suffix = detail ? `: ${detail.slice(0, 300)}` : "";
      throw new WowauditError(`WoWAudit returned HTTP ${response.status}${suffix}`, {
        status: response.status,
      });
    }

    try {
      return await response.json();
    } catch (cause) {
      throw new WowauditError("WoWAudit returned a non-JSON response.", { cause });
    }
  }

  getTeam() {
    return this.request("/v1/team");
  }

  getCharacters() {
    return this.request("/v1/characters");
  }

  getCharacter(id) {
    return this.request(`/v1/characters/${encodeURIComponent(id)}`);
  }

  getWishlists() {
    return this.request("/v1/wishlists");
  }

  getWishlist(id) {
    return this.request(`/v1/wishlists/${encodeURIComponent(id)}`);
  }

  uploadWishlistReport({
    reportId,
    configurationName,
    characterId,
    characterName,
    replaceManualEdits = false,
  }) {
    if (!reportId?.trim()) throw new WowauditError("Raidbots report ID is required.");
    if (!configurationName?.trim())
      throw new WowauditError("WoWAudit configuration name is required.");
    return this.request("/v1/wishlists", {
      method: "POST",
      body: {
        report_id: reportId.trim(),
        ...(characterId ? { character_id: Number(characterId) } : {}),
        ...(characterName?.trim()
          ? { character_name: characterName.trim() }
          : {}),
        configuration_name: configurationName.trim(),
        replace_manual_edits: Boolean(replaceManualEdits),
      },
    });
  }

  getPeriod() {
    return this.request("/v1/period");
  }

  getHistoricalData(period) {
    return this.request(`/v1/historical_data${period ? `?period=${encodeURIComponent(period)}` : ""}`);
  }

  getLootHistory(seasonId) {
    return this.request(`/v1/loot_history/${encodeURIComponent(seasonId)}`);
  }
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

export function extractCharacters(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["characters", "members", "data"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  throw new WowauditError("The /v1/characters response did not contain a character list.");
}

export function normalizeCharacter(character, defaults = {}) {
  const reference = character.character_reference ?? character.characterReference ?? character.character ?? {};
  const rank = character.team_rank ?? character.teamRank ?? {};
  const realmValue = firstDefined(reference.realm, character.realm);
  const realm = typeof realmValue === "object" && realmValue !== null ? realmValue : {};

  return {
    id: firstDefined(character.id, reference.id),
    name: firstDefined(character.name, reference.name, "Unknown"),
    realm: firstDefined(
      typeof realmValue === "string" ? realmValue : undefined,
      realm.name,
      realm.slug,
      reference.realm_name,
      character.realm_name,
      defaults.realm,
      "Unknown",
    ),
    region: firstDefined(realm.region, reference.region, character.region, defaults.region, "Unknown"),
    class: firstDefined(reference.class_name, reference.class, character.class_name, character.class, "Unknown"),
    role: firstDefined(character.role, reference.role, "Unknown"),
    rank: firstDefined(rank.name, character.rank, character.team_rank_name, "Unknown"),
    isAlt: Boolean(firstDefined(rank.for_alts, character.is_alt, character.isAlt, false)),
    raw: character,
  };
}

export function summarizeTeam(team) {
  const guild = team.guild ?? {};
  const realm = guild.realm ?? team.realm ?? {};
  const urlMatch = team.url?.match(/\/guild\/([^/]+)\/([^/]+)\//u);
  return {
    team: firstDefined(team.name, team.team_name, team.slug, "Unknown"),
    guild: firstDefined(guild.name, team.guild_name, "Unknown"),
    realm: firstDefined(realm.name, realm.slug, team.realm_name, urlMatch?.[2], "Unknown"),
    region: firstDefined(realm.region, team.region, urlMatch?.[1]?.toUpperCase(), "Unknown"),
  };
}
