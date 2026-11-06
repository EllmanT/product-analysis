import Invoice from "@/database/invoice.model";
import PosSale from "@/database/posSale.model";
import dbConnect from "@/lib/mongoose";
import { dayCounters, fiscalBackend } from "@/lib/fiscal/client";
import { CENTRAL_KEY, resolveServiceDeviceId, saleDeviceFilter } from "@/lib/services/fiscalDevice.service";

export interface DayPreviewRow {
  currency: string;
  /** Gross sales the device will report (SaleByTax), and the same from our own fiscalised sales. */
  deviceSales: number;
  appSales: number;
  deviceCredits: number;
  appCredits: number;
  matches: boolean;
}

export interface DayPreview {
  available: boolean;
  reason?: string;
  fiscalDayNo?: number;
  receipts?: number;
  rows: DayPreviewRow[];
  matches: boolean;
  /** Shop invoices counted in the app's side (the shop sells on the central device, next to its branches). */
  shopInvoices?: number;
}

const cents = (n: number) => Math.round(n * 100);

/**
 * Before the close: do the counters the fiscal service will sign equal what the app sold? Compares per currency the
 * device's SaleByTax and CreditNoteByTax totals with the app's fiscalised sales and credit notes of the same
 * fiscal day. A difference here is what would otherwise show up as a rejected close or a wrong Z-report.
 */
export async function getDayPreview(deviceKey: string = CENTRAL_KEY): Promise<DayPreview> {
  if (fiscalBackend() !== "service") return { available: false, reason: "The fiscal service is not in use yet.", rows: [], matches: true };
  const c = await dayCounters(await resolveServiceDeviceId(deviceKey));
  if (!c) return { available: false, reason: "No fiscal day is open on this device.", rows: [], matches: true };

  await dbConnect();
  const sales = await PosSale.find({ ...saleDeviceFilter(deviceKey), status: "FISCALISED", "fiscal.fiscalDayNo": c.fiscalDayNo })
    .select("currency kind totalAmount")
    .lean<{ currency: string; kind: string; totalAmount: number }[]>();

  // The shop has no branch, so its invoices go through the central device and are in that device's counters too.
  let shopInvoices = 0;
  if (deviceKey === CENTRAL_KEY) {
    const invoices = await Invoice.find({ isFiscalized: true, "fiscalData.fiscalDayNo": c.fiscalDayNo, "fiscalData.rawResponse.source": "fiscal-service" })
      .select("receiptCurrency receiptType totalAmount")
      .lean<{ receiptCurrency: string; receiptType: string; totalAmount: number }[]>();
    for (const i of invoices) sales.push({ currency: i.receiptCurrency, kind: i.receiptType === "CreditNote" ? "CREDIT_NOTE" : "SALE", totalAmount: i.receiptType === "CreditNote" ? -Math.abs(i.totalAmount) : i.totalAmount });
    shopInvoices = invoices.length;
  }

  const sum = (type: string, cur: string) => c.counters.filter((x) => x.fiscalCounterType === type && x.fiscalCounterCurrency === cur).reduce((t, x) => t + cents(x.fiscalCounterValue), 0);
  const currencies = [...new Set([...c.counters.map((x) => x.fiscalCounterCurrency), ...sales.map((s) => s.currency)])].sort();
  const rows = currencies.map((cur) => {
    const appSales = sales.filter((s) => s.currency === cur && s.kind !== "CREDIT_NOTE").reduce((t, s) => t + cents(s.totalAmount), 0);
    const appCredits = sales.filter((s) => s.currency === cur && s.kind === "CREDIT_NOTE").reduce((t, s) => t + cents(Math.abs(s.totalAmount)), 0);
    const deviceSales = sum("SaleByTax", cur);
    const deviceCredits = Math.abs(sum("CreditNoteByTax", cur));
    return { currency: cur, deviceSales: deviceSales / 100, appSales: appSales / 100, deviceCredits: deviceCredits / 100, appCredits: appCredits / 100, matches: deviceSales === appSales && deviceCredits === appCredits };
  });
  return { available: true, fiscalDayNo: c.fiscalDayNo, receipts: c.receiptCounter, rows, matches: rows.every((r) => r.matches), ...(shopInvoices ? { shopInvoices } : {}) };
}
