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
