/**
 * Client for the separate fiscal-service (fiscal-service/). The service owns receipt numbering, strict send order,
 * retries after outages and lost replies, and the guarded fiscal day close; the app only hands it sales.
 * Switched by FISCAL_BACKEND (legacy | service); legacy stays the default so nothing changes until it is set.
 */
import logger from "@/lib/logger";

export function fiscalBackend(): "legacy" | "service" {
  return process.env.FISCAL_BACKEND?.trim().toLowerCase() === "service" ? "service" : "legacy";
}

/** The service could not be reached or answered in an unusable way. Nothing is known about the receipt. */
export class FiscalServiceUnavailable extends Error {}

export interface ServiceReceiptRequest {
  invoiceNo: string;
  receiptType?: "FiscalInvoice" | "CreditNote";
  currency: string;
  taxInclusive?: boolean;
  lines: { name: string; unitPrice: string; quantity: number | string; taxPercent: number | null; hsCode?: string }[];
  payments: { moneyType: string; amount: string }[];
  buyer?: Record<string, unknown>;
  notes?: string;
  original?: { invoiceNo: string };
  meta?: { branchId?: string; tillId?: string; saleId?: string };
}

export interface ServiceReceiptResult {
  invoiceNo: string;
  status: "fiscalised" | "queued" | "rejected";
  receiptGlobalNo?: number;
  receiptCounter?: number;
  fiscalDayNo?: number;
  deviceId?: number;
  deviceSerialNumber?: string;
  receiptDate?: string;
  qrData?: string;
  verificationCode?: string;
  receiptId?: number;
  colour?: "none" | "yellow" | "gray" | "red";
  problems?: { code: string; message: string }[];
  reason?: string;
}

function config(): { url: string; token: string } {
  const url = process.env.FISCAL_SERVICE_URL?.trim().replace(/\/$/, "");
  const token = process.env.FISCAL_SERVICE_TOKEN?.trim();
  if (!url || !token) throw new FiscalServiceUnavailable("FISCAL_SERVICE_URL and FISCAL_SERVICE_TOKEN are not set");
  return { url, token };
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown, timeoutMs = 20_000): Promise<{ status: number; json: { success?: boolean; data?: T; message?: string } }> {
  const { url, token } = config();
  let res: Response;
  try {
    res = await fetch(`${url}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (e) {
    throw new FiscalServiceUnavailable(e instanceof Error ? e.message : String(e));
  }
  let json: { success?: boolean; data?: T; message?: string };
  try {
    json = await res.json();
  } catch {
    throw new FiscalServiceUnavailable(`Fiscal service answered HTTP ${res.status} with an unreadable body`);
  }
  if (res.status >= 500 || res.status === 401 || res.status === 403) {
    logger.warn({ path, status: res.status }, "Fiscal service refused or failed");
    throw new FiscalServiceUnavailable(json.message || `Fiscal service HTTP ${res.status}`);
  }
  return { status: res.status, json };
}

/** Idempotent on invoiceNo: sending the same sale again returns the first result, never a second receipt. */
export async function submitReceipt(serviceDeviceId: string, req: ServiceReceiptRequest): Promise<ServiceReceiptResult> {
  const { json } = await call<ServiceReceiptResult>("POST", `/v1/devices/${serviceDeviceId}/receipts`, req);
  if (!json.data) throw new FiscalServiceUnavailable(json.message || "Fiscal service returned no result");
  return json.data;
}

/** The current state of a receipt the service already holds (queued ones become fiscalised once delivered). */
export async function getReceipt(serviceDeviceId: string, invoiceNo: string): Promise<ServiceReceiptResult | null> {
  const { status, json } = await call<ServiceReceiptResult>("GET", `/v1/devices/${serviceDeviceId}/receipts/${encodeURIComponent(invoiceNo)}`, undefined, 10_000);
  if (status === 404) return null;
  return json.data ?? null;
}

export interface ServiceEngineStatus {
  dayOpen: boolean;
  fiscalDayNo?: number;
  unsent: number;
  accepted: number;
  red: number;
  gray: number;
  paused?: string;
  closing: boolean;
  lastError?: string;
}

export async function engineStatus(serviceDeviceId: string): Promise<ServiceEngineStatus> {
  const { json } = await call<ServiceEngineStatus>("GET", `/v1/devices/${serviceDeviceId}/engine`, undefined, 10_000);
  if (!json.data) throw new FiscalServiceUnavailable(json.message || "No status");
  return json.data;
}

export async function openDay(serviceDeviceId: string) {
  const { json } = await call<{ fiscalDayNo: number; adopted: boolean }>("POST", `/v1/devices/${serviceDeviceId}/day/open`, {}, 60_000);
  return json;
}

/** Guarded close: the service drains, verifies and recovers; `success` false carries the reason. */
export async function closeDay(serviceDeviceId: string) {
  const { json } = await call<Record<string, unknown>>("POST", `/v1/devices/${serviceDeviceId}/day/close`, {}, 300_000);
  return json;
}

export interface ServiceAlert {
  id: string;
  deviceKey: string;
  kind: string;
  message: string;
  day: string;
  count: number;
  firstAt: string;
  lastAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
}

/** Alerts the service has recorded (one per device + kind + day with a counter). */
export async function listAlerts(unacknowledgedOnly = true): Promise<ServiceAlert[]> {
  const { json } = await call<ServiceAlert[]>("GET", `/v1/alerts${unacknowledgedOnly ? "?unacknowledged=1" : ""}`, undefined, 10_000);
  return json.data ?? [];
}

export async function acknowledgeAlert(id: string, by: string): Promise<boolean> {
  const { status } = await call("POST", `/v1/alerts/${encodeURIComponent(id)}/ack`, { by }, 10_000);
  return status === 200;
}

export interface ServiceDayCounters {
  fiscalDayNo: number;
  fiscalDayDate: string;
  receiptCounter: number;
  receiptGlobalNo: number;
  counters: { fiscalCounterType: string; fiscalCounterCurrency: string; fiscalCounterTaxID?: number; fiscalCounterMoneyType?: string; fiscalCounterValue: number }[];
}

/** The service's running counters for the open day, or null when no day is open. */
export async function dayCounters(serviceDeviceId: string): Promise<ServiceDayCounters | null> {
  const { json } = await call<ServiceDayCounters | null>("GET", `/v1/devices/${serviceDeviceId}/day-counters`, undefined, 10_000);
  return json.data ?? null;
}
