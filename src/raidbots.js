export function raidbotsReportId(value) {
  const input = String(value || "").trim();
  if (!input) throw new Error("Raidbots report URL or ID is required.");

  if (/^[A-Za-z0-9_-]{8,80}$/u.test(input)) return input;

  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Enter a valid Raidbots report URL or report ID.");
  }
  if (!/(^|\.)raidbots\.com$/iu.test(url.hostname))
    throw new Error("The report URL must be hosted on raidbots.com.");
  const match = url.pathname.match(/\/simbot\/report\/([A-Za-z0-9_-]{8,80})(?:\/|$)/u);
  if (!match) throw new Error("This is not a Raidbots simulation report URL.");
  return match[1];
}
