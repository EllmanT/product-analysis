import { computeInvoiceTotals, computeLineTotals } from "@/lib/utils/invoiceCalculations";

export type Currency = "USD" | "ZWG";

export interface TerminalProduct {
  id: string;
  name: string;
  code: string;
  hsCode: string;
  priceUsd: number;
  priceZwg: number | null;
  priceOnEntry: boolean;
}

/**
 * A cart line keeps its price in both currencies so F2 can reprice instantly.
 * `usd` is always set; `zwg` is a fixed ZWG price (catalog override or typed in ZWG), else usd x rate.
 */
export interface CartLine {
  key: string;
  productId?: string;
  description: string;
  hsCode?: string;
  quantity: number;
  usd: number;
  zwg: number | null;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function unitPrice(line: CartLine, currency: Currency, rate: number): number {
  if (currency === "USD") return round2(line.usd);
  return round2(line.zwg ?? line.usd * rate);
}

/** Price typed at the till, in the currency the cashier is selling in. */
export function priceFromTyped(typed: number, currency: Currency, rate: number): Pick<CartLine, "usd" | "zwg"> {
  return currency === "USD"
    ? { usd: round2(typed), zwg: null }
    : { usd: typed / (rate || 1), zwg: round2(typed) };
}

export function priceFromProduct(p: TerminalProduct): Pick<CartLine, "usd" | "zwg"> {
  return { usd: p.priceUsd, zwg: p.priceZwg };
}

export interface CartTotals {
  subtotalExcl: number;
  vat: number;
  total: number;
  lines: { key: string; unitPrice: number; lineTotal: number; vat: number; lineTotalExcl: number; lineTotalIncl: number }[];
}

/** Mirrors the server's maths (computeLineTotals) so the screen total equals the receipt total. */
export function cartTotals(
  lines: CartLine[],
  currency: Currency,
  rate: number,
  taxPercent: number,
  taxInclusive: boolean
): CartTotals {
  if (lines.length === 0) return { subtotalExcl: 0, vat: 0, total: 0, lines: [] };
  const computed = computeLineTotals(
    lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: unitPrice(l, currency, rate),
      taxPercent,
    })),
    taxInclusive
  );
  const t = computeInvoiceTotals(computed);
  return {
    subtotalExcl: t.subtotalExclTax,
    vat: t.totalVat,
    total: t.totalAmount,
    lines: computed.map((c, i) => ({
      key: lines[i].key,
      unitPrice: c.unitPrice,
      lineTotal: c.lineTotalIncl,
      vat: c.vatAmount,
      lineTotalExcl: c.lineTotalExcl,
      lineTotalIncl: c.lineTotalIncl,
    })),
  };
}

/** Add a line, merging into an existing one for the same product at the same price. */
export function addLine(lines: CartLine[], incoming: CartLine): CartLine[] {
  const i = lines.findIndex(
    (l) =>
      l.description.toLowerCase() === incoming.description.toLowerCase() &&
      l.usd === incoming.usd &&
      l.zwg === incoming.zwg
  );
  if (i === -1) return [...lines, incoming];
  const next = lines.slice();
  next[i] = { ...next[i], quantity: Math.round((next[i].quantity + incoming.quantity) * 1000) / 1000 };
  return next;
}

/** Rank catalog matches: exact code/name first, then prefix, then every-word match. */
export function searchProducts(products: TerminalProduct[], query: string, limit = 8): TerminalProduct[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/);
  const scored: { p: TerminalProduct; s: number }[] = [];
  for (const p of products) {
    const name = p.name.toLowerCase();
    const code = p.code.toLowerCase();
    let s = 0;
    if (code && code === q) s = 100;
    else if (name === q) s = 90;
    else if (code && code.startsWith(q)) s = 70;
    else if (name.startsWith(q)) s = 60;
    else if (words.every((w) => name.includes(w) || (code && code.includes(w)))) s = 30;
    if (s) scored.push({ p, s });
  }
  scored.sort((a, b) => b.s - a.s || a.p.name.localeCompare(b.p.name));
  return scored.slice(0, limit).map((x) => x.p);
}
