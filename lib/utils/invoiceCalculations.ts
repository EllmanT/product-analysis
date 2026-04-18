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
export function computeLineTotals(
  lines: InvoiceLineInput[],
  taxInclusive: boolean
): ComputedLine[] {
  return lines.map((line, index) => {
    const lineTotal = Math.round(line.quantity * line.unitPrice * 100) / 100;
    const taxPercent = line.taxPercent ?? 0;

    let vatAmount: number;
    if (taxInclusive) {
      vatAmount =
        taxPercent > 0
          ? Math.round((lineTotal - lineTotal / (1 + taxPercent / 100)) * 100) / 100
          : 0;
    } else {
      vatAmount = Math.round(lineTotal * (taxPercent / 100) * 100) / 100;
    }

    const lineTotalExcl = taxInclusive
      ? Math.round((lineTotal - vatAmount) * 100) / 100
      : lineTotal;
    const lineTotalIncl = taxInclusive
      ? lineTotal
      : Math.round((lineTotal + vatAmount) * 100) / 100;

    return {
      ...line,
      lineNo: index + 1,
      lineTotalIncl,
      lineTotalExcl,
      vatAmount,
    };
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
