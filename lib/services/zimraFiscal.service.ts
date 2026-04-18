import type { IInvoice } from "@/database/invoice.model";

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

const ZIMRA_BASE = process.env.ZIMRA_API_URL ?? "https://fdmsapitest.zimra.co.zw";
const TIMEOUT_MS = 30_000;

async function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function checkFiscalDayStatus(): Promise<{ isOpen: boolean; status: string }> {
  const url = `${ZIMRA_BASE}/api/VirtualDevice/GetStatus`;
  const res = await fetchWithTimeout(url, {
    headers: { "Content-Type": "application/json", Accept: "*/*" },
  });

  const data = await res.json() as Record<string, unknown>;
  const code = String(data["Code"] ?? data["code"] ?? "");

  if (code !== "1") {
    throw new Error(`ZIMRA device not ready: ${String(data["Message"] ?? data["message"] ?? "Unknown error")}`);
  }

  // Handle both casing variants the ZIMRA API returns
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
  const url = `${ZIMRA_BASE}/api/VirtualDevice/OpenFiscalDay`;
  const res = await fetchWithTimeout(url, {
    headers: { "Content-Type": "application/json", Accept: "*/*" },
  });

  const data = await res.json() as Record<string, unknown>;
  const code = String(data["Code"] ?? data["code"] ?? "");

  if (code !== "1") {
    throw new Error(String(data["Message"] ?? data["message"] ?? "Failed to open fiscal day"));
  }
}

export async function closeFiscalDay(): Promise<void> {
  const url = `${ZIMRA_BASE}/api/VirtualDevice/CloseFiscalDay`;
  const res = await fetchWithTimeout(url, {
    headers: { "Content-Type": "application/json", Accept: "*/*" },
  });

  const data = await res.json() as Record<string, unknown>;
  const code = String(data["Code"] ?? data["code"] ?? "");

  if (code !== "1") {
    throw new Error(String(data["Message"] ?? data["message"] ?? "Failed to close fiscal day"));
  }
}

export function buildSubmitReceiptPayload(invoice: IInvoice): Record<string, unknown> {
  const buyer = invoice.buyerSnapshot;

  // Compute invoice tax amount exactly as ZimraFiscalService.php does
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

  const url = `${ZIMRA_BASE}/api/VirtualDevice/SubmitReceipt`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "*/*" },
    body: JSON.stringify(payload),
  });

  const response = await res.json() as Record<string, unknown>;

  const code = String(response["Code"] ?? response["code"] ?? "");
  if (code !== "1") {
    throw new Error(
      String(response["Message"] ?? response["message"] ?? "ZIMRA fiscalization failed")
    );
  }

  // Extract fiscal result — handle multiple casing variants from ZIMRA
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
