/** How a device's reading becomes the badge on the Fiscal day and Fiscal devices pages. Run: npx tsx scripts/test-day-overview.ts */
import assert from "node:assert/strict";

import { dayStateOf } from "@/lib/fiscal/dayState";

assert.equal(dayStateOf(true, { reachable: true, dayStatus: "FiscalDayOpened" }), "open");
assert.equal(dayStateOf(false, { reachable: true, dayStatus: "FiscalDayClosed" }), "closed");
assert.equal(dayStateOf(true, { reachable: true, dayStatus: "FiscalDayCloseFailed" }), "close_failed");
assert.equal(dayStateOf(true, { reachable: false }), "unreachable", "an unreachable device is never reported as open");
assert.equal(dayStateOf(false, undefined), "unreachable");
assert.equal(dayStateOf(true, { reachable: true, dayStatus: "FiscalDayOpened" }, false), "not_managed", "a day the service did not open is not plain open");
assert.equal(dayStateOf(true, { reachable: true, dayStatus: "FiscalDayOpened" }, null), "open", "unknown engine state does not downgrade a day");
console.log("ok: day overview states");
