import type { IInvoice } from "@/database/invoice.model";
import {
  buildTlsFromDoc,
  getFiscalSettingsDoc,
  resolveZimraBaseUrl,
} from "@/lib/services/fiscalSettings.service";
import { getFdmsAuthorizationHeader } from "@/lib/zimraFdmsAuth";
import { zimraRequest, type ZimraTlsConfig } from "@/lib/zimraHttp";
import logger from "@/lib/logger";
import { isBareZimraPortalUrl } from "@/lib/utils/zimraInvoiceDisplay";

export interface FiscalResult {
  verificationCode: string;
  verificationLink: string;
  qrCodeUrl: string;
  /** Raw receipt hash or non-URL QR payload from ZIMRA (encode as QR when no link). */
  receiptHash: string;
  fiscalDayNo: number | null;
  fdmsInvoiceNo: string;
  receiptGlobalNo: string;
  receiptCounter: string;
  receiptId: string;
  deviceId: string;
  rawResponse: unknown;
}

export interface VirtualDeviceConfigSummary {
  deviceId: string;
  deviceSerialNumber: string;
  fiscalDayNo: number | null;
  verificationLink: string;
  qrUrl: string;
  applicableTaxes: unknown;
  raw: Record<string, unknown>;
}

const TIMEOUT_MS = 30_000;

function zimraConfiguredHost(base: string): string {
  try {
    return new URL(base).host;
  } catch {
    return "(invalid ZIMRA base URL)";
  }
}

function parseZimraJsonFromText(
  rawBody: string,
  statusCode: number,
  operation: string,
  baseUrl: string
): Record<string, unknown> {
  const trimmed = rawBody.trim();
  if (!trimmed) {
    const host = zimraConfiguredHost(baseUrl);
    if (statusCode === 401) {
      throw new Error(
        `ZIMRA ${operation}: HTTP 401 with an empty body (host: ${host}). ` +
          `Axis Virtual Device on HTTP requires login first: set ZIMRA_VD_EMAIL and ZIMRA_VD_PASSWORD in .env.local (POST /api/Auth/login), then retry.`
      );
    }
    if (statusCode === 404) {
      throw new Error(
        `ZIMRA ${operation}: HTTP 404 with an empty body (host: ${host}). ` +
          `The FDMS paths under /api/VirtualDevice/ are usually served by the ZIMRA Virtual Fiscal Device on your machine, not by the public fdmsapi*.zimra.co.zw host alone. ` +
          `In Fiscal settings, set the custom API base URL to the HTTPS base shown in your FDMS / Virtual Device docs (often https://127.0.0.1 and a port). ` +
          `If you intend to use the public test API host, confirm with ZIMRA that VirtualDevice endpoints are exposed there and that your client certificate matches that environment.`
      );
    }
    throw new Error(
      `ZIMRA ${operation}: empty response (HTTP ${statusCode}). ` +
        `Ensure the Virtual Fiscal Device is running and the fiscal settings base URL matches it ` +
        `(host: ${host}). Client TLS certificates are required for HTTPS FDMS.`
    );
  }
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    throw new Error(
      `ZIMRA ${operation}: response is not JSON (HTTP ${statusCode}). Body preview: ${trimmed.slice(0, 160)}`
    );
  }
}

/** Merge nested Data/data with top-level keys (root wins on collision — matches ZIMRA envelopes). */
function mergeZimraRootAndData(response: Record<string, unknown>): Record<string, unknown> {
  const innerRaw = response["Data"] ?? response["data"];
  const inner =
    innerRaw && typeof innerRaw === "object" && !Array.isArray(innerRaw)
      ? (innerRaw as Record<string, unknown>)
      : null;
  const rest = { ...response };
  delete rest.Data;
  delete rest.data;
  if (!inner) return rest;
  return { ...inner, ...rest };
}

function pickStr(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (v != null && String(v).trim() !== "") return String(v);
  }
  return "";
}

function parseFiscalDayNo(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function getSubmitReceiptPath(): string {
  const custom = process.env.ZIMRA_SUBMIT_RECEIPT_PATH?.trim();
  if (custom) {
    const p = custom.startsWith("/") ? custom : `/${custom}`;
    return p;
  }
  const flag = process.env.ZIMRA_USE_SUBMIT_RECEIPT_EXT?.trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes") {
    return "/api/VirtualDevice/SubmitReceiptExt";
  }
  return "/api/VirtualDevice/SubmitReceipt";
}

function longestNonBareZimraHttpUrl(merged: Record<string, unknown>): string {
  const found: string[] = [];
  for (const v of Object.values(merged)) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (!/^https?:\/\//i.test(t)) continue;
    if (!isBareZimraPortalUrl(t)) found.push(t);
  }
  if (!found.length) return "";
  return found.reduce((a, b) => (b.length > a.length ? b : a), found[0]);
}

function mapResponseToFiscalResult(response: Record<string, unknown>): FiscalResult {
  const merged = mergeZimraRootAndData(response);

  let verificationLink = pickStr(
    merged,
    "verificationLink",
    "VerificationLink",
    "verificationURL",
    "VerificationURL"
  );
  const fromScan = longestNonBareZimraHttpUrl(merged);
  if (fromScan && (!verificationLink || isBareZimraPortalUrl(verificationLink))) {
    verificationLink = fromScan;
  }
  const qrRaw = merged["QRCode"] ?? merged["qrCode"];
  const qrStr = qrRaw != null ? String(qrRaw).trim() : "";
  const qrIsHttp = /^https?:\/\//i.test(qrStr);

  let qrCodeUrl = "";
  let receiptHashFromQr = "";
  if (qrIsHttp) qrCodeUrl = qrStr;
  else if (qrStr) receiptHashFromQr = qrStr;

  const qrUrlField = pickStr(merged, "qrCodeUrl", "qrUrl");
  if (!qrCodeUrl && qrUrlField && /^https?:\/\//i.test(qrUrlField)) {
    qrCodeUrl = qrUrlField;
  } else if (!qrCodeUrl && !receiptHashFromQr && qrUrlField) {
    receiptHashFromQr = qrUrlField;
  }

  const receiptHash =
    pickStr(merged, "receiptHash", "ReceiptHash") || receiptHashFromQr;

  return {
    verificationCode: pickStr(merged, "verificationCode", "VerificationCode"),
    verificationLink,
    qrCodeUrl,
    receiptHash,
    fiscalDayNo: parseFiscalDayNo(
      merged["fiscalDayNo"] ?? merged["FiscalDayNo"]
    ),
    fdmsInvoiceNo: pickStr(merged, "fdmsInvoiceNo", "FDMSInvoiceNo"),
    receiptGlobalNo: pickStr(merged, "receiptGlobalNo", "ReceiptGlobalNo"),
    receiptCounter: pickStr(merged, "receiptCounter", "ReceiptCounter"),
    receiptId: pickStr(merged, "receiptId", "ReceiptId"),
    deviceId: pickStr(merged, "DeviceID", "deviceId"),
    rawResponse: response,
  };
}

async function getZimraContext(): Promise<{
  base: string;
  deviceId?: string;
  tls: ZimraTlsConfig | null;
}> {
  const doc = await getFiscalSettingsDoc();
  const base = resolveZimraBaseUrl(doc);
  const tls = buildTlsFromDoc(doc);
  const deviceId = doc.deviceId?.trim() || undefined;
  return { base, deviceId, tls };
}

async function zimraCall(
  path: string,
  init: { method: "GET" | "POST"; body?: Record<string, unknown> },
  operation: string
): Promise<Record<string, unknown>> {
  const ctx = await getZimraContext();
  const url = `${ctx.base}${path}`;
  const headers: Record<string, string> = { Accept: "*/*" };
  const auth = await getFdmsAuthorizationHeader(ctx.base);
  if (auth) headers["Authorization"] = auth;
  let body: string | undefined;
  if (init.method === "POST") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.body ?? {});
  }
  const { statusCode, rawBody } = await zimraRequest(
    url,
    { method: init.method, headers, body },
    ctx.tls,
    TIMEOUT_MS
  );
  return parseZimraJsonFromText(rawBody, statusCode, operation, ctx.base);
}

/** GET /api/VirtualDevice/GetConfig — device identity and tax table for shared / test VD. */
export async function getVirtualDeviceConfig(): Promise<VirtualDeviceConfigSummary> {
  const data = await zimraCall("/api/VirtualDevice/GetConfig", { method: "GET" }, "GetConfig");
  const code = String(data["Code"] ?? data["code"] ?? "");
  if (code !== "1") {
    throw new Error(String(data["Message"] ?? data["message"] ?? "GetConfig failed"));
  }
  const merged = mergeZimraRootAndData(data);
  const inner = (data["Data"] ?? data["data"]) as Record<string, unknown> | undefined;
  const applicableTaxes =
    inner && typeof inner === "object" && "applicableTaxes" in inner
      ? inner["applicableTaxes"]
      : undefined;

  const deviceSerialNumber =
    pickStr(merged, "DeviceSerialNumber", "deviceSerialNumber", "deviceSerialNo") ||
    pickStr(
      inner && typeof inner === "object" ? (inner as Record<string, unknown>) : {},
      "deviceSerialNo"
    );

  return {
    deviceId: pickStr(merged, "DeviceID", "deviceId"),
    deviceSerialNumber,
    fiscalDayNo: parseFiscalDayNo(data["FiscalDayNo"] ?? data["fiscalDayNo"] ?? merged["FiscalDayNo"]),
    verificationLink: pickStr(merged, "VerificationLink", "verificationLink"),
    qrUrl: pickStr(merged, "qrUrl", "QRCode", "qrCode"),
    applicableTaxes: applicableTaxes ?? [],
    raw: data,
  };
}

export async function checkFiscalDayStatus(): Promise<{ isOpen: boolean; status: string }> {
  const data = await zimraCall("/api/VirtualDevice/GetStatus", { method: "GET" }, "GetStatus");
  const code = String(data["Code"] ?? data["code"] ?? "");

  if (code !== "1") {
    throw new Error(`ZIMRA device not ready: ${String(data["Message"] ?? data["message"] ?? "Unknown error")}`);
  }

  const inner = (data["Data"] ?? data["data"] ?? {}) as Record<string, unknown>;
  const fiscalDayStatus = String(
    inner["fiscalDayStatus"] ?? inner["FiscalDayStatus"] ?? data["fiscalDayStatus"] ?? data["FiscalDayStatus"] ?? ""
  );

  return {
    isOpen: fiscalDayStatus !== "FiscalDayClosed",
    status: fiscalDayStatus,
  };
}

export async function openFiscalDay(): Promise<void> {
  const data = await zimraCall("/api/VirtualDevice/OpenFiscalDay", { method: "GET" }, "OpenFiscalDay");
  const code = String(data["Code"] ?? data["code"] ?? "");

  if (code !== "1") {
    throw new Error(String(data["Message"] ?? data["message"] ?? "Failed to open fiscal day"));
  }
}

/** Returns full ZIMRA JSON payload (persist for Z-reports). */
export async function closeFiscalDay(): Promise<Record<string, unknown>> {
  const data = await zimraCall("/api/VirtualDevice/CloseFiscalDay", { method: "GET" }, "CloseFiscalDay");
  const code = String(data["Code"] ?? data["code"] ?? "");

  if (code !== "1") {
    throw new Error(String(data["Message"] ?? data["message"] ?? "Failed to close fiscal day"));
  }
  return data;
}

export function buildSubmitReceiptPayload(invoice: IInvoice): Record<string, unknown> {
  const buyer = invoice.buyerSnapshot;

  let invoiceTaxAmount = 0;
  if (invoice.taxInclusive) {
    for (const line of invoice.lines) {
      const lineTotal = Math.round(line.quantity * line.unitPrice * 100) / 100;
      const taxPercent = line.taxPercent ?? 0;
      if (taxPercent > 0) {
        invoiceTaxAmount += lineTotal - lineTotal / (1 + taxPercent / 100);
      }
    }
    invoiceTaxAmount = Math.round(invoiceTaxAmount * 100) / 100;
  } else {
    invoiceTaxAmount = invoice.lines.reduce((sum, l) => sum + (l.vatAmount ?? 0), 0);
    invoiceTaxAmount = Math.round(invoiceTaxAmount * 100) / 100;
  }

  const receiptLines = invoice.lines.map((line, index) => ({
    receiptLineType: line.lineType || "Sale",
    receiptLineNo: line.lineNo || index + 1,
    receiptLineHSCode: line.hsCode || (process.env.INVOICE_DEFAULT_HS_CODE ?? "00000000"),
    receiptLineName: line.description,
    receiptLinePrice: line.unitPrice,
    receiptLineQuantity: line.quantity,
    receiptLineTotal: Math.round(line.quantity * line.unitPrice * 100) / 100,
    taxCode: line.taxCode,
    taxPercent: line.taxPercent,
  }));

  return {
    receiptType: invoice.receiptType,
    receiptCurrency: invoice.receiptCurrency,
    invoiceNo: invoice.invoiceNumber,
    referenceNumber: "",
    invoiceAmount: invoice.totalAmount,
    invoiceTaxAmount,
    receiptNotes:
      invoice.receiptNotes && invoice.receiptNotes.trim() !== ""
        ? invoice.receiptNotes
        : "N/A",
    receiptLinesTaxInclusive: invoice.taxInclusive,
    moneyTypeCode: invoice.paymentMethod,
    receiptPrintForm: invoice.receiptPrintForm,
    buyerRegisterName: buyer?.registerName ?? "",
    buyerTradeName: buyer?.tradeName || buyer?.registerName || "",
    vatNumber: buyer?.vatNumber ?? "",
    buyerTIN: buyer?.tin ?? "",
    buyerPhoneNo: buyer?.phone ?? "",
    buyerEmail: buyer?.email ?? "",
    buyerProvince: buyer?.province ?? "",
    buyerStreet: buyer?.address ?? "",
    buyerHouseNo: "",
    buyerCity: buyer?.city ?? "",
    receiptLines,
  };
}

/** SubmitReceiptExt body: same as SubmitReceipt plus reference fields (empty for first sale / FiscalInvoice). */
export function buildSubmitReceiptExtPayload(invoice: IInvoice): Record<string, unknown> {
  const base = buildSubmitReceiptPayload(invoice);
  return {
    ...base,
    refDeviceID: "",
    refReceiptGlobalnumber: "",
    refFiscalDay: "",
  };
}

export async function submitReceipt(invoice: IInvoice): Promise<FiscalResult> {
  const dayStatus = await checkFiscalDayStatus();
  if (!dayStatus.isOpen) {
    throw new Error(
      "Fiscal day is closed. Please open the fiscal day before fiscalizing invoices."
    );
  }

  const path = getSubmitReceiptPath();
  const useExt = path.includes("SubmitReceiptExt");
  const payload = useExt ? buildSubmitReceiptExtPayload(invoice) : buildSubmitReceiptPayload(invoice);

  if (!Array.isArray(payload.receiptLines) || (payload.receiptLines as unknown[]).length === 0) {
    throw new Error("Invoice has no line items to fiscalize. Please add at least one line.");
  }

  const operation = useExt ? "SubmitReceiptExt" : "SubmitReceipt";
  const response = await zimraCall(path, { method: "POST", body: payload }, operation);

  const code = String(response["Code"] ?? response["code"] ?? "");
  if (code !== "1") {
    throw new Error(
      String(response["Message"] ?? response["message"] ?? "ZIMRA fiscalization failed")
    );
  }

  logger.info(
    {
      operation,
      path,
      responsePreview: JSON.stringify(response).slice(0, 4000),
    },
    "ZIMRA submit receipt response"
  );

  return mapResponseToFiscalResult(response);
}
