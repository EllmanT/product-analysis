export interface InvoiceLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  taxCode?: string;
  taxPercent: number;
  hsCode?: string;
  lineType?: string;
}

export interface ComputedLine extends InvoiceLineInput {
  lineNo: number;
  lineTotalIncl: number;
  lineTotalExcl: number;
  vatAmount: number;
}

// Matches the PHP ZimraFiscalService VAT extraction exactly.
// taxInclusiveLineAmountForFiscal: round(qty * unitPrice, 2)
/**
 * VAT on one line total, in exact integer cents rounded half away from zero, the way ZIMRA's receipt tax is worked
 * out. Float arithmetic (e.g. 13.95 * 100) can land just under a half and round the wrong way by a cent, which the
 * fiscal service then refuses as "payments do not equal the receipt total".
 *   exclusive: tax = total * bp / 10000       inclusive: tax = total * bp / (10000 + bp)    (bp = percent x 100)
 */
export function vatOnLine(lineTotal: number, taxPercent: number, taxInclusive: boolean): number {
  if (!(taxPercent > 0)) return 0;
  const totalCents = Math.round(lineTotal * 100);
  const bp = Math.round(taxPercent * 100);
  const numerator = Math.abs(totalCents) * bp;
  const denominator = taxInclusive ? 10000 + bp : 10000;
  const cents = Math.floor((2 * numerator + denominator) / (2 * denominator));
  return (totalCents < 0 ? -cents : cents) / 100;
}

/**
 * Lines with their VAT. VAT is worked out ONCE PER TAX GROUP on the group's total and rounded once, because that is
 * what ZIMRA recomputes (a receipt whose tax was rounded line by line is flagged Red: RCPT026/RCPT027, seen on the
 * real test gateway). The cents that separate the group figure from the line-by-line sum are given back to the
 * largest lines, so the lines still add up to the invoice and the printed VAT equals what the device records.
 * A group is a tax rate plus tax code.
 */
export function computeLineTotals(
  lines: InvoiceLineInput[],
  taxInclusive: boolean
): ComputedLine[] {
  const base = lines.map((line, index) => {
    const lineTotal = Math.round(line.quantity * line.unitPrice * 100) / 100;
    const taxPercent = line.taxPercent ?? 0;
    return { line, index, lineTotal, taxPercent, vat: Math.round(vatOnLine(lineTotal, taxPercent, taxInclusive) * 100) };
  });

  const groups = new Map<string, typeof base>();
  for (const b of base) {
    const key = `${b.taxPercent}|${b.line.taxCode ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  for (const members of groups.values()) {
    const groupTotal = members.reduce((t, m) => t + Math.round(m.lineTotal * 100), 0) / 100;
    const want = Math.round(vatOnLine(groupTotal, members[0]!.taxPercent, taxInclusive) * 100);
    let diff = want - members.reduce((t, m) => t + m.vat, 0);
    const bySize = [...members].sort((x, y) => Math.abs(y.lineTotal) - Math.abs(x.lineTotal) || x.index - y.index);
    for (let i = 0; diff !== 0; i = (i + 1) % bySize.length) {
      const step = diff > 0 ? 1 : -1;
      bySize[i]!.vat += step;
      diff -= step;
    }
  }

  return base.map(({ line, index, lineTotal, vat }) => {
    const vatAmount = vat / 100;
    const lineTotalExcl = taxInclusive ? Math.round((lineTotal - vatAmount) * 100) / 100 : lineTotal;
    const lineTotalIncl = taxInclusive ? lineTotal : Math.round((lineTotal + vatAmount) * 100) / 100;
    return { ...line, lineNo: index + 1, lineTotalIncl, lineTotalExcl, vatAmount };
  });
}

export interface InvoiceTotals {
  totalVat: number;
  totalAmount: number;
  subtotalExclTax: number;
}

export function computeInvoiceTotals(
  computedLines: ComputedLine[]
): InvoiceTotals {
  const totalVat = computedLines.reduce((sum, l) => sum + l.vatAmount, 0);
  const totalIncl = computedLines.reduce((sum, l) => sum + l.lineTotalIncl, 0);
  const totalExcl = computedLines.reduce((sum, l) => sum + l.lineTotalExcl, 0);

  return {
    totalVat: Math.round(totalVat * 100) / 100,
    totalAmount: Math.round(totalIncl * 100) / 100,
    subtotalExclTax: Math.round(totalExcl * 100) / 100,
  };
}
