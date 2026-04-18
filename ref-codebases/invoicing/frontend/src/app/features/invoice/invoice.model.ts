export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface InvoiceModel {
  logoDataUrl: string | null;
  from: string;
  billTo: string;
  shipTo: string;
  invoiceNumber: string;
  date: string;
  paymentTerms: string;
  dueDate: string;
  poNumber: string;
  items: InvoiceLineItem[];
  notes: string;
  terms: string;
  theme: string;
  currency: string;
  currencySymbol: string;
  taxPercent: number;
  discount: number;
  shipping: number;
  amountPaid: number;
}

export function formatInvoiceDisplayDate(d: Date): string {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const y = d.getFullYear();
  return `${String(m).padStart(2, '0')}/${String(day).padStart(2, '0')}/${y}`;
}

export function todayInvoiceDisplayDate(): string {
  return formatInvoiceDisplayDate(new Date());
}

/** Parse MM/DD/YYYY (or ISO) strings from stored invoice fields for date pickers. */
export function parseInvoiceDisplayDate(s: string): Date | null {
  const t = s?.trim();
  if (!t) return null;
  const isoTry = /^\d{4}-\d{2}-\d{2}/.test(t);
  if (isoTry) {
    const d = new Date(t);
    return isNaN(d.getTime()) ? null : d;
  }
  const parts = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (parts) {
    let y = parseInt(parts[3], 10);
    if (y < 100) y += y < 50 ? 2000 : 1900;
    const d = new Date(y, parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return isNaN(d.getTime()) ? null : d;
  }
  const parsed = Date.parse(t);
  if (!isNaN(parsed)) {
    const d = new Date(parsed);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export const DEFAULT_INVOICE: InvoiceModel = {
  logoDataUrl: null,
  from: '',
  billTo: '',
  shipTo: '',
  invoiceNumber: '1',
  date: todayInvoiceDisplayDate(),
  paymentTerms: '',
  dueDate: '',
  poNumber: '',
  items: [
    { id: '1', description: '', quantity: 1, rate: 0, amount: 0 },
  ],
  notes: '',
  terms: '',
  theme: 'Classic',
  currency: 'USD',
  currencySymbol: '$',
  taxPercent: 0,
  discount: 0,
  shipping: 0,
  amountPaid: 0,
};

export function createNewLineItem(id: string): InvoiceLineItem {
  return { id, description: '', quantity: 1, rate: 0, amount: 0 };
}

export function formatMoney(value: number, symbol: string): string {
  return symbol + value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
