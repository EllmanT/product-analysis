/**
 * Turning a slip's printed prices into till prices, and checking the result against the slip's total.
 * Pure functions so the maths can be tested without the UI.
 */

/** How the slip's prices relate to VAT. "catalogue" ignores the slip prices and uses the POS product prices. */
export type PriceBasis = "incl" | "excl" | "catalogue";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * A slip unit price in the units the till wants. The till takes the price VAT-inclusive when the branch is
 * `branchInclusive`, otherwise VAT-exclusive, and it must be exactly 2 decimals.
 * `slipInclusive` says whether the slip's own price includes VAT.
 */
export function slipPriceToTillPrice(slipPrice: number, slipInclusive: boolean, branchInclusive: boolean, taxPercent: number): number {
  const factor = 1 + taxPercent / 100;
  if (slipInclusive === branchInclusive) return round2(slipPrice);
  return round2(slipInclusive ? slipPrice / factor : slipPrice * factor);
}

export interface TotalComparison {
  /** "match": equals the slip's grand total; "match-excl": equals it before VAT; "differs": neither. */
  result: "match" | "match-excl" | "differs" | "unknown";
  /** The signed difference (till minus slip) against the closer of the two totals; 0 on a match. */
  difference: number;
}

/**
 * Compare the till's total with the slip's grand total. A slip may print its total with or without VAT,
 * so both are tried; a difference of a cent or two is rounding, which is reported rather than hidden.
 */
export function compareWithSlipTotal(slipGrandTotal: number | null, tillTotalIncl: number, tillTotalExcl: number): TotalComparison {
  if (slipGrandTotal === null) return { result: "unknown", difference: 0 };
  const dIncl = round2(tillTotalIncl - slipGrandTotal);
  const dExcl = round2(tillTotalExcl - slipGrandTotal);
  if (Math.abs(dIncl) < 0.005) return { result: "match", difference: 0 };
  if (Math.abs(dExcl) < 0.005) return { result: "match-excl", difference: 0 };
  return { result: "differs", difference: Math.abs(dIncl) <= Math.abs(dExcl) ? dIncl : dExcl };
}

/** A price typed or computed as text -> a positive 2-decimal number, or null when it is not one. */
export function parsePrice(text: string): number | null {
  const n = Number(text.trim().replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return round2(n) === n ? n : round2(n);
}

/** A quantity as text -> a positive number with at most 3 decimals, or null. */
export function parseQuantity(text: string): number | null {
  const n = Number(text.trim().replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0 || n > 100_000) return null;
  return Math.round(n * 1000) / 1000;
}
