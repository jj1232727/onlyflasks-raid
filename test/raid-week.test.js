import test from "node:test";
import assert from "node:assert/strict";
import { isBeforeReset, lastWeeklyReset, nextWeeklyReset, simStatus, simTimestamps } from "../src/raid-week.js";

const at = (iso) => new Date(iso);

test("reset lands on the most recent Tuesday 15:00 UTC", () => {
  for (const [now, expected] of [
    ["2026-08-16T20:32:00Z", "2026-08-11T15:00:00.000Z"], // Sunday
    ["2026-08-18T14:59:00Z", "2026-08-11T15:00:00.000Z"], // Tuesday, one minute early
    ["2026-08-18T15:00:00Z", "2026-08-18T15:00:00.000Z"], // exactly on it
    ["2026-08-18T15:01:00Z", "2026-08-18T15:00:00.000Z"], // Tuesday, just after
    ["2026-08-19T03:00:00Z", "2026-08-18T15:00:00.000Z"], // Wednesday
    ["2026-08-11T16:00:00Z", "2026-08-11T15:00:00.000Z"],
  ]) assert.equal(lastWeeklyReset(at(now)).toISOString(), expected, `from ${now}`);
});

test("reset is never in the future and always exactly a week before the next", () => {
  for (let hour = 0; hour < 24 * 15; hour += 7) {
    const now = new Date(Date.UTC(2026, 7, 1) + hour * 3600000),
      previous = lastWeeklyReset(now);
    assert.ok(previous <= now, `${previous.toISOString()} should not follow ${now.toISOString()}`);
    assert.equal(previous.getUTCDay(), 2, "always a Tuesday");
    assert.equal(nextWeeklyReset(now).getTime() - previous.getTime(), 7 * 24 * 3600000);
  }
});

test("a sim from last week is expired, one from after reset is not", () => {
  const now = at("2026-08-19T03:00:00Z"); // Wednesday, reset was Tuesday 15:00
  assert.equal(isBeforeReset("2026-08-18T14:00:00Z", now), true, "ran before reset");
  assert.equal(isBeforeReset("2026-08-18T16:00:00Z", now), false, "ran after reset");
  assert.equal(isBeforeReset("2026-08-12T09:00:00Z", now), true, "last week");
});

test("missing timestamps are not reported as expired", () => {
  assert.equal(isBeforeReset(undefined), false);
  assert.equal(isBeforeReset(null), false);
  assert.equal(isBeforeReset(""), false);
  assert.equal(isBeforeReset("not a date"), false);
});

const sims = {
  characters: [
    { id: 1, instances: [{ difficulties: [{ wishlist: { updated_at: { Fury: "2026-08-18T18:00:00Z" } } }] }] },
    { id: 2, instances: [{ difficulties: [{ wishlist: { updated_at: { Arcane: "2026-08-14T18:00:00Z" } } }] }] },
    { id: 3, instances: [{ difficulties: [{ wishlist: { updated_at: {} } }] }] },
  ],
};

test("timestamps come back newest first and can be filtered per character", () => {
  assert.deepEqual(simTimestamps(sims, 2), ["2026-08-14T18:00:00Z"]);
  assert.equal(simTimestamps(sims).length, 2);
  assert.equal(simTimestamps(sims)[0], "2026-08-18T18:00:00Z");
  assert.deepEqual(simTimestamps(undefined), []);
});

test("sim status splits the roster into current, expired and never simmed", () => {
  const status = simStatus(sims, at("2026-08-19T03:00:00Z"));
  assert.equal(status.current, 1, "the Wednesday sim survived reset");
  assert.equal(status.expired, 1, "the previous-week sim expired");
  assert.equal(status.never, 1);
  assert.equal(status.newest, "2026-08-18T18:00:00Z");
});
