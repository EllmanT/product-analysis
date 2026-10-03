import type { IPosFiscal, PosPaymentMethod } from "@/database/posSale.model";
import { getZimraContext } from "@/lib/services/zimraFiscal.service";
import { getFdmsAuthorizationHeader } from "@/lib/zimraFdmsAuth";
import { zimraRequest } from "@/lib/zimraHttp";
import logger from "@/lib/logger";

/** A POS sale can wait this long for the device (6 branches at once queue ~7 s on the test device). */
const POS_TIMEOUT_MS = 30_000;
const STATUS_TIMEOUT_MS = 8_000;

export interface PosReceiptInput {
  /** Our number, e.g. HU0001. The device stores it as `${deviceId}-${number}`. */
  invoiceNumber: string;
  currency: string;
  totalAmount: number;
  totalVat: number;
  taxInclusive: boolean;
  paymentMethod: PosPaymentMethod;
  notes?: string;
  /** Credit note: the original receipt on the device. Quantities and totals on the lines are negative. */
  creditNote?: { refDeviceId: string; refReceiptGlobalNo: string; refFiscalDay: string };
  buyer?: {
    registerName?: string;
    tradeName?: string;
    tin?: string;
    vatNumber?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
  };
  lines: {
    lineNo: number;
    description: string;
    hsCode?: string;
    quantity: number;
    unitPrice: number;
    lineTotalIncl: number;
    lineTotalExcl: number;
    taxCode: string;
    taxPercent: number;
  }[];
}

/**
 * ok          device returned a signed receipt
 * rejected    device answered and refused (kind of refusal in `reason`)
 * not_sent    we could not reach the device, so the receipt definitely was not recorded
 * unknown     the request may have reached the device (timeout, reset, unreadable reply)
 */
export type PosDeviceOutcome =
  | { kind: "ok"; fiscal: IPosFiscal }
  | { kind: "rejected"; reason: "duplicate" | "day_closed" | "validation" | "other"; message: string }
  | { kind: "not_sent"; message: string }
  | { kind: "unknown"; message: string };

export function buildPosReceiptPayload(input: PosReceiptInput): Record<string, unknown> {
  const b = input.buyer ?? {};
  return {
    receiptType: input.creditNote ? "CreditNote" : "FiscalInvoice",
    receiptCurrency: input.currency,
    invoiceNo: input.invoiceNumber,
    referenceNumber: "",
    invoiceAmount: input.totalAmount,
    invoiceTaxAmount: input.totalVat,
    receiptNotes: input.notes?.trim() ? input.notes.trim() : "N/A",
    receiptLinesTaxInclusive: input.taxInclusive,
    moneyTypeCode: input.paymentMethod,
    receiptPrintForm: "Receipt48",
    buyerRegisterName: b.registerName ?? "",
    buyerTradeName: b.tradeName || b.registerName || "",
    vatNumber: b.vatNumber ?? "",
    buyerTIN: b.tin ?? "",
    buyerPhoneNo: b.phone ?? "",
    buyerEmail: b.email ?? "",
    buyerProvince: "",
    buyerStreet: b.address ?? "",
    buyerHouseNo: "",
    buyerCity: b.city ?? "",
    ...(input.creditNote
      ? {
          refDeviceID: input.creditNote.refDeviceId,
          refReceiptGlobalnumber: input.creditNote.refReceiptGlobalNo,
          refFiscalDay: input.creditNote.refFiscalDay,
        }
      : {}),
    receiptLines: input.lines.map((l) => ({
      receiptLineType: "Sale",
      receiptLineNo: l.lineNo,
      receiptLineHSCode: l.hsCode || (process.env.INVOICE_DEFAULT_HS_CODE ?? "00000000"),
      receiptLineName: l.description,
      receiptLinePrice: l.unitPrice,
      receiptLineQuantity: l.quantity,
      // The device checks: invoiceAmount == sum of line totals, per line qty x price.
      receiptLineTotal: input.taxInclusive ? l.lineTotalIncl : l.lineTotalExcl,
      taxCode: l.taxCode,
      taxPercent: l.taxPercent,
    })),
  };
}

const NOT_SENT_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "ENETUNREACH", "EAI_AGAIN"]);

function classifyTransportError(e: unknown): "not_sent" | "unknown" {
  const code = (e as { code?: string } | null)?.code;
  return code && NOT_SENT_CODES.has(code) ? "not_sent" : "unknown";
}

function classifyRejection(message: string): "duplicate" | "day_closed" | "validation" | "other" {
  if (/already exist/i.test(message)) return "duplicate";
  if (/fiscal\s*day.*(closed|not\s*open)|day\s*(is\s*)?closed|FiscalDayClosed|open the fiscal day/i.test(message)) {
    return "day_closed";
  }
  if (/RCPT\d+|invalid|must (equal|be)|is required|not valid|mismatch/i.test(message)) return "validation";
  return "other";
}

async function deviceRequest(
  path: string,
  method: "GET" | "POST",
  body: Record<string, unknown> | undefined,
  timeoutMs: number
): Promise<{ statusCode: number; json: Record<string, unknown> | null; raw: string }> {
  const ctx = await getZimraContext();
  const headers: Record<string, string> = { Accept: "*/*" };
  const auth = await getFdmsAuthorizationHeader(ctx.base);
  if (auth) headers["Authorization"] = auth;
  let payload: string | undefined;
  if (method === "POST") {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body ?? {});
  }
  const { statusCode, rawBody } = await zimraRequest(
    `${ctx.base}${path}`,
    { method, headers, body: payload },
    ctx.tls,
    timeoutMs
  );
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    json = null;
  }
  return { statusCode, json, raw: rawBody };
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

/** Map the device envelope (SubmitReceipt and GetInvoice share it) to our fiscal block. */
function mapFiscal(json: Record<string, unknown>): IPosFiscal {
  const data = (json["Data"] ?? json["data"] ?? {}) as Record<string, unknown>;
  const receipt = (data["receipt"] ?? data["Receipt"] ?? {}) as Record<string, unknown>;
  const fd = Number(json["FiscalDayNo"] ?? json["fiscalDayNo"]);
  return {
    verificationCode: str(json["VerificationCode"]),
    verificationLink: str(json["VerificationLink"]),
    qrCodeUrl: str(json["QRCode"]),
    fiscalDayNo: Number.isFinite(fd) ? fd : null,
    receiptGlobalNo: str(receipt["receiptGlobalNo"] ?? json["FDMSInvoiceNo"]),
    receiptCounter: str(receipt["receiptCounter"]),
    deviceInvoiceNo: str(receipt["invoiceNo"]),
    deviceId: str(json["DeviceID"]),
    deviceSerialNumber: str(json["DeviceSerialNumber"]),
    receiptDate: str(receipt["receiptDate"]),
    rawResponse: json,
  };
}

function isCodeOne(json: Record<string, unknown>): boolean {
  return str(json["Code"] ?? json["code"]) === "1";
}

export async function submitPosReceipt(input: PosReceiptInput): Promise<PosDeviceOutcome> {
  const body = buildPosReceiptPayload(input);
  let res: Awaited<ReturnType<typeof deviceRequest>>;
  try {
    // Credit notes go through SubmitReceiptExt, which carries the reference to the original receipt.
    const path = input.creditNote ? "/api/VirtualDevice/SubmitReceiptExt" : "/api/VirtualDevice/SubmitReceipt";
    res = await deviceRequest(path, "POST", body, POS_TIMEOUT_MS);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { kind: classifyTransportError(e), message };
  }

  if (!res.json) {
    // Reached something that answered but not in the device format (gateway error page, empty body).
    const message = `Unreadable device reply (HTTP ${res.statusCode}): ${res.raw.slice(0, 120)}`;
    return res.statusCode >= 500 || res.statusCode === 0
      ? { kind: "unknown", message }
      : { kind: "rejected", reason: "other", message };
  }

  if (isCodeOne(res.json)) {
    const fiscal = mapFiscal(res.json);
    if (!fiscal.qrCodeUrl && !fiscal.verificationCode) {
      return { kind: "unknown", message: "Device accepted the receipt but returned no QR/verification code" };
    }
    return { kind: "ok", fiscal };
  }

  const message = str(res.json["Message"] ?? res.json["message"]) || "Device rejected the receipt";
  logger.warn({ invoiceNumber: input.invoiceNumber, message }, "POS receipt rejected by device");
  return { kind: "rejected", reason: classifyRejection(message), message };
}

/**
 * Ask the device whether it already holds this invoice (recovers QR after a timeout).
 * Throws if the device cannot be reached or answers in an unexpected way.
 */
export async function getDeviceInvoice(
  invoiceNumber: string
): Promise<{ found: true; fiscal: IPosFiscal } | { found: false }> {
  const res = await deviceRequest(
    `/api/VirtualDevice/GetInvoice/${encodeURIComponent(invoiceNumber)}`,
    "GET",
    undefined,
    STATUS_TIMEOUT_MS
  );
  if (!res.json) throw new Error(`GetInvoice: unreadable reply (HTTP ${res.statusCode})`);
  if (isCodeOne(res.json)) return { found: true, fiscal: mapFiscal(res.json) };
  const message = str(res.json["Message"]);
  if (/not found/i.test(message)) return { found: false };
  throw new Error(`GetInvoice: ${message || "unexpected reply"}`);
}

export interface PosDeviceStatus {
  reachable: boolean;
  dayOpen: boolean | null;
  fiscalDayNo: number | null;
  lastReceiptGlobalNo: number | null;
  message?: string;
}

export async function getPosDeviceStatus(): Promise<PosDeviceStatus> {
  try {
    const res = await deviceRequest("/api/VirtualDevice/GetStatus", "GET", undefined, STATUS_TIMEOUT_MS);
    if (!res.json || !isCodeOne(res.json)) {
      return {
        reachable: false,
        dayOpen: null,
        fiscalDayNo: null,
        lastReceiptGlobalNo: null,
        message: res.json ? str(res.json["Message"]) : `HTTP ${res.statusCode}`,
      };
    }
    const data = (res.json["Data"] ?? {}) as Record<string, unknown>;
    const status = str(data["fiscalDayStatus"] ?? data["FiscalDayStatus"]);
    const fd = Number(res.json["FiscalDayNo"]);
    const last = Number(data["lastReceiptGlobalNo"]);
    return {
      reachable: true,
      dayOpen: status !== "" && status !== "FiscalDayClosed",
      fiscalDayNo: Number.isFinite(fd) ? fd : null,
      lastReceiptGlobalNo: Number.isFinite(last) ? last : null,
    };
  } catch (e) {
    return {
      reachable: false,
      dayOpen: null,
      fiscalDayNo: null,
      lastReceiptGlobalNo: null,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
