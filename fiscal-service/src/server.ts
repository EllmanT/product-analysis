/**
 * The service's HTTP API (internal: the POS app calls it with a shared bearer token).
 *
 *   GET  /health                         no auth
 *   GET  /v1/devices                     list devices (no key material)
 *   POST /v1/devices                     add a device: { tenantId, name, certificatePem, privateKeyPem, environment? }
 *   PUT  /v1/devices/:id/certificate     replace the certificate: { certificatePem, privateKeyPem }
 *   POST /v1/devices/:id/active          { active: boolean }
 *   GET  /v1/devices/:id/status          live GetStatus from ZIMRA
 *
 *   POST /v1/devices/:id/receipts        fiscalise a receipt (SubmitRequest without tenantId); idempotent on invoiceNo
 *   GET  /v1/devices/:id/receipts/:invoiceNo
 *   POST /v1/devices/:id/day/open        open the fiscal day
 *   POST /v1/devices/:id/day/close       close it (guarded; see DeviceEngine.closeDay)
 *   GET  /v1/devices/:id/day-counters    the open day's running counters (null when no day is open)
 *   GET  /v1/devices/:id/engine          the engine's own view: unsent, flagged, paused, closing
 *   POST /v1/devices/:id/resume          resume a paused device
 *   PUT  /v1/devices/:id/schedule        { enabled, openTime, closeTime, timezone, weekdays }
 *   GET  /v1/alerts[?unacknowledged=1]   durable alerts, one per device + kind + day with a counter
 *   POST /v1/alerts/:id/ack              { by? } acknowledge an alert
 */
import type { Transport } from "./core/transport.js";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";

import { gatewayClient } from "./devices/gateway-verifier.js";
import { DeviceRegistry, RegistryError } from "./devices/registry.js";
import type { AlertStore } from "./engine/alerts.js";
import type { EngineManager } from "./engine/manager.js";
import type { SubmitRequest } from "./engine/types.js";

const MAX_BODY = 256 * 1024;

export interface ServerDeps {
  registry: DeviceRegistry;
  /** Runs the engines. Without it only the device-management routes exist. */
  manager?: EngineManager;
  /** Durable alerts (GET /v1/alerts). */
  alerts?: AlertStore;
  /** Shared secret the POS app presents as `Authorization: Bearer <token>`. */
  token: string;
  /** Overrides the ZIMRA host (tests). */
  gatewayBaseUrl?: string;
  /** Overrides the transport for GetStatus (tests, where the fake gateway speaks plain HTTP). */
  statusTransport?: () => Transport;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(text);
}

function authorised(req: IncomingMessage, token: string): boolean {
  const h = req.headers["authorization"] ?? "";
  const given = Buffer.from(typeof h === "string" ? h : "");
  const want = Buffer.from(`Bearer ${token}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY) throw new RegistryError("Request too large", 413);
    chunks.push(c as Buffer);
  }
  if (!chunks.length) return {};
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw new RegistryError("Body must be a JSON object", 400);
}

const str = (v: unknown, field: string): string => {
  if (typeof v !== "string" || !v.trim()) throw new RegistryError(`${field} is required`, 400);
  return v;
};

export function createApp(deps: ServerDeps): Server {
  if (!deps.token || deps.token.length < 16) throw new Error("The service token must be at least 16 characters");

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://x");
      const path = url.pathname.replace(/\/+$/, "") || "/";
      if (req.method === "GET" && path === "/health") return send(res, 200, { ok: true });
      if (!authorised(req, deps.token)) return send(res, 401, { success: false, message: "Unauthorised" });

      if (deps.alerts && req.method === "GET" && path === "/v1/alerts") {
        const data = await deps.alerts.list({ unacknowledgedOnly: ["1", "true"].includes(url.searchParams.get("unacknowledged") ?? "") });
        return send(res, 200, { success: true, data });
      }
      const ack = /^\/v1\/alerts\/([a-f0-9]{24})\/ack$/.exec(path);
      if (deps.alerts && ack && req.method === "POST") {
        const b = await readJson(req);
        const ok = await deps.alerts.acknowledge(ack[1]!, typeof b["by"] === "string" && b["by"] ? b["by"].slice(0, 120) : "app");
        return ok ? send(res, 200, { success: true }) : send(res, 404, { success: false, message: "No such open alert" });
      }
      if (req.method === "GET" && path === "/v1/devices") {
        return send(res, 200, { success: true, data: await deps.registry.list(url.searchParams.get("tenantId") ?? undefined) });
      }
      if (req.method === "POST" && path === "/v1/devices") {
        const b = await readJson(req);
        const device = await deps.registry.add({
          tenantId: str(b["tenantId"], "tenantId"),
          name: str(b["name"], "name"),
          certificatePem: str(b["certificatePem"], "certificatePem"),
          privateKeyPem: str(b["privateKeyPem"], "privateKeyPem"),
          environment: b["environment"] === "production" ? "production" : "test",
        });
        return send(res, 201, { success: true, data: device });
      }
      const m = /^\/v1\/devices\/([a-f0-9]{24})(?:\/(certificate|active|status))?$/.exec(path);
      const e = /^\/v1\/devices\/([a-f0-9]{24})\/(receipts|day\/open|day\/close|day-counters|engine|resume|schedule)(?:\/(.+))?$/.exec(path);
      if (e) {
        if (!deps.manager) return send(res, 404, { success: false, message: "Not found" });
        const id = e[1]!;
        const what = e[2]!;
        if (what === "schedule" && req.method === "PUT") {
          const b = await readJson(req);
          const weekdays = Array.isArray(b["weekdays"]) ? (b["weekdays"] as unknown[]).filter((x): x is number => Number.isInteger(x) && (x as number) >= 1 && (x as number) <= 7) : [];
          return send(res, 200, { success: true, data: await deps.registry.setSchedule(id, { enabled: b["enabled"] === true, openTime: str(b["openTime"], "openTime"), closeTime: str(b["closeTime"], "closeTime"), timezone: str(b["timezone"], "timezone"), weekdays }) });
        }
        const engine = await deps.manager.get(id);
        if (what === "receipts" && req.method === "POST" && !e[3]) {
          const b = await readJson(req);
          const { tenantId } = await deps.registry.engineConfig(id);
          const result = await engine.submit({ ...(b as unknown as SubmitRequest), tenantId });
          return send(res, result.status === "rejected" ? 422 : 200, { success: result.status !== "rejected", data: result });
        }
        if (what === "receipts" && req.method === "GET" && e[3]) {
          const { tenantId } = await deps.registry.engineConfig(id);
          const r = await engine.getReceipt(tenantId, decodeURIComponent(e[3]));
          return r ? send(res, 200, { success: true, data: r }) : send(res, 404, { success: false, message: "No such receipt" });
        }
        if (what === "day/open" && req.method === "POST") return send(res, 200, { success: true, data: await engine.openDay() });
        if (what === "day/close" && req.method === "POST") {
          const r = await engine.closeDay();
          return send(res, r.ok ? 200 : 409, { success: r.ok, data: r });
        }
        if (what === "day-counters" && req.method === "GET") return send(res, 200, { success: true, data: engine.dayCounters() });
        if (what === "engine" && req.method === "GET") return send(res, 200, { success: true, data: await engine.status() });
        if (what === "resume" && req.method === "POST") {
          await engine.resume();
          return send(res, 200, { success: true, data: await engine.status() });
        }
        return send(res, 404, { success: false, message: "Not found" });
      }
      if (m) {
        const id = m[1]!;
        if (req.method === "GET" && !m[2]) {
          const d = await deps.registry.get(id);
          return d ? send(res, 200, { success: true, data: d }) : send(res, 404, { success: false, message: "Device not found" });
        }
        if (req.method === "PUT" && m[2] === "certificate") {
          const b = await readJson(req);
          const updated = await deps.registry.replaceCertificate(id, str(b["certificatePem"], "certificatePem"), str(b["privateKeyPem"], "privateKeyPem"));
          await deps.manager?.release(id); // the engine restarts with the new certificate on its next use
          return send(res, 200, { success: true, data: updated });
        }
        if (req.method === "POST" && m[2] === "active") {
          const b = await readJson(req);
          if (typeof b["active"] !== "boolean") throw new RegistryError("active must be true or false", 400);
          const updated = await deps.registry.setActive(id, b["active"]);
          if (!b["active"]) await deps.manager?.release(id);
          return send(res, 200, { success: true, data: updated });
        }
        if (req.method === "GET" && m[2] === "status") {
          const ident = await deps.registry.identity(id);
          const status = await gatewayClient(ident, deps.gatewayBaseUrl, deps.statusTransport?.()).request<Record<string, unknown>>("GET", `/Device/v1/${ident.deviceId}/GetStatus`);
          return send(res, 200, { success: true, data: status });
        }
      }
      return send(res, 404, { success: false, message: "Not found" });
    } catch (e) {
      if (e instanceof RegistryError) return send(res, e.status, { success: false, message: e.message });
      // Never echo internals (paths, key material) to the caller.
      console.error("request failed:", e instanceof Error ? e.message : String(e));
      return send(res, 500, { success: false, message: "Internal error" });
    }
  });
}
