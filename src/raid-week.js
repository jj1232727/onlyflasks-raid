// The raid week boundary. Everything weekly — vault choices, crest income,
// catalyst charges, and droptimizer sims — is only valid for the week it was
// captured in, so one shared definition of "when did the week roll over".
//
// NA weekly reset is Tuesday 15:00 UTC (8am PT / 11am ET). EU realms roll over
// Wednesday 07:00 UTC; change these two constants if the guild moves regions.
export const RESET_UTC_DAY = 2; // 0 = Sunday
export const RESET_UTC_HOUR = 15;

export function lastWeeklyReset(now = new Date()) {
  const reset = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), RESET_UTC_HOUR, 0, 0, 0),
  );
  reset.setUTCDate(reset.getUTCDate() - ((reset.getUTCDay() - RESET_UTC_DAY + 7) % 7));
  if (reset > now) reset.setUTCDate(reset.getUTCDate() - 7);
  return reset;
}

export function nextWeeklyReset(now = new Date()) {
  const next = new Date(lastWeeklyReset(now));
  next.setUTCDate(next.getUTCDate() + 7);
  return next;
}

// True when a timestamp belongs to a previous raid week. Missing or unparseable
// timestamps are NOT treated as expired — absence of evidence is handled by the
// caller, which usually wants to say "never captured" instead.
export function isBeforeReset(iso, now = new Date()) {
  const parsed = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(parsed) && parsed < lastWeeklyReset(now).getTime();
}

// Every droptimizer timestamp WoWAudit reports, newest first.
export function simTimestamps(sims, characterId) {
  const stamps = [];
  for (const character of sims?.characters || []) {
    if (characterId !== undefined && +character.id !== +characterId) continue;
    for (const instance of character.instances || [])
      for (const entry of instance.difficulties || [])
        for (const value of Object.values(entry.wishlist?.updated_at || {}))
          if (value) stamps.push(value);
  }
  return stamps.sort((a, b) => Date.parse(b) - Date.parse(a));
}

// Per-character sim state: has it been run, and was it run this week?
export function simStatus(sims, now = new Date()) {
  let current = 0, expired = 0, never = 0, newest = null;
  for (const character of sims?.characters || []) {
    const stamps = simTimestamps(sims, character.id);
    if (!stamps.length) { never++; continue; }
    if (!newest || Date.parse(stamps[0]) > Date.parse(newest)) newest = stamps[0];
    if (isBeforeReset(stamps[0], now)) expired++;
    else current++;
  }
  return { current, expired, never, newest };
}
