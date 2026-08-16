import { readFile } from "node:fs/promises";

function unquote(value) {
  if (value.length < 2) return value;
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.at(-1) === quote) {
    return value.slice(1, -1);
  }
  return value;
}

export async function loadEnv(path = ".env") {
  let contents;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator < 1) continue;

    const key = line.slice(0, separator).trim();
    const value = unquote(line.slice(separator + 1).trim());
    if (/^[A-Z_][A-Z0-9_]*$/iu.test(key) && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

