import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  CircleAlert,
  ClipboardCheck,
  HeartPulse,
  History,
  RefreshCw,
  Shield,
  Sparkles,
  Swords,
  TrendingUp,
} from "lucide-react";
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
type Boss = { name: string; items: Item[] };
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
const norm = (s?: string) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
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
const slot = (s?: string) => {
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
  if (
    /weapon|mainhand|onehand|twohand|sword|axe|mace|staff|dagger|polearm|bow|gun|crossbow|warglaive/.test(
      x,
    )
  )
    return "MAIN_HAND";
  return "";
};
const equipped = (c: Raider, item: Item) =>
  c.equipment
    .filter((i) => {
      const w = slot(item.slot);
      return w === "FINGER"
        ? i.slot.startsWith("FINGER")
        : w === "TRINKET"
          ? i.slot.startsWith("TRINKET")
          : i.slot === w;
    })
    .sort((a, b) => (b.itemLevel || 0) - (a.itemLevel || 0))[0];
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
function auditRaider(c: Raider) {
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
    wowhead = `item=${item.itemId}${bonus ? `&bonus=${bonus}` : ""}`;
  return (
    <a
      className="item-art"
      href={`https://www.wowhead.com/item=${item.itemId}${bonus ? `?bonus=${bonus}` : ""}`}
      data-wowhead={wowhead}
      target="_blank"
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
function simFor(
  data: Data,
  c: Raider,
  item: Item,
  boss: Boss,
  selectedDifficulty: Difficulty,
) {
  const root = data.sims?.characters || [],
    entry = root.find((x: any) => +x.id === +c.id),
    instance = entry?.instances?.find((x: any) => +x.id === 80),
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
  return null;
}
export default function App() {
  const [data, setData] = useState<Data | null>(null),
    [bossIndex, setBoss] = useState(0),
    [difficulty, setDifficulty] = useState<Difficulty>(
      () =>
        (localStorage.getItem("onlyflasks-difficulty") as Difficulty) ||
        "mythic",
    ),
    [view, setView] = useState<
      "overview" | "plan" | "decisions" | "audit" | "history" | "wishlist"
    >("overview"),
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
    >("idle");
  useEffect(() => {
    fetch("./loot-data.json", { cache: "no-store" })
      .then((r) => r.json())
      .then(setData);
  }, []);
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
      expected = levels[difficulty][bossIndex],
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
          const cur = equipped(c, item);
          if (targetSatisfiedAtTrack(data, c, target, targetTrack)) return [];
          return [
            {
              c,
              cur,
              target,
              sim: simFor(data, c, item, boss, difficulty),
              ilvl: cur
                ? Math.max(0, expected - (cur.itemLevel || 0))
                : expected,
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
        const expected = levels[difficulty][bossIndex],
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
              const cur = equipped(c, item);
              if (targetSatisfiedAtTrack(data, c, target, targetTrack))
                return [];
              return [
                {
                  c,
                  cur,
                  sim: simFor(data, c, item, boss, difficulty),
                  ilvl: cur
                    ? Math.max(0, expected - (cur.itemLevel || 0))
                    : expected,
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
            ["MAIN_HAND", "OFF_HAND"].includes(slot(item.slot));
          return highImpact && people.length > 1
            ? [{ boss, bossIndex, item, people, expected }]
            : [];
        });
      })
      .sort((a, b) => b.people.length - a.people.length)
      .slice(0, 12);
  }, [data, specs, difficulty, rosterStatuses, customWishlists]);
  if (!data) return <div className="loading">Loading the raid board…</div>;
  const boss = data.raid.bosses[bossIndex],
    claims = model.reduce((n, x) => n + x.people.length, 0),
    activityById = new Map(
      (data.auditActivity?.characters || []).map((x: any) => [+x.id, x.data]),
    ),
    raiderById = new Map(
      (data.raiderio?.characters || []).map((x: any) => [+x.id, x]),
    ),
    audits = data.characters
      .map(auditRaider)
      .sort(
        (a, b) =>
          b.critical - a.critical ||
          b.issues.length - a.issues.length ||
          a.c.name.localeCompare(b.c.name),
      ),
    actionCount = audits.filter((x) => x.issues.length).length,
    tierStatus = data.characters
      .map((c) => {
        const list = wishlistFor(c),
          tierSlots = ["HEAD", "SHOULDER", "CHEST", "HANDS", "LEGS"],
          slots = tierSlots.flatMap((slotName) => {
            const target = list.find((t) => slot(t.slot) === slotName);
            if (!target) return [];
            const exact = c.equipment.some(
                (item) => +item.itemId === +target.itemId,
              ),
              base = Boolean(
                target.catalyst &&
                  target.sourceItemId &&
                  c.equipment.some(
                    (item) =>
                      +item.itemId === Number(target.sourceItemId),
                  ),
              );
            return [
              {
                slot: slotName,
                target,
                state: exact ? "equipped" : base ? "ready" : "missing",
              },
            ];
          }),
          equippedCount = slots.filter((x) => x.state === "equipped").length,
          readyCount = slots.filter((x) => x.state === "ready").length,
          missingCount = slots.filter((x) => x.state === "missing").length;
        return { c, slots, equippedCount, readyCount, missingCount };
      })
      .sort(
        (a, b) =>
          b.equippedCount - a.equippedCount ||
          b.readyCount - a.readyCount ||
          a.c.name.localeCompare(b.c.name),
      ),
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
        const targets = wishlistFor(c).flatMap((target) => {
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
            trackName = norm(current?.track);
          const state = !current
            ? "missing"
            : trackName.includes("myth")
              ? "myth"
              : trackName.includes("hero")
                ? "hero"
                : "champion";
          return [
            {
              target,
              source,
              inRaid,
              current: current || equipped(c, target),
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
          championCount = targets.filter((x) => x.state === "champion").length;
        return { c, targets, exactCount, mythCount, heroCount, championCount };
      })
      .sort(
        (a, b) =>
          priorityValue(a.c, rosterStatuses) -
            priorityValue(b.c, rosterStatuses) ||
          a.c.name.localeCompare(b.c.name),
      ),
    bossAnalytics = data.raid.bosses
      .map((raidBoss, bossOrder) => {
        const targetTrackOrder =
            difficulty === "mythic" ? 3 : difficulty === "heroic" ? 2 : 1,
          expected = levels[difficulty][bossOrder];
        const claims = weeklyOverview.flatMap((row) =>
            row.targets
              .filter(
                (x) =>
                  x.inRaid &&
                  x.source.raidBoss.name === raidBoss.name &&
                  !x.catalystReady,
              )
              .flatMap((x) => {
                const currentTrack = norm(x.current?.track),
                  currentTrackOrder = currentTrack.includes("myth")
                    ? 3
                    : currentTrack.includes("hero")
                      ? 2
                      : currentTrack.includes("champion")
                        ? 1
                        : 0,
                  sim = simFor(
                    data,
                    row.c,
                    x.source.item,
                    raidBoss,
                    difficulty,
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
          raiders = [...new Map(claims.map((x) => [x.c.id, x.c])).values()],
          missing = claims.filter((x) => !x.exact || x.suboptimal),
          trackUpgrades = claims.filter((x) => x.trackUpgrade),
          simulated = claims.filter((x) => x.sim !== null && x.sim > 0),
          totalSim = simulated.reduce((sum, x) => sum + (x.sim || 0), 0),
          maxSim = simulated.reduce((max, x) => Math.max(max, x.sim || 0), 0),
          impact = claims.filter((x) =>
            ["TRINKET", "MAIN_HAND", "OFF_HAND"].includes(slot(x.target.slot)),
          ),
          tier = claims.filter((x) => x.source.item.tierToken),
          tierPlayers = new Set(tier.map((x) => x.c.id)).size,
          score =
            missing.length * 2 +
            trackUpgrades.length * 1.5 +
            impact.length * 2 +
            tier.length * 3 +
            totalSim * 2;
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
      );
  return (
    <>
      <header>
        <div className="shell mast">
          <div>
            <p className="rune">OnlyFlasks · Loot Council</p>
            <h1>The Venomous Abyss</h1>
            <p className="muted">Sim-first decisions with gear context</p>
          </div>
          <div className="app-tabs">
            <button
              className={view === "overview" ? "active" : ""}
              onClick={() => setView("overview")}
            >
              <TrendingUp /> Weekly overview
            </button>
            <button
              className={view === "plan" ? "active" : ""}
              onClick={() => setView("plan")}
            >
              <Sparkles /> Tonight's plan <b>{tonight.length}</b>
            </button>
            <button
              className={view === "audit" ? "active" : ""}
              onClick={() => setView("audit")}
            >
              <ClipboardCheck />
              Raid audit <b>{actionCount}</b>
            </button>
            <button
              className={view === "decisions" ? "active" : ""}
              onClick={() => setView("decisions")}
            >
              <Swords />
              Loot decisions
            </button>
            <button
              className={view === "history" ? "active" : ""}
              onClick={() => setView("history")}
            >
              <History />
              Loot history <b>{data.lootHistory?.history_items?.length || 0}</b>
            </button>
            <button
              className={view === "wishlist" ? "active" : ""}
              onClick={() => setView("wishlist")}
            >
              <Sparkles /> My wishlist
            </button>
          </div>
          <div className="summary">
            <strong>{model.filter((x) => x.people.length).length}</strong>
            <span>priority drops</span>
            <strong>{claims}</strong>
            <span>claims</span>
          </div>
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
              <span className="missing">
                <b>!</b> Missing BiS
              </span>
              <small>
                <b className="exact-mark">✓</b> Optimal BiS stats{" "}
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
                      <i />
                      <span>
                        <b>{row.c.name}</b>
                        <small>
                          {row.exactCount}/{row.targets.length} BiS ·{" "}
                          <em className="myth-text">{row.mythCount}M</em>{" "}
                          <em className="hero-text">{row.heroCount}H</em>{" "}
                          <em className="champion-text">
                            {row.championCount}C
                          </em>
                        </small>
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
                                const track = current?.track
                                    ? `${current.track} ${current.trackRank || ""}`.trim()
                                    : "No item detected in this slot",
                                  actualStats = (current?.secondaryStats || [])
                                    .map(
                                      (stat) =>
                                        `+${stat.value} ${stat.type.replace(/_RATING$/u, "").replace("CRIT", "Critical Strike").replaceAll("_", " ").toLowerCase()}`,
                                    )
                                    .join(" · "),
                                  detail =
                                    state === "missing"
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
                                      target="_blank"
                                      title={`BIS TARGET\n${target.name}\n${target.crafted ? "Crafted stats are selected with missives\n" : ""}${detail}\nSource: ${source.raidBoss.name}`}
                                    >
                                      <img
                                        src={target.icon || source.item.icon}
                                      />
                                      <em>
                                        {state === "missing"
                                          ? "!"
                                          : state === "myth"
                                            ? "M"
                                            : state === "hero"
                                              ? "H"
                                              : "C"}
                                      </em>
                                      {(exact || catalystReady) && (
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
                                        target="_blank"
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
            <div className="boss-value-head embedded">
              <div>
                <p className="rune">Time allocation</p>
                <h2>Boss value by difficulty</h2>
                <p>
                  Equal or higher-track slots are excluded unless a verified sim
                  still shows an upgrade.
                </p>
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
            <div className="value-method">
              <b>Ranking considers</b>
              <span>
                Missing BiS, eligible track upgrades, verified sim gains,
                weapons/trinkets, and tier-set completion.
              </span>
            </div>
            <div className="boss-value-table">
              <div className="boss-value-columns">
                <span>#</span>
                <span>Boss</span>
                <span>Players with an upgrade</span>
                <span>Missing BiS</span>
                <span>Track upgrades</span>
                <span>Sim-backed gains</span>
                <span>Weapons / trinkets</span>
                <span>Tier-set upgrades</span>
              </div>
              {bossAnalytics.map((row, index) => (
                <details className="boss-value-entry" key={row.raidBoss.name}>
                  <summary className="boss-value-row">
                    <strong className="value-rank">{index + 1}</strong>
                    <div className="value-boss">
                      <b>
                        {row.raidBoss.name}
                        <ChevronDown />
                      </b>
                      <small>
                        {row.claims.length
                          ? "Open to see players and items"
                          : "No upgrades at this difficulty"}
                      </small>
                    </div>
                    <strong>
                      {row.raiders.length}
                      <small> players</small>
                    </strong>
                    <strong>{row.missing.length}</strong>
                    <strong>{row.trackUpgrades.length}</strong>
                    <strong className={row.maxSim > 0 ? "sim-value" : ""}>
                      {row.maxSim > 0 ? `+${row.maxSim.toFixed(2)}% max` : "—"}
                      <small>
                        {row.simulated.length
                          ? `${row.simulated.length} verified`
                          : " no sim gains"}
                      </small>
                    </strong>
                    <strong className={row.impact.length ? "impact" : ""}>
                      {row.impact.length}
                    </strong>
                    <strong className={row.tierPlayers ? "tier" : ""}>
                      {row.tierPlayers}
                      <small>
                        {row.tierPlayers === 1 ? " player" : " players"}
                      </small>
                    </strong>
                  </summary>
                  {row.claims.length > 0 && (
                    <div className="boss-beneficiaries">
                      {[...row.claims]
                        .sort(
                          (a, b) =>
                            (b.sim || 0) - (a.sim || 0) ||
                            b.ilvlGain - a.ilvlGain ||
                            priorityValue(a.c, rosterStatuses) -
                              priorityValue(b.c, rosterStatuses),
                        )
                        .map((claim, claimIndex) => {
                          const currentTrack =
                              claim.current?.track || "No track",
                            reasons = [
                              !claim.exact
                                ? "Missing BiS"
                                : claim.suboptimal
                                  ? "Suboptimal catalyst stats"
                                  : "",
                              claim.trackUpgrade
                                ? `${currentTrack} → ${tracks[difficulty]}`
                                : "",
                              ["TRINKET", "MAIN_HAND", "OFF_HAND"].includes(
                                slot(claim.target.slot),
                              )
                                ? "High-impact slot"
                                : "",
                              claim.source.item.tierToken
                                ? "Tier-set upgrade"
                                : "",
                            ].filter(Boolean),
                            ilvlGain = Math.max(0, claim.ilvlGain);
                          return (
                            <div
                              className="boss-beneficiary"
                              key={`${claim.c.id}-${claim.target.itemId}-${claimIndex}`}
                              style={
                                {
                                  "--class": colors[claim.c.class],
                                } as React.CSSProperties
                              }
                            >
                              <i />
                              <span>
                                <b>{claim.c.name}</b>
                                <small>{inferredRole(claim.c)}</small>
                              </span>
                              <WowItem item={claim.target} size={30} />
                              <div>
                                <strong>{claim.target.name}</strong>
                                <small>{reasons.join(" · ")}</small>
                              </div>
                              <div className="gain-badges">
                                <b className="ilvl">
                                  {ilvlGain > 0
                                    ? `+${ilvlGain} ilvl`
                                    : "No ilvl gain"}
                                </b>
                                <b
                                  className={
                                    claim.sim !== null && claim.sim > 0
                                      ? "sim"
                                      : "muted"
                                  }
                                >
                                  {claim.sim !== null && claim.sim > 0
                                    ? `+${claim.sim.toFixed(2)}% sim`
                                    : "No verified sim"}
                                </b>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </details>
              ))}
            </div>
            <p className="value-footnote">
              A low score means little loot value at the selected difficulty;
              progression requirements can still make the boss mandatory.
            </p>
          </section>
        )}
        {view === "plan" && (
          <section className="plan-page">
            <div className="plan-head">
              <div>
                <p className="rune">Pre-raid briefing</p>
                <h2>Contested loot & tier breakpoints</h2>
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
                        <i />
                        <span>
                          <b>{c.name}</b>
                          <small>
                            {inferredRole(c)} · {c.class}
                          </small>
                        </span>
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
            <section className="tier-board">
              <div className="plan-section-title">
                <div>
                  <p className="rune">Set completion</p>
                  <h3>Tier set status</h3>
                </div>
                <span>
                  Equipped tier vs catalyst-ready bases · catalyst charges unknown
                </span>
              </div>
              <div className="tier-grid">
                {tierStatus.map(
                  ({ c, slots, equippedCount, readyCount, missingCount }) => (
                  <div
                    className={`tier-person ${equippedCount === slots.length ? "tier-complete" : ""}`}
                    key={c.id}
                    style={
                      { "--class": colors[c.class] } as React.CSSProperties
                    }
                  >
                    <i />
                    <div className="tier-copy">
                      <div className="tier-name">
                        <strong>{c.name}</strong>
                        <b>{equippedCount}/{slots.length} TIER</b>
                      </div>
                      {(readyCount > 0 || missingCount > 0) && (
                        <div className="tier-slots">
                          {slots.filter((x) => x.state !== "equipped").map(({ slot: slotName, target, state }) => (
                            <a
                              key={slotName}
                              className={state}
                              href={`https://www.wowhead.com/item=${target.itemId}`}
                              data-wowhead={`item=${target.itemId}`}
                              title={target.name}
                              target="_blank"
                            >
                              {state === "ready" ? "↻ " : "! "}{slotName[0] + slotName.slice(1).toLowerCase()}{state === "ready" ? " ready" : ""}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
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
                    <WowItem item={item} size={48} />
                    <div className="plan-drop">
                      <strong>{item.name}</strong>
                      <div className="plan-meta">
                        <span
                          className={
                            slot(item.slot) === "TRINKET"
                              ? "type trinket"
                              : "type weapon"
                          }
                        >
                          {slot(item.slot) === "TRINKET" ? "TRINKET" : "WEAPON"}
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
                    <div className="contenders">
                      {people.slice(0, 4).map((p, rank) => {
                        const status =
                            rosterStatuses[p.c.id] ||
                            p.c.rosterStatus ||
                            "Main",
                          role = inferredRole(p.c),
                          label =
                            status === "Main" ? role : `${status} ${role}`;
                        return (
                          <div
                            className="contender"
                            key={p.c.id}
                            style={
                              {
                                "--class": colors[p.c.class],
                              } as React.CSSProperties
                            }
                          >
                            <b>{rank + 1}</b>
                            <span>
                              <strong>{p.c.name}</strong>
                              <small>
                                {p.sim !== null
                                  ? `+${p.sim.toFixed(2)}% sim`
                                  : `+${p.ilvl} ilvl`}
                              </small>
                            </span>
                            <em
                              className={`role-priority ${status.toLowerCase()} ${role.toLowerCase()}`}
                            >
                              {label}
                            </em>
                          </div>
                        );
                      })}
                      {people.length > 4 && <em>+{people.length - 4}</em>}
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
            const save = (items: Item[]) => {
              const next = { ...customWishlists, [c.id]: items };
              setCustomWishlists(next);
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
                setSyncState("saved");
                setTimeout(() => setSyncState("idle"), 2500);
              } catch (error) {
                console.error(error);
                setSyncState("error");
              }
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
                    className={
                      customWishlists[c.id] ? "custom-list" : "fallback-list"
                    }
                  >
                    {customWishlists[c.id]
                      ? "CUSTOM ACTIVE"
                      : "ICY VEINS DEFAULT"}
                  </span>
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
                        onChange={(e) => setWishlistCharacter(+e.target.value)}
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
                      }}
                    >
                      {classSpecs.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <button onClick={() => save([...baseline])}>
                    Customize Icy Veins list
                  </button>
                  <button
                    className="reset-list"
                    disabled={!customWishlists[c.id]}
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
                    Reset to Icy Veins
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
                          ? "Submitted ✓"
                          : syncState === "error"
                            ? "Retry submission"
                            : "Submit wishlist"}
                  </button>
                </div>
                <div className="wishlist-notice">
                  <strong>Loot-spec locked</strong>
                  <span>
                    Only {c.class} items valid for {selectedSpec} are available.
                    Catalyst choices preserve their raid source; crafted choices
                    never enter boss-drop priority.
                  </span>
                </div>
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
                            .find((i) => +i.itemId === +target.sourceItemId)
                        : null,
                      seasonSource = target.sourceItemId
                        ? data.seasonLoot?.items.find(
                            (i) => +i.itemId === +target.sourceItemId,
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
                            disabled={!customWishlists[c.id]}
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
                            disabled={!customWishlists[c.id]}
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
                <p className="rune">Boss {bossIndex + 1}</p>
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
                          target="_blank"
                        >
                          {item.name}
                        </a>
                        <p>
                          {item.slot} <i /> {difficulty}{" "}
                          {levels[difficulty][bossIndex]} · {tracks[difficulty]}{" "}
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
                          <span>Upgrade evidence</span>
                          <span>Source</span>
                        </div>
                        {people.map(({ c, cur, target, sim, ilvl }, rank) => (
                          <div
                            className="candidate"
                            style={
                              {
                                "--class": colors[c.class],
                              } as React.CSSProperties
                            }
                            key={c.id}
                          >
                            <div className="rank">{rank + 1}</div>
                            <div className="player">
                              <strong>
                                {c.name}{" "}
                                {(() => {
                                  const status =
                                      rosterStatuses[c.id] ||
                                      c.rosterStatus ||
                                      "Main",
                                    role = inferredRole(c),
                                    label =
                                      status === "Main"
                                        ? role
                                        : `${status} ${role}`;
                                  return (
                                    <em
                                      className={`role-priority ${status.toLowerCase()} ${role.toLowerCase()}`}
                                    >
                                      {label}
                                    </em>
                                  );
                                })()}
                              </strong>
                              <span>{specs[c.id] || c.defaultSpec}</span>
                            </div>
                            <div className="current-card">
                              {cur && <WowItem item={cur} size={36} />}
                              <div className="current-copy">
                                <small>CURRENTLY EQUIPPED</small>
                                <a
                                  href={
                                    cur
                                      ? `https://www.wowhead.com/item=${cur.itemId}`
                                      : "#"
                                  }
                                  data-wowhead={
                                    cur ? `item=${cur.itemId}` : undefined
                                  }
                                >
                                  {cur?.name || "Nothing detected"}
                                </a>
                                <span className="gear-meta">
                                  {cur
                                    ? `${cur.itemLevel} · ${cur.track || "track unverified"} ${cur.trackRank || ""}`
                                    : "No equipped slot match"}
                                </span>
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
                                    target="_blank"
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
                    <span>
                      <b>{c.name}</b>
                      <small>{c.class}</small>
                    </span>
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
                        <div className="history-player">
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
                  M0 count and unlocked Dungeon/Delve vault item levels ·
                  refreshed{" "}
                  {data.auditActivity?.fetchedAt
                    ? new Date(data.auditActivity.fetchedAt).toLocaleString()
                    : "unknown"}
                  .
                </span>
              </div>
            </div>
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
                        <i />
                        <div>
                          <strong>{c.name}</strong>
                          <span>
                            {c.class} · {specs[c.id] || c.defaultSpec}
                          </span>
                        </div>
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
          <RefreshCw /> Data is generated from the latest local WoWAudit,
          Blizzard, and Icy Veins refresh.
        </footer>
      </main>
    </>
  );
}
