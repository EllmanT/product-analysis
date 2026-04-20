function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function findAtKeys(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    if (k in obj) {
      const n = num(obj[k]);
      if (n != null) return n;
    }
  }
  return null;
}

function scanCurrencyTotals(
  obj: unknown,
  out: { usd?: number; zwg?: number }
): void {
  if (obj == null || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const item of obj) scanCurrencyTotals(item, out);
    return;
  }
  const r = obj as Record<string, unknown>;
  const currency = String(r.currency ?? r.Currency ?? r.currencyCode ?? r.CurrencyCode ?? "")
    .trim()
    .toUpperCase();
  const amount =
    num(r.amount) ??
    num(r.total) ??
    num(r.Total) ??
    num(r.salesAmount) ??
    num(r.SalesAmount) ??
    num(r.value) ??
    num(r.Value);

  if (amount != null) {
    if (currency === "USD") out.usd = amount;
    if (currency === "ZWG" || currency === "ZWL") out.zwg = amount;
  }

  for (const v of Object.values(r)) {
    scanCurrencyTotals(v, out);
  }
}

/**
 * Best-effort extraction of Z / day-close totals from ZIMRA JSON (shape varies by FDMS version).
 */
export function extractZReportTotals(raw: Record<string, unknown>): {
  usd: number | null;
  zwg: number | null;
  fiscalDayNo: number | null;
} {
  const data = (raw["Data"] ?? raw["data"] ?? raw) as Record<string, unknown>;

  const fiscalDayNo =
    findAtKeys(raw, ["fiscalDayNo", "FiscalDayNo", "fiscal_day_no"]) ??
    findAtKeys(data, ["fiscalDayNo", "FiscalDayNo", "fiscal_day_no"]);

  let usd =
    findAtKeys(data, [
      "totalSalesUsd",
      "TotalSalesUSD",
      "total_USD",
      "usdTotal",
      "UsdTotal",
      "salesUsd",
      "SalesUsd",
    ]) ?? null;
  let zwg =
    findAtKeys(data, [
      "totalSalesZwg",
      "TotalSalesZWG",
      "totalSalesZwl",
      "TotalSalesZWL",
      "zwgTotal",
      "ZwgTotal",
      "salesZwg",
    ]) ?? null;

  if (usd == null || zwg == null) {
    const scanned: { usd?: number; zwg?: number } = {};
    scanCurrencyTotals(data, scanned);
    if (usd == null && scanned.usd != null) usd = scanned.usd;
    if (zwg == null && scanned.zwg != null) zwg = scanned.zwg;
  }

  return { usd, zwg, fiscalDayNo };
}
