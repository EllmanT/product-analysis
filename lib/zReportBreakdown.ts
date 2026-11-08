/**
 * The VAT breakdown printed on a Z-report: nett, tax and total per currency and per tax rate, built from the
 * fiscalised receipts of the fiscal day. Pure maths lives here so it can be tested without a database.
 */

export interface BreakdownSale {
  currency: string;
  kind?: "SALE" | "CREDIT_NOTE";
  lines: { taxPercent: number; lineTotalExcl: number; vatAmount: number; lineTotalIncl: number }[];
}

export interface BreakdownRate {
  taxPercent: number;
  nett: number;
  tax: number;
  gross: number;
}

export interface BreakdownCurrency {
  currency: string;
  /** Sales receipts (not credit notes) counted. */
  receipts: number;
  creditNotes: number;
  rates: BreakdownRate[];
  /** Whole-day figures after credit notes are taken off. */
  nett: number;
  tax: number;
  /** "Daily total amount". */
  gross: number;
  salesGross: number;
  creditsGross: number;
}

export interface ZReportBreakdown {
  computedAt: string;
  /** "close" when saved at the moment the day closed; "live" when worked out later for an older report. */
  basis: "close" | "live";
  receiptCount: number;
  currencies: BreakdownCurrency[];
}

const cents = (n: number) => Math.round((Number(n) || 0) * 100);
const money = (c: number) => c / 100;

/** Credit notes are stored with negative amounts; this makes sure a credit always reduces the day. */
const sign = (kind: BreakdownSale["kind"], v: number) => (kind === "CREDIT_NOTE" ? -Math.abs(v) : v);

export function buildBreakdown(sales: BreakdownSale[], basis: ZReportBreakdown["basis"] = "close", now = new Date()): ZReportBreakdown {
  const byCur = new Map<
    string,
    { receipts: number; credits: number; rates: Map<number, { nett: number; tax: number; gross: number }>; salesGross: number; creditsGross: number }
  >();

  for (const s of sales) {
    const cur = (s.currency || "USD").toUpperCase();
    const c = byCur.get(cur) ?? { receipts: 0, credits: 0, rates: new Map(), salesGross: 0, creditsGross: 0 };
    byCur.set(cur, c);
    if (s.kind === "CREDIT_NOTE") c.credits++;
    else c.receipts++;
    for (const l of s.lines) {
      const r = c.rates.get(l.taxPercent) ?? { nett: 0, tax: 0, gross: 0 };
      r.nett += sign(s.kind, cents(l.lineTotalExcl));
      r.tax += sign(s.kind, cents(l.vatAmount));
      const g = sign(s.kind, cents(l.lineTotalIncl));
      r.gross += g;
      c.rates.set(l.taxPercent, r);
      if (s.kind === "CREDIT_NOTE") c.creditsGross += g;
      else c.salesGross += g;
    }
  }

  const currencies: BreakdownCurrency[] = [...byCur.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, c]) => {
      const rates = [...c.rates.entries()]
        .sort(([a], [b]) => a - b)
        .map(([taxPercent, r]) => ({ taxPercent, nett: money(r.nett), tax: money(r.tax), gross: money(r.gross) }));
      const sum = (f: (r: { nett: number; tax: number; gross: number }) => number) => [...c.rates.values()].reduce((n, r) => n + f(r), 0);
      return {
        currency,
        receipts: c.receipts,
        creditNotes: c.credits,
        rates,
        nett: money(sum((r) => r.nett)),
        tax: money(sum((r) => r.tax)),
        gross: money(sum((r) => r.gross)),
        salesGross: money(c.salesGross),
        creditsGross: money(c.creditsGross),
      };
    });

  return { computedAt: now.toISOString(), basis, receiptCount: sales.length, currencies };
}
