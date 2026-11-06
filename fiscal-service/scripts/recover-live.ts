/**
 * Live check of stale-day recovery against the ZIMRA TEST gateway, with the real scheduler and engine.
 *
 *   npx tsx scripts/recover-live.ts "<certificates root>" <deviceId> [--yes] [--keep-open]
 *
 * It registers the device in a throw-away database, makes sure a fiscal day is open (opening one and selling a
 * receipt if not), then treats that day as stale (recoverAfterHrs near zero) and lets the real Scheduler:
 *   close the old day  ->  open a new one  ->  and a receipt is sold in the new day.
 * Finally it closes that day again so the device is left clean (unless --keep-open).
 * Without --yes it only reads the device's state. Never use a production device.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { MongoClient } from "mongodb";

import { createGatewayVerifier } from "../src/devices/gateway-verifier.js";
import { DeviceRegistry } from "../src/devices/registry.js";
import { EngineManager } from "../src/engine/manager.js";
import { Scheduler } from "../src/engine/scheduler.js";
import { SecretBox } from "../src/security/secret-box.js";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
const [root, idArg] = args;
const yes = flags.includes("--yes");
const keepOpen = flags.includes("--keep-open");
if (!root || !idArg) {
  console.error('Usage: npx tsx scripts/recover-live.ts "<certificates root>" <deviceId> [--yes] [--keep-open]');
  process.exit(2);
}

const dir = join(root, `certificates_${idArg}`);
const certificatePem = readFileSync(join(dir, "cert.crt"), "utf-8");
const privateKeyPem = readFileSync(join(dir, "key.key"), "utf-8");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const say = (s: string) => console.log(s);
const tag = Date.now().toString(36).toUpperCase();
const sale = (n: number) => ({
  tenantId: "live-recovery",
  invoiceNo: `REC-${tag}-${n}`,
  currency: "USD",
  lines: [{ name: "Consulting services", unitPrice: "115.00", quantity: 1, taxPercent: 15.5, hsCode: "99001000" }],
  payments: [{ moneyType: "Cash" as const, amount: "115.00" }],
});

const client = await new MongoClient(process.env.FISCAL_TEST_MONGODB_URI || "mongodb://localhost:27017/", { serverSelectionTimeoutMS: 4000 }).connect();
const db = client.db(`fiscal_recover_live_${randomBytes(4).toString("hex")}`);
let exitCode = 0;
try {
  const registry = new DeviceRegistry(db, new SecretBox({ FISCAL_ENCRYPTION_KEY: randomBytes(32).toString("base64") }), createGatewayVerifier());
  await registry.init();
  const dev = await registry.add({ tenantId: "live-recovery", name: `Live recovery ${idArg}`, certificatePem, privateKeyPem, environment: "test" });
  say(`Registered device ${dev.deviceId} (certificate valid ${dev.certDaysLeft} more days).`);

  const manager = new EngineManager({ db, registry, alert: (a) => say(`  [alert] ${a.kind}: ${a.message}`) });
  const engine = await manager.get(dev.id);
  let st = await engine.status();
  say(`State: day ${st.fiscalDayNo ?? "-"} ${st.dayOpen ? "OPEN" : "closed"}, unsent ${st.unsent}, red ${st.red}, gray ${st.gray}.`);
  if (!yes) {
    say("Read-only. Add --yes to run the recovery.");
  } else {
    await registry.setSchedule(dev.id, { enabled: true, openTime: "00:00", closeTime: "23:59", timezone: "Africa/Harare", weekdays: [] });

    if (!st.dayOpen) {
      const r = await engine.openDay();
      say(`No day was open: opened day ${r.fiscalDayNo} and selling one receipt so there is something to close.`);
      await sleep(4500);
      const s1 = await engine.submit(sale(1));
      say(`  receipt: ${s1.status}${s1.problems?.length ? ` ${JSON.stringify(s1.problems)}` : ""}`);
      st = await engine.status();
    }
    const oldDay = st.fiscalDayNo;

    say(`\nTreating day ${oldDay} as stale and running the real scheduler...`);
    const scheduler = new Scheduler({ registry, manager, recoverAfterHrs: 0.0001, retryEveryMs: 500 });
    let events: Awaited<ReturnType<typeof scheduler.tick>> = [];
    for (let i = 0; i < 6; i++) {
      events = events.concat(await scheduler.tick());
      st = await engine.status();
      if (st.dayOpen && st.fiscalDayNo !== oldDay) break;
      await sleep(1500);
    }
    for (const e of events) say(`  ${e.ok ? "ok  " : "FAIL"} [${e.step}] ${e.message}`);

    if (!(st.dayOpen && st.fiscalDayNo !== oldDay)) {
      say(`\nRESULT: day ${oldDay} was NOT replaced (now: day ${st.fiscalDayNo} ${st.dayOpen ? "open" : "closed"}). See the events above.`);
      exitCode = 1;
    } else {
      say(`\nOld day ${oldDay} closed, new day ${st.fiscalDayNo} opened. Selling in the new day...`);
      await sleep(4500);
      const s2 = await engine.submit(sale(2));
      say(`  receipt in the new day: ${s2.status}${s2.problems?.length ? ` ${JSON.stringify(s2.problems)}` : ""}`);
      if (s2.status !== "fiscalised") exitCode = 1;
      st = await engine.status();
      say(`  unsent ${st.unsent}, red ${st.red}, gray ${st.gray}`);
      if (!keepOpen) {
        const c = await engine.closeDay();
        say(`Closing the new day to leave the device clean: ${c.ok ? "closed" : `NOT closed (${c.reason}: ${c.message})`}`);
        if (!c.ok) exitCode = 1;
      }
      say(exitCode === 0 ? "\nRESULT: PASS" : "\nRESULT: see problems above");
    }
  }
  await manager.shutdown();
} catch (e) {
  console.error(e);
  exitCode = 1;
} finally {
  await db.dropDatabase().catch(() => undefined);
  await client.close();
}
process.exit(exitCode);
