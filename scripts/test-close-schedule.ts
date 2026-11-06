/**
 * The "is a scheduled fiscal close owed?" rule. Pure logic, no database or device.
 * Run: npx tsx scripts/test-close-schedule.ts
 */
import assert from "node:assert/strict";

// The service module imports the database layer, which wants a URI at import time. This test never connects.
process.env.MONGODB_URI ||= "mongodb://127.0.0.1:1/unused";
process.env.OFFLINE_MONGODB_URI ||= "mongodb://127.0.0.1:1/unused";
process.env.MONGO_DB_NAME ||= "unused";

async function main() {
  const { closeDue, shouldAttemptClose } = await import("@/lib/services/fiscalSchedule.service");
  const tz = "Africa/Harare"; // UTC+2 all year
  const at = (iso: string) => new Date(iso); // times below are UTC; Harare is two hours ahead
  const ALL = [1, 2, 3, 4, 5, 6, 7];
  let n = 0;
  const ok = (name: string, fn: () => void) => {
    fn();
    n++;
    console.log("ok  ", name);
  };

  ok("before the close time and yesterday is recorded: nothing owed", () => {
    // 2026-11-10 20:00 Harare, close at 23:00, yesterday's close recorded
    assert.equal(closeDue(at("2026-11-10T18:00:00Z"), { tz, closeTime: "23:00", weekdays: ALL, lastAutoCloseDate: "2026-11-09" }), null);
  });

  ok("at the close time: owed for today, 0 minutes in", () => {
    const d = closeDue(at("2026-11-10T21:00:00Z"), { tz, closeTime: "23:00", weekdays: ALL, lastAutoCloseDate: "2026-11-09" });
    assert.deepEqual(d, { dueDate: "2026-11-10", minutesSince: 0 });
  });

  ok("recorded for today: nothing owed any more", () => {
    assert.equal(closeDue(at("2026-11-10T21:30:00Z"), { tz, closeTime: "23:00", weekdays: ALL, lastAutoCloseDate: "2026-11-10" }), null);
  });

  ok("a 23:00 close is still owed after midnight (the old rule gave up here)", () => {
    // 2026-11-11 01:30 Harare: 2h30 after yesterday's 23:00 close, never recorded
    const d = closeDue(at("2026-11-10T23:30:00Z"), { tz, closeTime: "23:00", weekdays: ALL, lastAutoCloseDate: "2026-11-09" });
    assert.deepEqual(d, { dueDate: "2026-11-10", minutesSince: 150 });
  });

  ok("still owed late the next morning, with the minutes counted from the close time", () => {
    // 2026-11-11 10:00 Harare
    const d = closeDue(at("2026-11-11T08:00:00Z"), { tz, closeTime: "23:00", weekdays: ALL, lastAutoCloseDate: "2026-11-09" });
    assert.deepEqual(d, { dueDate: "2026-11-10", minutesSince: 11 * 60 });
  });

  ok("once recorded for yesterday, today's close is not owed until its time", () => {
    assert.equal(closeDue(at("2026-11-11T08:00:00Z"), { tz, closeTime: "23:00", weekdays: ALL, lastAutoCloseDate: "2026-11-10" }), null);
  });

  ok("a missed close from days ago is still owed", () => {
    const d = closeDue(at("2026-11-13T08:00:00Z"), { tz, closeTime: "00:00", weekdays: ALL, lastAutoCloseDate: "2026-11-09" });
    assert.equal(d?.dueDate, "2026-11-13");
  });

  ok("a day that is not a close weekday owes nothing", () => {
    // 2026-11-14 is a Saturday (6); only Mon to Fri close
    assert.equal(closeDue(at("2026-11-14T12:00:00Z"), { tz, closeTime: "18:00", weekdays: [1, 2, 3, 4, 5], lastAutoCloseDate: "2026-11-13" }), null);
  });

  ok("after midnight the weekday of the DUE day decides, not today's", () => {
    // Saturday 2026-11-14 01:00 Harare, close 23:00: the close owed is Friday's (a close day)
    const d = closeDue(at("2026-11-13T23:00:00Z"), { tz, closeTime: "23:00", weekdays: [1, 2, 3, 4, 5], lastAutoCloseDate: "2026-11-12" });
    assert.equal(d?.dueDate, "2026-11-13");
    // Sunday 2026-11-15 01:00 Harare: the owed close is Saturday's, which is not a close day
    assert.equal(closeDue(at("2026-11-14T23:00:00Z"), { tz, closeTime: "23:00", weekdays: [1, 2, 3, 4, 5], lastAutoCloseDate: "2026-11-13" }), null);
  });

  ok("attempts: every minute while fresh, then every ten minutes", () => {
    assert.equal(shouldAttemptClose(0, 7), true);
    assert.equal(shouldAttemptClose(299, 3), true);
    assert.equal(shouldAttemptClose(300, 3), true);
    assert.equal(shouldAttemptClose(301, 3), false);
    assert.equal(shouldAttemptClose(301, 10), true);
    assert.equal(shouldAttemptClose(5000, 40), true);
    assert.equal(shouldAttemptClose(5000, 41), false);
  });

  console.log(`\n${n} checks passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
