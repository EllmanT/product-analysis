import type { IInvoice } from "@/database/invoice.model";
import {
  buildTlsFromDoc,
  getFiscalSettingsDoc,
  resolveZimraBaseUrl,
} from "@/lib/services/fiscalSettings.service";
import { getFdmsAuthorizationHeader } from "@/lib/zimraFdmsAuth";
import { zimraRequest, type ZimraTlsConfig } from "@/lib/zimraHttp";

export interface FiscalResult {
  verificationCode: string;
  verificationLink: string;
  qrCodeUrl: string;
  fiscalDayNo: number | null;
  fdmsInvoiceNo: string;
  receiptGlobalNo: string;
  receiptCounter: string;
  receiptId: string;
  deviceId: string;
  rawResponse: unknown;
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
  // VirtualDevice routes match production Laravel ZimraFiscalService: no ?deviceId= on the URL (mTLS + gateway bind the device).
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

export async function submitReceipt(invoice: IInvoice): Promise<FiscalResult> {
  const dayStatus = await checkFiscalDayStatus();
  if (!dayStatus.isOpen) {
    throw new Error(
      "Fiscal day is closed. Please open the fiscal day before fiscalizing invoices."
    );
  }

  const payload = buildSubmitReceiptPayload(invoice);

  if (!Array.isArray(payload.receiptLines) || (payload.receiptLines as unknown[]).length === 0) {
    throw new Error("Invoice has no line items to fiscalize. Please add at least one line.");
  }

  const response = await zimraCall(
    "/api/VirtualDevice/SubmitReceipt",
    { method: "POST", body: payload },
    "SubmitReceipt"
  );

  const code = String(response["Code"] ?? response["code"] ?? "");
  if (code !== "1") {
    throw new Error(
      String(response["Message"] ?? response["message"] ?? "ZIMRA fiscalization failed")
    );
  }

  const data = (response["data"] ?? response["Data"] ?? response) as Record<string, unknown>;

  return {
    verificationCode: String(data["verificationCode"] ?? data["VerificationCode"] ?? ""),
    verificationLink: String(data["verificationLink"] ?? data["VerificationLink"] ?? ""),
    qrCodeUrl: String(data["qrCodeUrl"] ?? data["QRCode"] ?? data["qrCode"] ?? ""),
    fiscalDayNo:
      data["fiscalDayNo"] != null
        ? Number(data["fiscalDayNo"])
        : data["FiscalDayNo"] != null
        ? Number(data["FiscalDayNo"])
        : null,
    fdmsInvoiceNo: String(data["fdmsInvoiceNo"] ?? data["FDMSInvoiceNo"] ?? ""),
    receiptGlobalNo: String(data["receiptGlobalNo"] ?? data["ReceiptGlobalNo"] ?? ""),
    receiptCounter: String(data["receiptCounter"] ?? data["ReceiptCounter"] ?? ""),
    receiptId: String(data["receiptId"] ?? data["ReceiptId"] ?? ""),
    deviceId: String(
      data["DeviceID"] ?? data["deviceId"] ?? data["DeviceSerialNumber"] ?? ""
    ),
    rawResponse: response,
  };
}
