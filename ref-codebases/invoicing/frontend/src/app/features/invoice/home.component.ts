import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import {
  InvoiceModel,
  InvoiceLineItem,
  DEFAULT_INVOICE,
  createNewLineItem,
  formatMoney,
  formatInvoiceDisplayDate,
  parseInvoiceDisplayDate,
} from './invoice.model';
import { DatePickerModule } from 'primeng/datepicker';

const SITE_NAME = 'E-Invoicing';

const THEMES = [{ label: 'Classic', value: 'Classic' }];

const CURRENCIES = [
  { label: 'USD ($)', value: 'USD', symbol: '$' },
  { label: 'EUR (€)', value: 'EUR', symbol: '€' },
  { label: 'GBP (£)', value: 'GBP', symbol: '£' },
];

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    FormsModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    DatePickerModule,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  protected readonly siteName = SITE_NAME;
  protected readonly themes = THEMES;
  protected readonly currencies = CURRENCIES;
  protected readonly showHero = signal(true);
  protected readonly showShippingInput = signal(false);
  protected readonly showDiscountInput = signal(false);

  protected invoice = signal<InvoiceModel>({ ...DEFAULT_INVOICE });

  protected subtotal = computed(() => {
    const items = this.invoice().items;
    return items.reduce((sum, i) => sum + i.amount, 0);
  });

  protected taxAmount = computed(() => {
    const sub = this.subtotal();
    const taxPct = this.invoice().taxPercent ?? 0;
    return (sub * taxPct) / 100;
  });

  protected total = computed(() => {
    return (
      this.subtotal() +
      this.taxAmount() -
      this.invoice().discount +
      this.invoice().shipping
    );
  });

  protected balanceDue = computed(() => {
    return Math.max(0, this.total() - this.invoice().amountPaid);
  });

  protected canDownload = computed(() => {
    const inv = this.invoice();
    return !!(inv.from?.trim() && inv.billTo?.trim());
  });

  updateInvoice(partial: Partial<InvoiceModel>): void {
    this.invoice.update((prev) => ({ ...prev, ...partial }));
  }

  invoiceDateValue(): Date | null {
    return parseInvoiceDisplayDate(this.invoice().date);
  }

  dueDateValue(): Date | null {
    return parseInvoiceDisplayDate(this.invoice().dueDate);
  }

  onInvoiceDateChange(value: Date | null): void {
    this.updateInvoice({
      date: value ? formatInvoiceDisplayDate(value) : '',
    });
  }

  onDueDateChange(value: Date | null): void {
    this.updateInvoice({
      dueDate: value ? formatInvoiceDisplayDate(value) : '',
    });
  }

  updateItem(id: string, partial: Partial<InvoiceLineItem>): void {
    this.invoice.update((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === id ? { ...item, ...partial } : item
      ),
    }));
  }

  recalcItemAmount(id: string): void {
    this.invoice.update((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        if (item.id !== id) return item;
        const amount = item.quantity * item.rate;
        return { ...item, amount };
      }),
    }));
  }

  addLineItem(): void {
    const nextId = String(
      Math.max(...this.invoice().items.map((i) => parseInt(i.id, 10)), 0) + 1
    );
    this.invoice.update((prev) => ({
      ...prev,
      items: [...prev.items, createNewLineItem(nextId)],
    }));
  }

  removeLineItem(id: string): void {
    const items = this.invoice().items.filter((i) => i.id !== id);
    if (items.length === 0) return;
    this.invoice.update((prev) => ({ ...prev, items }));
  }

  onLogoChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.updateInvoice({ logoDataUrl: reader.result as string });
    };
    reader.readAsDataURL(file);
  }

  dismissHero(): void {
    this.showHero.set(false);
  }

  formatMoney(value: number): string {
    return formatMoney(value, this.invoice().currencySymbol);
  }

  onCurrencyChange(value: string): void {
    const cur = CURRENCIES.find((c) => c.value === value);
    this.updateInvoice({
      currency: value,
      currencySymbol: cur?.symbol ?? '$',
    });
  }

  downloadPdf(): void {
    if (!this.canDownload()) return;
    const inv = this.invoice();
    const content = this.buildPrintContent(inv);
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(content);
    w.document.close();
    w.print();
    w.onafterprint = () => w.close();
  }

  private buildPrintContent(inv: InvoiceModel): string {
    const symbol = inv.currencySymbol;
    const rows = inv.items
      .map(
        (i) =>
          `<tr><td>${escapeHtml(i.description || '—')}</td><td>${i.quantity}</td><td>${symbol}${i.rate.toFixed(2)}</td><td>${symbol}${i.amount.toFixed(2)}</td></tr>`
      )
      .join('');
    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Invoice #${escapeHtml(inv.invoiceNumber)}</title>
<style>
  body { font-family: sans-serif; padding: 2rem; color: #111; max-width: 800px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem; }
  .from { font-size: 0.9rem; color: #374151; }
  .to { font-size: 0.9rem; }
  h1 { font-size: 1.75rem; margin: 0 0 1rem; }
  .meta { font-size: 0.9rem; margin-bottom: 1.5rem; }
  table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
  th { background: #1e3a5f; color: #fff; padding: 0.5rem 0.75rem; text-align: left; }
  td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #e5e7eb; }
  .text-right { text-align: right; }
  .totals { margin-top: 1rem; text-align: right; }
  .notes, .terms { margin-top: 1.5rem; font-size: 0.875rem; color: #6b7280; white-space: pre-wrap; }
</style>
</head>
<body>
  <div class="header">
    <div>
      ${inv.logoDataUrl ? `<img src="${inv.logoDataUrl}" alt="Logo" style="max-height: 60px; margin-bottom: 0.5rem;">` : ''}
      <div class="from">${escapeHtml(inv.from || '')}</div>
    </div>
    <div>
      <h1>INVOICE</h1>
      <div class="meta">
        #${escapeHtml(inv.invoiceNumber)}<br>
        ${inv.date ? `Date: ${escapeHtml(inv.date)}` : ''}<br>
        ${inv.paymentTerms ? `Payment Terms: ${escapeHtml(inv.paymentTerms)}` : ''}<br>
        ${inv.dueDate ? `Due Date: ${escapeHtml(inv.dueDate)}` : ''}<br>
        ${inv.poNumber ? `PO: ${escapeHtml(inv.poNumber)}` : ''}
      </div>
    </div>
  </div>
  <div class="to">
    <strong>Bill To</strong><br>
    ${escapeHtml(inv.billTo || '')}
    ${inv.shipTo ? `<br><strong>Ship To</strong><br>${escapeHtml(inv.shipTo)}` : ''}
  </div>
  <table>
    <thead><tr><th>Item</th><th>Quantity</th><th>Rate</th><th>Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    Subtotal: ${symbol}${this.subtotal().toFixed(2)}<br>
    ${inv.taxPercent ? `Tax (${inv.taxPercent}%): ${symbol}${this.taxAmount().toFixed(2)}<br>` : ''}
    ${inv.discount ? `Discount: -${symbol}${inv.discount.toFixed(2)}<br>` : ''}
    ${inv.shipping ? `Shipping: ${symbol}${inv.shipping.toFixed(2)}<br>` : ''}
    <strong>Total: ${symbol}${this.total().toFixed(2)}</strong><br>
    ${inv.amountPaid ? `Amount Paid: ${symbol}${inv.amountPaid.toFixed(2)}<br>` : ''}
    <strong>Balance Due: ${symbol}${this.balanceDue().toFixed(2)}</strong>
  </div>
  ${inv.notes ? `<div class="notes"><strong>Notes</strong><br>${escapeHtml(inv.notes)}</div>` : ''}
  ${inv.terms ? `<div class="terms"><strong>Terms</strong><br>${escapeHtml(inv.terms)}</div>` : ''}
</body>
</html>`;
  }
}

function escapeHtml(s: string): string {
  const div = { textContent: s } as HTMLElement;
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
