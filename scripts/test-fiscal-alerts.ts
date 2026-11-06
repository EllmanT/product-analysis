/**
 * Fiscal alert delivery checks: who gets the email (all admins / selected admins / extra addresses),
 * validation of the setting, and that the poller never throws when the service or SMTP is down.
 *
 *   npm run test:fiscal-alerts
 */
import * as dotenv from "dotenv";
import http from "node:http";
import path from "node:path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
process.env.MONGO_DB_NAME = "pos_fiscal_alerts_tmp";
process.env.MONGODB_URI = process.env.OFFLINE_MONGODB_URI || "mongodb://localhost:27017/";
process.env.OFFLINE_MONGODB_URI = process.env.MONGODB_URI;
(process.env as Record<string, string>).NODE_ENV = "test";
delete process.env.FISCAL_ALERT_EMAILS;
// Never send real mail from a test: point SMTP at a dead local port so every send fails fast.
process.env.SMTP_HOST = "127.0.0.1";
process.env.SMTP_PORT = "9";
process.env.SMTP_SECURE = "false";

let failures = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${!ok && extra !== undefined ? `  -> ${JSON.stringify(extra).slice(0, 300)}` : ""}`);
};

async function main() {
  const { default: dbConnect } = await import("@/lib/mongoose");
  const mongoose = (await import("mongoose")).default;
  await dbConnect();
  await mongoose.connection.dropDatabase();
  const { default: User } = await import("@/database/user.model");
  const s = await import("@/lib/services/fiscalAlertSettings.service");

  const mk = (name: string, email: string, role: string) => User.collection.insertOne({ name, email, role, createdAt: new Date(), updatedAt: new Date() }).then((r) => String(r.insertedId));
  const a1 = await mk("Admin One", "one@example.com", "admin");
  const a2 = await mk("Admin Two", "two@example.com", "admin");
  const cashier = await mk("Cashier", "cashier@example.com", "user");

  console.log("recipients");
  check(JSON.stringify((await s.resolveFiscalAlertRecipients()).sort()) === JSON.stringify(["one@example.com", "two@example.com"]), "default: every administrator, nobody else");

  await s.saveFiscalAlertSettings({ recipientMode: "selected", userIds: [a1], extraEmails: [] });
  check(JSON.stringify(await s.resolveFiscalAlertRecipients()) === JSON.stringify(["one@example.com"]), "selected: only the chosen administrator");

  await s.saveFiscalAlertSettings({ recipientMode: "selected", userIds: [a1, cashier], extraEmails: [" Accounts@Example.com ", "accounts@example.com"] });
  const sel = await s.getFiscalAlertSettings();
  check(sel.userIds.length === 1, "a non-admin cannot be chosen as a recipient", sel);
  check(JSON.stringify((await s.resolveFiscalAlertRecipients()).sort()) === JSON.stringify(["accounts@example.com", "one@example.com"]), "extra addresses are added, trimmed, lower-cased and de-duplicated");

  let err = "";
  try { await s.saveFiscalAlertSettings({ recipientMode: "selected", userIds: [], extraEmails: [] }); } catch (e) { err = String(e); }
  check(/at least one/.test(err), "selected with nobody chosen is refused", err);
  err = "";
  try { await s.saveFiscalAlertSettings({ recipientMode: "all_admins", userIds: [], extraEmails: ["not-an-email"] }); } catch (e) { err = String(e); }
  check(/not a valid email/.test(err), "an invalid address is refused", err);

  await s.saveFiscalAlertSettings({ recipientMode: "all_admins", userIds: [], extraEmails: [] });
  process.env.FISCAL_ALERT_EMAILS = "legacy@example.com";
  check((await s.resolveFiscalAlertRecipients()).includes("legacy@example.com"), "the older FISCAL_ALERT_EMAILS variable is still honoured");
  delete process.env.FISCAL_ALERT_EMAILS;
  void a2;

  console.log("poller");
  const { pullServiceAlerts } = await import("@/lib/fiscal/serviceAlerts.service");
  process.env.FISCAL_BACKEND = "legacy";
  check(JSON.stringify(await pullServiceAlerts()) === JSON.stringify({ open: 0, emailed: 0 }), "legacy backend: nothing is polled");

  let served = 0;
  const server = http.createServer((req, res) => {
    served++;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, data: [{ id: "a".repeat(24), deviceKey: "d1", kind: "CLOSE_FAILED", message: "CountersMismatch", day: "2026-11-05", count: 2, firstAt: "2026-11-05T08:00:00Z", lastAt: "2026-11-05T08:05:00Z", acknowledgedAt: null, acknowledgedBy: null }] }));
  });
  await new Promise<void>((r) => server.listen(19421, r));
  process.env.FISCAL_BACKEND = "service";
  process.env.FISCAL_SERVICE_URL = "http://127.0.0.1:19421";
  process.env.FISCAL_SERVICE_TOKEN = "poller-test-token-0123456789";
  const r = await pullServiceAlerts();
  check(served === 1 && r.open === 1, "service backend: open alerts are read from the service", { served, r });
  check(r.emailed === 0, "SMTP unreachable in the test: the email fails quietly, nothing thrown");
  const FiscalAlert = (await import("@/database/fiscalAlert.model")).default;
  check((await FiscalAlert.countDocuments({ key: `svc:${"a".repeat(24)}` })) === 0, "a failed email releases its claim so the next run tries again");
  server.close();
  const down = await pullServiceAlerts();
  check(down.open === 0 && down.emailed === 0, "service unreachable: returns quietly");

  await mongoose.connection.dropDatabase();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
