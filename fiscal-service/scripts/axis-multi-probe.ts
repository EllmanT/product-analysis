// Read-only: list what the Axis multi-device service reports for a stuck day (to see if counters could be rebuilt).
import { request } from "node:https";
const [id, day] = process.argv.slice(2);
const call = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
  new Promise<string>((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const r = request({ host: "140.82.25.196", port: 543, servername: "axisbay.co.zw", method, path, headers: { Host: "axisbay.co.zw", ...(payload ? { "Content-Type": "application/json" } : {}), ...headers }, timeout: 30000 }, (res) => {
      let t = ""; res.on("data", (c) => (t += c)); res.on("end", () => resolve(t));
    });
    r.on("error", reject); if (payload) r.write(payload); r.end();
  });
const login = JSON.parse(await call("POST", "/api/Auth/login", {}, { email: process.env.AXIS_MULTI_EMAIL, password: process.env.AXIS_MULTI_PASSWORD, keyName: "fiscal-service-readonly-check" }));
const out = await call("GET", `/api/VirtualDevice/GetUnProcessedInvoices/${id}/${day}?page=1&pageSize=5`, { "X-Api-Key": login.apiKey });
console.log(out.slice(0, 1500));
