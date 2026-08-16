import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadEnv } from "../src/env.js";
import {
  extractCharacters,
  normalizeCharacter,
  summarizeTeam,
  WowauditClient,
  WowauditError,
} from "../src/wowaudit.js";

const { values } = parseArgs({
  options: {
    json: { type: "boolean", default: false },
    out: { type: "string", short: "o" },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help) {
  console.log(`Usage: npm run roster -- [options]

Options:
  --json          Print the complete normalized snapshot as JSON
  --out, -o PATH  Save the snapshot to PATH
  --help, -h      Show this help`);
  process.exit(0);
}

await loadEnv();

try {
  const client = new WowauditClient({
    apiKey: process.env.WOWAUDIT_API_KEY,
    baseUrl: process.env.WOWAUDIT_BASE_URL,
  });

  const [teamPayload, characterPayload] = await Promise.all([
    client.getTeam(),
    client.getCharacters(),
  ]);

  const team = summarizeTeam(teamPayload);
  const characters = extractCharacters(characterPayload).map((character) => normalizeCharacter(character, team));
  const snapshot = {
    fetchedAt: new Date().toISOString(),
    team,
    characterCount: characters.length,
    characters,
  };

  if (values.out) {
    const outputPath = resolve(values.out);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    console.log(`Saved ${characters.length} characters to ${outputPath}`);
  }

  if (values.json) {
    console.log(JSON.stringify(snapshot, null, 2));
  } else if (!values.out) {
    console.log(`${team.guild} — ${team.team} (${team.region}-${team.realm})`);
    console.log(`${characters.length} tracked characters\n`);
    console.table(
      characters.map(({ id, name, realm, region, class: className, role, rank, isAlt }) => ({
        id,
        name,
        realm,
        region,
        class: className,
        role,
        rank,
        type: isAlt ? "Alt" : "Main",
      })),
    );
  }
} catch (error) {
  const message = error instanceof WowauditError ? error.message : `Unexpected error: ${error.message}`;
  console.error(message);
  process.exitCode = 1;
}
