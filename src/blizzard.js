const REGION_CONFIG = {
  US: { oauthHost: "https://oauth.battle.net", apiHost: "https://us.api.blizzard.com", locale: "en_US" },
  EU: { oauthHost: "https://oauth.battle.net", apiHost: "https://eu.api.blizzard.com", locale: "en_GB" },
  KR: { oauthHost: "https://oauth.battle.net", apiHost: "https://kr.api.blizzard.com", locale: "ko_KR" },
  TW: { oauthHost: "https://oauth.battle.net", apiHost: "https://tw.api.blizzard.com", locale: "zh_TW" },
};

export class BlizzardError extends Error {
  constructor(message, { status, cause } = {}) {
    super(message, { cause });
    this.name = "BlizzardError";
    this.status = status;
  }
}

export function realmSlug(realm) {
  return realm
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/['’]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

export function characterSlug(name) {
  return name.toLocaleLowerCase("en-US");
}

export class BlizzardClient {
  constructor({ clientId, clientSecret, fetchImpl = fetch }) {
    if (!clientId?.trim() || !clientSecret?.trim()) {
      throw new BlizzardError("Blizzard credentials are missing from .env.");
    }
    this.clientId = clientId.trim();
    this.clientSecret = clientSecret.trim();
    this.fetch = fetchImpl;
    this.tokens = new Map();
  }

  config(region) {
    const normalized = region.toUpperCase();
    const config = REGION_CONFIG[normalized];
    if (!config) throw new BlizzardError(`Unsupported Blizzard region: ${region}`);
    return { ...config, region: normalized };
  }

  async getToken(region) {
    const config = this.config(region);
    const cached = this.tokens.get(config.region);
    if (cached && cached.expiresAt > Date.now() + 30_000) return cached.value;

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    let response;
    try {
      response = await this.fetch(`${config.oauthHost}/token`, {
        method: "POST",
        headers: {
          authorization: `Basic ${credentials}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });
    } catch (cause) {
      throw new BlizzardError(`Could not connect to Battle.net OAuth: ${cause.message}`, { cause });
    }

    if (!response.ok) {
      throw new BlizzardError(`Battle.net OAuth returned HTTP ${response.status}.`, { status: response.status });
    }
    const payload = await response.json();
    this.tokens.set(config.region, {
      value: payload.access_token,
      expiresAt: Date.now() + payload.expires_in * 1000,
    });
    return payload.access_token;
  }

  async getEquipment({ region, realm, name }) {
    const config = this.config(region);
    const token = await this.getToken(region);
    const path = `/profile/wow/character/${encodeURIComponent(realmSlug(realm))}/${encodeURIComponent(characterSlug(name))}/equipment`;
    const url = `${config.apiHost}${path}?namespace=profile-${config.region.toLowerCase()}&locale=${config.locale}`;
    let response;
    try {
      response = await this.fetch(url, {
        headers: { accept: "application/json", authorization: `Bearer ${token}` },
      });
    } catch (cause) {
      throw new BlizzardError(`Could not fetch equipment for ${name}-${realm}: ${cause.message}`, { cause });
    }
    if (!response.ok) {
      throw new BlizzardError(`Equipment request for ${name}-${realm} returned HTTP ${response.status}.`, {
        status: response.status,
      });
    }
    return response.json();
  }
}

export function normalizeItem(item) {
  return {
    slot: item.slot?.type ?? item.slot?.name ?? "UNKNOWN",
    itemId: item.item?.id ?? item.id,
    name: item.name ?? "Unknown",
    itemLevel: item.level?.value ?? null,
    context: item.context ?? null,
    bonusList: item.bonus_list ?? [],
    quality: item.quality?.type ?? item.quality?.name ?? null,
    upgrade: item.upgrade ?? item.upgrade_level ?? null,
    enchantments: item.enchantments ?? [],
    sockets: item.sockets ?? [],
    raw: item,
  };
}

