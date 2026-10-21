import type { IPosFiscal } from "@/database/posSale.model";

/**
 * Proof that a device receipt really is THIS sale. The device keeps invoice numbers for good, so
 * after a database reset or a released number the same number can already belong to an older
 * receipt. Its QR then scans fine but shows someone else's invoice, so nothing is stored or
 * printed until the device's own copy agrees with ours on total, currency, lines and number.
 */
export interface MatchableSale {
  invoiceNumber?: string;
  currency: string;
  totalAmount: number;
  lines: unknown[];
  kind?: string;
}

type Obj = Record<string, unknown>;

const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});

export function checkFiscalMatchesSale(sale: MatchableSale, fiscal: IPosFiscal): { ok: true } | { ok: false; reason: string } {
  const raw = obj(fiscal.rawResponse);
  const receipt = obj(obj(raw["Data"] ?? raw["data"])["receipt"] ?? obj(raw["Data"] ?? raw["data"])["Receipt"]);
  if (!Object.keys(receipt).length) return { ok: false, reason: "Device reply carries no receipt to compare" };

  const total = Number(receipt["receiptTotal"]);
  const expected = sale.kind === "CREDIT_NOTE" ? -Math.abs(sale.totalAmount) : sale.totalAmount;
  if (!Number.isFinite(total) || Math.abs(Math.abs(total) - Math.abs(expected)) > 0.005) {
    return { ok: false, reason: `Device receipt total ${receipt["receiptTotal"]} differs from sale total ${expected}` };
  }

  const cur = String(receipt["receiptCurrency"] ?? "");
  if (cur && cur.toUpperCase() !== sale.currency.toUpperCase()) {
    return { ok: false, reason: `Device receipt currency ${cur} differs from ${sale.currency}` };
  }

  const lines = receipt["receiptLines"];
  if (Array.isArray(lines) && lines.length !== sale.lines.length) {
    return { ok: false, reason: `Device receipt has ${lines.length} lines, sale has ${sale.lines.length}` };
  }

  const devNo = String(receipt["invoiceNo"] ?? fiscal.deviceInvoiceNo ?? "");
  if (sale.invoiceNumber && devNo && devNo !== sale.invoiceNumber && !devNo.endsWith(`-${sale.invoiceNumber}`)) {
    return { ok: false, reason: `Device receipt number ${devNo} is not ${sale.invoiceNumber}` };
  }

  // The QR must be built from this very receipt: its global number and verification code.
  const qr = (fiscal.qrCodeUrl || "").replace(/\s/g, "").toUpperCase();
  const code = (fiscal.verificationCode || "").replace(/-/g, "").toUpperCase();
  if (qr && code && !qr.endsWith(code)) return { ok: false, reason: "QR does not end with the verification code" };
  if (qr && fiscal.receiptGlobalNo && !qr.includes(String(fiscal.receiptGlobalNo).padStart(10, "0"))) {
    return { ok: false, reason: "QR does not contain this receipt's global number" };
  }
  return { ok: true };
}
