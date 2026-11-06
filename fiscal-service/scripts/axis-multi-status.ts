/**
 * Read-only: ask the Axis multi-device Virtual Device service (https://axisbay.co.zw:543) which of our test
 * devices it holds and what state their fiscal day is in. Calls GetStatus only. Logging in creates one API key
 * on that service (named below), so this uses a single login per run.
 *
 *   AXIS_MULTI_EMAIL=... AXIS_MULTI_PASSWORD=... npx tsx scripts/axis-multi-status.ts 28892 29234 ...
 */
import { request } from "node:https";

const HOST = "axisbay.co.zw";
const IP = "140.82.25.196"; // the name may not resolve everywhere; the certificate is for the name
const email = process.env.AXIS_MULTI_EMAIL;
const password = process.env.AXIS_MULTI_PASSWORD;
if (!email || !password) {
  console.error("Set AXIS_MULTI_EMAIL and AXIS_MULTI_PASSWORD");
  process.exit(2);
}

function call(method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<{ status: number; json: Record<string, unknown> | null }> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const r = request(
      { host: IP, port: 543, servername: HOST, method, path, headers: { Host: HOST, Accept: "application/json", ...(payload ? { "Content-Type": "application/json" } : {}), ...headers }, timeout: 30_000 },
      (res) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () => {
          let json: Record<string, unknown> | null = null;
          try {
            json = JSON.parse(text) as Record<string, unknown>;
          } catch {
            /* not json */
          }
          resolve({ status: res.statusCode ?? 0, json });
        });
      }
    );
    r.on("error", reject);
    r.on("timeout", () => r.destroy(new Error("timeout")));
    if (payload) r.write(payload);
    r.end();
  });
}

const login = await call("POST", "/api/Auth/login", {}, { email, password, keyName: "fiscal-service-readonly-check" });
const apiKey = String(login.json?.["apiKey"] ?? "");
if (!apiKey) {
  console.error("Login failed", login.status);
  process.exit(1);
}
for (const id of process.argv.slice(2)) {
  const r = await call("GET", `/api/VirtualDevice/GetStatus/${id}`, { "X-Api-Key": apiKey });
  const msg = String(r.json?.["Message"] ?? "");
  let state = msg;
  try {
    const data = r.json?.["Data"];
    const inner = (data && typeof data === "object" ? data : JSON.parse(msg)) as Record<string, unknown>;
    state = `${inner["fiscalDayStatus"]} day ${inner["lastFiscalDayNo"]} lastGlobalNo ${inner["lastReceiptGlobalNo"]} ${inner["fiscalDayClosingErrorCode"] ?? ""}`;
  } catch {
    /* plain message */
  }
  console.log(`${id}: ${state.slice(0, 200)}`);
}
