import { searchProducts, type TerminalProduct } from "@/components/pos/cart";

/** HS code given to slip lines that match no POS product (agreed with the client). */
export const DESPATCH_DEFAULT_HS_CODE = "99001000";

export const MAX_DESPATCH_LINES = 200;

/** What the vision model returns for one line, before any clean-up. */
export interface RawSlipLine {
  code?: string | null;
  description?: string | null;
  qty?: number | null;
  unit_price?: number | null;
  total?: number | null;
}

export interface NormalisedSlipLine {
  lineNo: number;
  code: string;
  description: string;
  quantity: number;
  slipUnitPrice: number | null;
  slipTotal: number | null;
  matchKind: "exact" | "suggested" | "none";
  productId?: string;
  productName?: string;
  hsCode: string;
  issues: string[];
}

export interface NormalisedSlip {
  lines: NormalisedSlipLine[];
  warnings: string[];
}

const round = (n: number, dp: number) => {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
};

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Slip numbers are compared ignoring case, spaces and punctuation ("DS-0012" == "ds 0012"). */
export function slipNumberKey(slipNumber: string | null | undefined): string | undefined {
  const key = (slipNumber ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return key || undefined;
}

/**
 * Turn the model's lines into lines the POS can sell: clean text, quantities and prices that pass the
 * sale validation (qty <= 3 dp, price exactly 2 dp), and a catalogue match for each. Nothing is dropped
 * silently: a line the POS cannot take as it stands is kept and given an `issues` entry for the cashier.
 */
export function normaliseSlipLines(raw: RawSlipLine[], products: TerminalProduct[]): NormalisedSlip {
  const warnings: string[] = [];
  let source = raw;
  if (source.length > MAX_DESPATCH_LINES) {
    warnings.push(`The slip has ${source.length} lines; only the first ${MAX_DESPATCH_LINES} were kept.`);
    source = source.slice(0, MAX_DESPATCH_LINES);
  }

  const byCode = new Map<string, TerminalProduct>();
  for (const p of products) if (p.code) byCode.set(p.code.trim().toLowerCase(), p);

  const lines: NormalisedSlipLine[] = [];
  for (const r of source) {
    const issues: string[] = [];
    const code = (r.code ?? "").trim();
    let description = (r.description ?? "").replace(/\s+/g, " ").trim();
    if (!description && !code) continue; // an empty row (a divider or a smudge), nothing to sell
    if (!description) {
      description = code;
      issues.push("No description on the slip; the code is used as the description.");
    }
    if (description.length > 200) {
      description = description.slice(0, 200);
      issues.push("Description was longer than 200 characters and was cut.");
    }

    let quantity = finite(r.qty) ? r.qty : 0;
    if (quantity <= 0) {
      issues.push("Quantity is missing or not above zero.");
      quantity = 0;
    } else {
      const q = round(quantity, 3);
      if (q !== quantity) issues.push("Quantity was rounded to 3 decimals.");
      quantity = q;
      if (quantity > 100_000) issues.push("Quantity is above 100,000: check it was read correctly.");
    }

    let slipUnitPrice: number | null = null;
    if (finite(r.unit_price)) {
      if (r.unit_price <= 0) issues.push("Unit price on the slip is zero or negative.");
      else {
        // Keep 4 dp here: the cashier-chosen VAT basis is applied later, and only then is the price made 2 dp.
        slipUnitPrice = round(r.unit_price, 4);
      }
    }
    const slipTotal = finite(r.total) && r.total >= 0 ? round(r.total, 2) : null;

    if (slipUnitPrice !== null && slipTotal !== null && quantity > 0) {
      const calc = round(quantity * slipUnitPrice, 2);
      if (Math.abs(calc - slipTotal) > 0.011) {
        issues.push(`Slip total ${slipTotal.toFixed(2)} does not equal qty x price (${calc.toFixed(2)}).`);
      }
    }

    // Match: an exact code wins; otherwise the best catalogue search hit is only a suggestion.
    let matchKind: NormalisedSlipLine["matchKind"] = "none";
    let product: TerminalProduct | undefined;
    const exact = code ? byCode.get(code.toLowerCase()) : undefined;
    if (exact) {
      matchKind = "exact";
      product = exact;
    } else {
      const hit = (code ? searchProducts(products, code, 1)[0] : undefined) ?? searchProducts(products, description, 1)[0];
      if (hit) {
        matchKind = "suggested";
        product = hit;
      }
    }
    if (matchKind === "none") issues.push(`No matching POS product: HS code ${DESPATCH_DEFAULT_HS_CODE} will be used.`);

    lines.push({
      lineNo: lines.length + 1,
      code,
      description,
      quantity,
      slipUnitPrice,
      slipTotal,
      matchKind,
      productId: product?.id,
      productName: product?.name,
      hsCode: product?.hsCode?.trim() || DESPATCH_DEFAULT_HS_CODE,
      issues,
    });
  }

  if (lines.length === 0) warnings.push("No line items could be read from the photo.");
  return { lines, warnings };
}

/** Sum of the slip's own line totals, to compare with the slip's grand total. */
export function sumSlipTotals(lines: NormalisedSlipLine[]): number | null {
  if (lines.some((l) => l.slipTotal === null)) return null;
  return round(
    lines.reduce((s, l) => s + (l.slipTotal ?? 0), 0),
    2
  );
}
