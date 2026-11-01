/**
 * Reading the fiscal day state from a Virtual Device GetStatus reply, and classifying close failures.
 * Pure functions, no I/O, so the rules can be tested without a device.
 *
 * Healthy reply:  { Code: "1", FiscalDayNo, Data: { fiscalDayStatus, lastReceiptGlobalNo, ... } }
 * CloseFailed:    { Code: "0", Message: "{\"fiscalDayStatus\":\"FiscalDayCloseFailed\",\"fiscalDayClosingErrorCode\":...}" }
 * The second shape still describes a device that answered. Treating it as "unreachable" hides the real state.
 */

export type FiscalDayStatusName =
  | "FiscalDayClosed"
  | "FiscalDayOpened"
  | "FiscalDayCloseInitiated"
  | "FiscalDayCloseFailed"
  | "";

export type CloseErrorCode =
  | "BadCertificateSignature"
  | "MissingReceipts"
  | "ReceiptsWithValidationErrors"
  | "CountersMismatch"
  | "Unknown";

export interface ParsedDayStatus {
  /** The device answered with a readable fiscal day state. */
  ok: boolean;
  status: FiscalDayStatusName;
  closingErrorCode?: CloseErrorCode;
  lastFiscalDayNo: number | null;
  lastReceiptGlobalNo: number | null;
  /** Fiscal day number to use for upload backlog queries (envelope FiscalDayNo, else lastFiscalDayNo). */
  fiscalDayNo: number | null;
  message?: string;
}

const KNOWN: FiscalDayStatusName[] = [
  "FiscalDayClosed",
  "FiscalDayOpened",
  "FiscalDayCloseInitiated",
  "FiscalDayCloseFailed",
];

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function tryJson(s: unknown): Record<string, unknown> | null {
  if (typeof s !== "string") return null;
  const start = s.indexOf("{");
  if (start < 0) return null;
  try {
    return asRecord(JSON.parse(s.slice(start)));
  } catch {
    return null;
  }
}

export function normaliseCloseError(v: unknown): CloseErrorCode | undefined {
  if (typeof v !== "string" || !v) return undefined;
  const t = v.replace(/\s+/g, "").toLowerCase();
  if (t.includes("badcertificatesignature")) return "BadCertificateSignature";
  if (t.includes("missingreceipt")) return "MissingReceipts";
  if (t.includes("validationerror")) return "ReceiptsWithValidationErrors";
  if (t.includes("countersmismatch") || t.includes("countermismatch")) return "CountersMismatch";
  return "Unknown";
}

/** Read the fiscal day state out of either reply shape. */
export function parseDayStatus(json: Record<string, unknown> | null | undefined): ParsedDayStatus {
  const none: ParsedDayStatus = {
    ok: false,
    status: "",
    lastFiscalDayNo: null,
    lastReceiptGlobalNo: null,
    fiscalDayNo: null,
  };
  if (!json) return none;

  const data = asRecord(json["Data"] ?? json["data"]);
  const fromMessage = tryJson(json["Message"] ?? json["message"]);
  const src = data && (data["fiscalDayStatus"] ?? data["FiscalDayStatus"]) ? data : fromMessage ?? data ?? json;

  const raw = String(src["fiscalDayStatus"] ?? src["FiscalDayStatus"] ?? json["fiscalDayStatus"] ?? "");
  const status = (KNOWN as string[]).includes(raw) ? (raw as FiscalDayStatusName) : "";
  if (!status) {
    const msg = json["Message"] ?? json["message"];
    return { ...none, message: typeof msg === "string" ? msg : undefined };
  }

  const last = num(src["lastFiscalDayNo"]);
  return {
    ok: true,
    status,
    closingErrorCode: normaliseCloseError(src["fiscalDayClosingErrorCode"]),
    lastFiscalDayNo: last,
    lastReceiptGlobalNo: num(src["lastReceiptGlobalNo"]),
    fiscalDayNo: num(json["FiscalDayNo"] ?? json["fiscalDayNo"]) ?? last,
  };
}

/** Can the device take new receipts in this state? ZIMRA accepts them when Opened or CloseFailed only. */
export function acceptsReceipts(status: FiscalDayStatusName): boolean {
  return status === "FiscalDayOpened" || status === "FiscalDayCloseFailed";
}

/** A day that has been opened and not closed (close in progress counts as still open). */
export function isDayOpen(status: FiscalDayStatusName): boolean {
  return status !== "" && status !== "FiscalDayClosed";
}

/** Pull a close error out of a free-text close failure message. */
export function closeErrorFromMessage(message: string): CloseErrorCode | undefined {
  const m = /fiscalDayClosingErrorCode"?\s*[:=]\s*"?([A-Za-z]+)/.exec(message);
  if (m) return normaliseCloseError(m[1]);
  return normaliseCloseError(message) === "Unknown" ? undefined : normaliseCloseError(message);
}

/**
 * Close errors that retrying cannot fix. A Red receipt is permanent; only ZIMRA can close such a day.
 * The others can change when our side sends better data, so they stay retryable (with limits).
 */
export function closeErrorIsPermanent(code: CloseErrorCode | undefined): boolean {
  return code === "ReceiptsWithValidationErrors";
}

/** True when the invoice number a device reports is exactly ours (optionally with its `<deviceId>-` prefix). */
export function deviceInvoiceNoMatches(reported: string, ours: string): boolean {
  if (!reported || !ours) return false;
  if (reported === ours) return true;
  const i = reported.indexOf("-");
  return i > 0 && /^\d+$/.test(reported.slice(0, i)) && reported.slice(i + 1) === ours;
}
