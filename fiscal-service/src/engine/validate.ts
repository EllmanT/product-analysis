/**
 * Pre-send validation: every rule ZIMRA flags Red that we can check ourselves, checked BEFORE a receipt
 * number is used. A Red receipt can never be replaced or removed, and one Red receipt makes the whole fiscal
 * day unclosable by us, so this is the main defence against close-day errors.
 *
 * Pure functions, no I/O.
 */
import type { MoneyType } from "../core/types.js";
import type { SubmitRequest, ValidationProblem } from "./types.js";

export interface DeviceRules {
  /** A VAT payer must give every line an 8 digit HS code (RCPT047, RCPT048). */
  vatPayer: boolean;
  /** The device's tax table from GetConfig. */
  taxes: { taxID: number; taxPercent: number | null }[];
}

const MONEY_TYPES: MoneyType[] = ["Cash", "Card", "MobileWallet", "Coupon", "Credit", "BankTransfer", "Other"];
const DECIMAL = /^-?\d+(\.\d{1,2})?$/;
const QTY = /^\d+(\.\d{1,3})?$/;

export const MAX_LINES = 200;

/** Integer cents of a decimal string already known to match DECIMAL. */
function toCents(s: string): number {
  const neg = s.startsWith("-");
  const [w, f = ""] = s.replace("-", "").split(".");
  const c = Number(w) * 100 + Number((f + "00").slice(0, 2));
  return neg ? -c : c;
}

/**
 * Lines that give a tax percent but no taxId get the id from the device's tax table. Only an unambiguous match is
 * used (one tax with that percent); anything else is left alone and validation reports it. Pure: returns a copy.
 */
export function resolveTaxIds(req: SubmitRequest, rules: DeviceRules): SubmitRequest {
  if (!Array.isArray(req.lines) || req.lines.every((l) => Number.isInteger(l?.taxId))) return req;
  return {
    ...req,
    lines: req.lines.map((l) => {
      if (!l || Number.isInteger(l.taxId)) return l;
      const given = l.taxPercent ?? null;
      const hits = rules.taxes.filter((t) => (t.taxPercent ?? null) === null ? given === null : given !== null && Math.abs((t.taxPercent as number) - given) < 0.001);
      return hits.length === 1 ? { ...l, taxId: hits[0]!.taxID } : l;
    }),
  };
}

export function validateRequest(req: SubmitRequest, rules: DeviceRules): ValidationProblem[] {
  const out: ValidationProblem[] = [];
  const bad = (code: string, message: string) => out.push({ code, message });

  if (!req.tenantId?.trim()) bad("TENANT_REQUIRED", "tenantId is required");
  const inv = req.invoiceNo ?? "";
  if (!inv.trim()) bad("INVOICE_NO_REQUIRED", "invoiceNo is required");
  else if (inv.length > 50) bad("INVOICE_NO_TOO_LONG", "invoiceNo can be at most 50 characters");
  else if (/[\u0000-\u001f]/.test(inv)) bad("INVOICE_NO_INVALID", "invoiceNo contains control characters");

  if (!/^[A-Za-z]{3}$/.test(req.currency ?? "")) bad("CURRENCY_INVALID", "currency must be a 3 letter code such as USD or ZWG");

  const type = req.receiptType ?? "FiscalInvoice";
  const note = type !== "FiscalInvoice";
  if (note) {
    if (!req.original?.invoiceNo?.trim()) bad("ORIGINAL_REQUIRED", `A ${type === "CreditNote" ? "credit" : "debit"} note must say which invoice it refers to`);
    if (!req.notes?.trim()) bad("NOTES_REQUIRED", "A credit or debit note needs a reason in notes");
  } else if (req.original) {
    bad("ORIGINAL_NOT_ALLOWED", "Only a credit or debit note may refer to another invoice (RCPT029)");
  }

  if (!Array.isArray(req.lines) || req.lines.length === 0) bad("LINES_REQUIRED", "At least one line is required");
  else if (req.lines.length > MAX_LINES) bad("TOO_MANY_LINES", `At most ${MAX_LINES} lines per receipt`);

  const taxById = new Map(rules.taxes.map((t) => [t.taxID, t.taxPercent]));
  let total = 0;
  (req.lines ?? []).forEach((l, i) => {
    const at = `line ${i + 1}`;
    if (!l.name?.trim()) bad("LINE_NAME_REQUIRED", `${at}: name is required`);
    else if (l.name.length > 200) bad("LINE_NAME_TOO_LONG", `${at}: name can be at most 200 characters`);
    const price = String(l.unitPrice ?? "");
    if (!DECIMAL.test(price)) {
      bad("LINE_PRICE_INVALID", `${at}: unitPrice must be a decimal with at most 2 places`);
    } else {
      const c = toCents(price);
      if (c === 0) bad("LINE_PRICE_ZERO", `${at}: unitPrice cannot be zero`);
      else if (note && type === "CreditNote" && c > 0) bad("CREDIT_LINE_SIGN", `${at}: credit note lines must be negative (RCPT022)`);
      else if (!(note && type === "CreditNote") && c < 0) bad("LINE_NEGATIVE", `${at}: a negative line is only allowed on a credit note (RCPT022)`);
      const q = String(l.quantity ?? "");
      if (QTY.test(q) && Number(q) > 0) total += Math.round(c * Number(q));
    }
    if (!QTY.test(String(l.quantity ?? "")) || !(Number(l.quantity) > 0)) bad("LINE_QUANTITY_INVALID", `${at}: quantity must be positive with at most 3 decimals`);

    if (!Number.isInteger(l.taxId) || !taxById.has(l.taxId as number)) {
      bad("TAX_UNKNOWN", `${at}: tax ${l.taxId} is not in the device's tax table`);
    } else {
      const pct = taxById.get(l.taxId as number) ?? null;
      const given = l.taxPercent ?? null;
      if ((pct === null) !== (given === null) || (pct !== null && Math.abs(pct - (given as number)) > 0.001)) {
        bad("TAX_PERCENT_MISMATCH", `${at}: taxPercent ${given ?? "none"} does not match the device's ${pct ?? "exempt"} for tax ${l.taxId}`);
      }
    }

    if (rules.vatPayer) {
      if (!l.hsCode) bad("HS_CODE_REQUIRED", `${at}: an 8 digit HS code is required (RCPT047)`);
      else if (!/^\d{8}$/.test(l.hsCode)) bad("HS_CODE_LENGTH", `${at}: the HS code must be exactly 8 digits (RCPT048)`);
    }
  });

  if (!Array.isArray(req.payments) || req.payments.length === 0) bad("PAYMENTS_REQUIRED", "At least one payment is required");
  let paid = 0;
  for (const [i, p] of (req.payments ?? []).entries()) {
    if (!MONEY_TYPES.includes(p.moneyType)) bad("PAYMENT_TYPE_INVALID", `payment ${i + 1}: unknown moneyType ${p.moneyType}`);
    if (!DECIMAL.test(String(p.amount ?? ""))) bad("PAYMENT_AMOUNT_INVALID", `payment ${i + 1}: amount must be a decimal with at most 2 places`);
    else {
      const c = toCents(p.amount);
      if (type === "CreditNote" ? c > 0 : c < 0) bad("PAYMENT_SIGN", `payment ${i + 1}: ${type === "CreditNote" ? "a credit note payment must not be positive" : "a payment must not be negative"} (RCPT028)`);
      paid += c;
    }
  }
  // Tax-inclusive receipts must be paid exactly. (Tax-exclusive totals add tax, which the signer checks.)
  if ((req.taxInclusive ?? true) && out.every((p) => !p.code.startsWith("LINE_") && !p.code.startsWith("PAYMENT_")) && paid !== total) {
    bad("PAYMENT_MISMATCH", `Payments (${(paid / 100).toFixed(2)}) must equal the receipt total (${(total / 100).toFixed(2)}) (RCPT021)`);
  }

  const b = req.buyer;
  if (b) {
    // The real gateway refuses (HTTP 422, nothing stored) a buyer block with neither an email nor a phone number.
    if (!b.buyerContacts?.email && !b.buyerContacts?.phoneNo) bad("BUYER_CONTACT_REQUIRED", "A customer on the invoice needs an email address or a phone number");
    if ((b.buyerRegisterName && !b.buyerTIN) || (!b.buyerRegisterName && b.buyerTIN)) bad("BUYER_INCOMPLETE", "Buyer name and TIN must be given together");
    if (b.buyerTIN && !/^\d{10}$/.test(b.buyerTIN)) bad("BUYER_TIN_INVALID", "Buyer TIN must be 10 digits");
    if (b.vatNumber && !/^\d{9}$/.test(b.vatNumber)) bad("BUYER_VAT_INVALID", "Buyer VAT number must be 9 digits");
  }
  return out;
}

/**
 * Drop empty pieces of a buyer block (undefined, blank text, empty contact or address objects). A cash sale arrives
 * from the app as `{ buyerContacts: {}, buyerAddress: {} }`, which the real gateway treats as a buyer WITHOUT a
 * contact and refuses; it must be sent as no buyer at all.
 */
export function normalizeBuyer(b: SubmitRequest["buyer"]): SubmitRequest["buyer"] {
  if (!b || typeof b !== "object") return undefined;
  const clean = (o: Record<string, unknown> | undefined): Record<string, string> | undefined => {
    if (!o) return undefined;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) if (typeof v === "string" && v.trim()) out[k] = v.trim();
    return Object.keys(out).length ? out : undefined;
  };
  const { buyerContacts, buyerAddress, ...rest } = b as Record<string, unknown> & { buyerContacts?: Record<string, unknown>; buyerAddress?: Record<string, unknown> };
  const flat = clean(rest) ?? {};
  const contacts = clean(buyerContacts);
  const address = clean(buyerAddress);
  const out: Record<string, unknown> = { ...flat, ...(contacts ? { buyerContacts: contacts } : {}), ...(address ? { buyerAddress: address } : {}) };
  return Object.keys(out).length ? (out as SubmitRequest["buyer"]) : undefined;
}
