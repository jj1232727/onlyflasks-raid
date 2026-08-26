# OnlyFlasks wishlist discovery

The production site deploys to GitHub Pages whenever `main` is updated. The
checked-in `public/loot-data.json` is the production snapshot; refresh it locally
before publishing when roster, gear, or seasonal data changes.

The first milestone is a safe, reproducible snapshot of the active WoWAudit roster.

## Setup

1. Reset any API key that has been shared publicly.
2. Copy `.env.example` to `.env`.
3. Paste the replacement WoWAudit key after `WOWAUDIT_API_KEY=`. Do not add quotes unless the key itself contains spaces.
4. Run `npm run roster`.

The script verifies the team with `GET /v1/team` and retrieves the tracked roster with `GET /v1/characters`. The key is sent only in the `Authorization: Bearer` header and is never printed.

## Where the data comes from

Nothing on the board is one source. Three layers stack, and they refresh on
different clocks - which is the whole reason a number can look wrong.

**1. `public/loot-data.json` - a committed snapshot, rebuilt every 2 hours.**
The "Refresh raid data" workflow runs `npm run audit:refresh`, commits whatever
changed, and that commit deploys itself. Everything below is fetched by a script
in `scripts/` and lands in `data/`:

| What | Source | Script |
| --- | --- | --- |
| Roster, ranks, roles | WoWAudit `GET /v1/characters` | `check-roster.js` |
| Equipped gear, item levels, tracks, enchants, gems | **Blizzard** character profile API | `check-gear.js` |
| Droptimizer results (snapshot copy) | WoWAudit `GET /v1/wishlists` | `check-wowaudit-sims.js` |
| Weekly activity, vault, M+ done | WoWAudit `GET /v1/historical_data` | `check-audit-activity.js` |
| Awarded loot | WoWAudit `GET /v1/loot_history/{season}` | `check-loot-history.js` |
| Mythic+ score, raid progress | Raider.IO character profile API | `check-raiderio.js` |
| BiS fallback lists | Icy Veins (scraped) | `import-icy-veins.js` |
| Raid boss loot tables | The `OnlyFlasksLootExport` addon - `/ofloot` in game, imported by hand | `import-raid-loot.js` |
| Loot outside the main lockout | Blizzard journal + Wowhead tooltips | `import-season-loot.js` |
| Item effects and procs | Wowhead tooltips | `enrich-raid-effects.js` |
| Icons | Blizzard media API | `enrich-*-icons.js` |

So: **sims come from WoWAudit, gear comes from Blizzard directly.** They are not
the same clock and they do not agree by construction - Blizzard's profile only
moves when the character logs out, and WoWAudit only holds a sim once someone
has actually run and uploaded one.

**2. The Google Sheet, via Apps Script - read fresh on every page load.**
Everything raiders and officers type: wishlists, roster priority, chosen loot
specs, `/simc` snapshots (bags, vault, crests, catalyst), QE Live healer reports,
the QE queue, and in-flight Raidbots sims. `google-apps-script/Code.gs` serves it
from one `doGet`, cached 30 seconds on its side.

**3. WoWAudit, live, on every page load.** The board POSTs `getWowauditSims`
and overwrites the snapshotted sims from layer 1 with the current ones. This is
deliberate - loot is handed out on sim numbers, so they are never served from a
cache. If that call fails the board says so in a banner rather than quietly
falling back to the committed copy.

Raidbots and QE Live are written to, not read from: a `/simc` paste submits three
droptimizers to Raidbots and uploads the finished reports into WoWAudit, which is
where the board reads them back from. Healers go to QE Live the same way.

The footer of every view - and the top of Loot decisions - shows how old each
layer is.

## Commands

- `npm run roster` — display the roster as a table.
- `npm run roster:json` — print a JSON snapshot.
- `npm run roster:save` — save a git-ignored snapshot to `data/roster.json`.
- `npm run gear:save` — retrieve equipped gear from Blizzard for the saved roster.
- `npm run gear:tracks` — resolve exact upgrade tracks from Blizzard bonus IDs.
- `npm run gear:report` — build a private, self-contained visual report at `report/gear.html`.
- `npm run wishlist:report` — build the interactive one-wishlist-per-character prototype.

Reviewed Icy Veins fallback lists live in `data/bis/icy-veins-midnight-s2.json`. The UI never treats an absent or stale list as a valid fallback.

`npm run raid:board` builds the raid-leader boss/item/candidate view. The `OnlyFlasksLootExport` addon exports the authoritative live Encounter Journal catalog with `/ofloot`.
- `npm test` — run local tests without contacting WoWAudit.
