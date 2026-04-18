import { Component, OnInit, signal, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DatePicker } from 'primeng/datepicker';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { DialogModule } from 'primeng/dialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ApiService, Invoice, TenantDashboardCompany } from '../../services/api.service';
import { formatInvoiceStatus } from '../../utils/invoice-status';
import { InvoicePdfPayload, InvoicePdfService } from '../../services/invoice-pdf.service';
import QRCode from 'qrcode';

@Component({
  selector: 'app-invoices',
  standalone: true,
  imports: [
    RouterLink,
    CommonModule,
    FormsModule,
    ButtonModule,
    TableModule,
    InputTextModule,
    SelectModule,
    DatePicker,
    TagModule,
    ToastModule,
    TooltipModule,
    DialogModule,
    ConfirmDialogModule,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './invoices.component.html',
  styleUrl: './invoices.component.css',
})
export class InvoicesComponent implements OnInit {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  invoices = signal<Invoice[]>([]);
  loading = signal(false);
  fiscalizing = signal<string | null>(null);
  totalRecords = signal(0);
  invoiceDialogVisible = signal(false);
  viewingInvoice = signal(false);
  selectedInvoice = signal<Invoice | null>(null);
  previewQrDataUrl = signal<string>('');
  company = signal<TenantDashboardCompany | null>(null);

  searchTerm = '';
  statusFilter: string | null = null;
  fromDate: Date | null = null;
  toDate: Date | null = null;

  statuses = [
    { label: 'Draft', value: 'DRAFT' },
    { label: 'Fiscalized', value: 'SUBMITTED' },
    { label: 'Queued', value: 'QUEUED' },
    { label: 'Failed', value: 'FAILED' },
    { label: 'Cancelled', value: 'CANCELLED' },
  ];

  private searchTimeout: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private api: ApiService,
    private messageService: MessageService,
    private invoicePdf: InvoicePdfService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit() {
    if (!this.isBrowser) return;
    this.api.getAuthSession().subscribe({
      next: (session) => this.company.set(session.company ?? null),
      error: () => this.company.set(null),
    });
    this.loadInvoices();
  }

  loadInvoices() {
    this.loading.set(true);

    const params: Record<string, string> = {};
    if (this.searchTerm) params['search'] = this.searchTerm;
    if (this.statusFilter) params['status'] = this.statusFilter;
    if (this.fromDate) params['from_date'] = this.formatDate(this.fromDate);
    if (this.toDate) params['to_date'] = this.formatDate(this.toDate);

    this.api.getInvoices(params).subscribe({
      next: (response) => {
        this.invoices.set((response.data || []).map((inv) => this.normalizeInvoice(inv)));
        this.totalRecords.set(response.total || 0);
        this.loading.set(false);
      },
      error: (error) => {
        console.error('Failed to load invoices', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load invoices',
        });
        this.loading.set(false);
      },
    });
  }

  onSearchChange() {
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.loadInvoices();
    }, 500);
  }

  resetFilters() {
    this.searchTerm = '';
    this.statusFilter = null;
    this.fromDate = null;
    this.toDate = null;
    this.loadInvoices();
  }

  readonly formatInvoiceStatus = formatInvoiceStatus;

  getStatusSeverity(status: string): 'success' | 'secondary' | 'info' | 'warn' | 'danger' | 'contrast' {
    switch (status) {
      case 'SUBMITTED':
        return 'success';
      case 'DRAFT':
        return 'info';
      case 'QUEUED':
        return 'warn';
      case 'FAILED':
        return 'danger';
      case 'CANCELLED':
        return 'secondary';
      default:
        return 'contrast';
    }
  }

  viewInvoice(invoice: Invoice) {
    if (!invoice.id) return;
    this.viewingInvoice.set(true);
    this.api.getInvoice(invoice.id).subscribe({
      next: (fullInvoice) => {
        const normalized = this.normalizeInvoice(fullInvoice);
        this.selectedInvoice.set(normalized);
        this.preparePreviewQr(normalized);
        this.invoiceDialogVisible.set(true);
        this.viewingInvoice.set(false);
      },
      error: (error) => {
        console.error('Failed to load invoice details', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: error?.error?.message || 'Failed to load invoice details',
        });
        this.viewingInvoice.set(false);
      },
    });
  }

  fiscalizeInvoice(invoice: Invoice) {
    if (!invoice.id) return;
    this.confirmationService.confirm({
      header: 'Confirm fiscalization',
      message: `Fiscalize invoice ${invoice.invoice_no}? This action cannot be undone.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Fiscalize',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-text',
      accept: () => {
        this.fiscalizing.set(invoice.id!);
        this.api.fiscalizeInvoice(invoice.id!).subscribe({
          next: () => {
            this.messageService.add({
              severity: 'success',
              summary: 'Success',
              detail: 'Invoice fiscalized successfully',
            });
            this.fiscalizing.set(null);
            this.loadInvoices();
          },
          error: (error) => {
            console.error('Failed to fiscalize invoice', error);
            this.messageService.add({
              severity: 'error',
              summary: 'Error',
              detail: error.error?.message || 'Failed to fiscalize invoice',
            });
            this.fiscalizing.set(null);
          },
        });
      },
    });
  }

  printInvoice(invoice: Invoice) {
    if (!invoice.id) return;
    this.api.getInvoice(invoice.id).subscribe({
      next: async (fullInvoice) => {
        const normalized = this.normalizeInvoice(fullInvoice);
        const qrValue = this.getQrSourceValue(normalized);
        const qrImage = await this.generateQrDataUrl(qrValue);
        this.openPrintWindow(normalized, qrImage ?? '');
      },
      error: (error) => {
        console.error('Failed to load invoice for printing', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: error?.error?.message || 'Failed to prepare invoice for printing',
        });
      },
    });
  }

  downloadInvoicePdf(invoice: Invoice) {
    if (!invoice.id) return;
    this.api.getInvoice(invoice.id).subscribe({
      next: async (fullInvoice) => {
        const normalized = this.normalizeInvoice(fullInvoice);
        const qrValue = this.getQrSourceValue(normalized);
        const qrImage = qrValue ? await this.generateQrDataUrl(qrValue) : null;
        try {
          this.invoicePdf.savePdf({
            ...this.mapInvoiceToPdfPayload(normalized),
            qr_image_data_url: qrImage ?? undefined,
          });
          this.messageService.add({
            severity: 'success',
            summary: 'Downloaded',
            detail: 'Invoice saved as PDF',
          });
        } catch (e) {
          console.error('Failed to generate PDF', e);
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to download PDF',
          });
        }
      },
      error: (error) => {
        console.error('Failed to load invoice for download', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: error?.error?.message || 'Failed to load invoice',
        });
      },
    });
  }

  deleteInvoice(invoice: Invoice) {
    if (!invoice.id) return;
    this.confirmationService.confirm({
      header: 'Confirm delete',
      message: `Delete invoice ${invoice.invoice_no}? This action cannot be undone.`,
      icon: 'pi pi-trash',
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-text',
      accept: () => {
        this.api.deleteInvoice(invoice.id!).subscribe({
          next: () => {
            this.messageService.add({
              severity: 'success',
              summary: 'Success',
              detail: 'Invoice deleted successfully',
            });
            this.loadInvoices();
          },
          error: (error) => {
            console.error('Failed to delete invoice', error);
            this.messageService.add({
              severity: 'error',
              summary: 'Error',
              detail: error.error?.message || 'Failed to delete invoice',
            });
          },
        });
      },
    });
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  closeInvoiceDialog(): void {
    this.invoiceDialogVisible.set(false);
    this.previewQrDataUrl.set('');
  }

  async downloadPdfFromDialog(): Promise<void> {
    const invoice = this.selectedInvoice();
    if (!invoice) return;
    try {
      const qrValue = this.getQrSourceValue(invoice);
      let qrImage = this.previewQrDataUrl();
      if (!qrImage && qrValue) {
        qrImage = (await this.generateQrDataUrl(qrValue)) ?? '';
      }
      this.invoicePdf.savePdf({
        ...this.mapInvoiceToPdfPayload(invoice),
        qr_image_data_url: qrImage || undefined,
      });
      this.messageService.add({
        severity: 'success',
        summary: 'Downloaded',
        detail: 'Invoice saved as PDF',
      });
    } catch (e) {
      console.error('Failed to generate PDF', e);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to download PDF',
      });
    }
  }

  async printFromDialog(): Promise<void> {
    const invoice = this.selectedInvoice();
    if (!invoice) return;
    let qrImage = this.previewQrDataUrl();
    if (!qrImage) {
      const qrValue = this.getQrSourceValue(invoice);
      qrImage = (await this.generateQrDataUrl(qrValue)) ?? '';
    }
    this.openPrintWindow(invoice, qrImage);
  }

  private mapInvoiceToPdfPayload(inv: Invoice): InvoicePdfPayload {
    const lines = inv.lines ?? [];
    const lineSum = lines.reduce((s, l) => s + Number(l.line_total ?? 0), 0);
    const totalVat = Number(inv.total_vat ?? 0);
    const totalExcl =
      inv.total_excl_tax != null
        ? Number(inv.total_excl_tax)
        : inv.tax_inclusive
          ? lineSum - totalVat
          : lineSum;
    const fr = this.getFiscalResponse(inv);
    const fiscal =
      fr &&
      (fr.verification_code ||
        fr.fiscal_day_no != null ||
        fr.device_id != null ||
        fr.fdms_invoice_no != null ||
        (fr.verification_link && String(fr.verification_link).trim()))
        ? {
            verification_code: fr.verification_code,
            fiscal_day_no:
              fr.fiscal_day_no != null && fr.fiscal_day_no !== ''
                ? String(fr.fiscal_day_no)
                : undefined,
            device_id: fr.device_id != null && fr.device_id !== '' ? String(fr.device_id) : undefined,
            fdms_invoice_no:
              fr.fdms_invoice_no != null && fr.fdms_invoice_no !== ''
                ? String(fr.fdms_invoice_no)
                : undefined,
            verification_link: fr.verification_link?.trim() || undefined,
          }
        : undefined;

    return {
      invoice_no: inv.invoice_no,
      receipt_type: inv.receipt_type,
      receipt_date: inv.receipt_date,
      tax_inclusive: inv.tax_inclusive,
      currency: inv.receipt_currency,
      subtotal: lineSum,
      total_tax: totalVat,
      total_excl_tax: totalExcl,
      grand_total: Number(inv.receipt_total ?? 0),
      payment_method: inv.payment_method,
      payment_amount: Number(inv.payment_amount ?? inv.receipt_total ?? 0),
      buyer_display_name:
        inv.buyer?.name?.trim() || inv.buyer?.register_name?.trim() || 'Walk-in customer',
      seller: this.mapCompanyToPdfParty(this.company()),
      buyer: this.mapBuyerToPdfParty(inv),
      fiscal,
      notes: inv.receipt_notes,
      lines: lines.map((l) => ({
        description: l.description ?? '',
        quantity: Number(l.quantity ?? 0),
        unit_price: Number(l.unit_price ?? 0),
        line_total: Number(l.line_total ?? 0),
        tax_percent: Number(l.tax_percent ?? 0),
        tax_amount: Number(l.tax_amount ?? 0),
        hs_code: l.hs_code,
      })),
    };
  }

  private mapCompanyToPdfParty(company: TenantDashboardCompany | null): InvoicePdfPayload['seller'] {
    if (!company) return undefined;
    const address = [
      company.house_number,
      company.address_line,
      company.city,
      company.province,
      company.region,
      company.station,
    ]
      .map((p) => String(p ?? '').trim())
      .filter(Boolean)
      .join(', ');
    return {
      name: (company.trade_name || company.legal_name || '').trim(),
      physical_address: address,
      phone: String(company.phone ?? '').trim(),
      email: String(company.email ?? '').trim(),
      vat_number: String(company.vat_number ?? '').trim(),
      tin: String(company.tin ?? '').trim(),
    };
  }

  private mapBuyerToPdfParty(inv: Invoice): InvoicePdfPayload['buyer'] {
    const b = inv.buyer;
    if (!b) return undefined;
    const address = [
      b.address_house_no,
      b.address_street,
      b.address_city,
      b.address_province,
      b.address,
    ]
      .map((p) => String(p ?? '').trim())
      .filter(Boolean)
      .join(', ');
    const name = (b.name || b.register_name || b.trade_name || '').trim();
    return {
      name,
      physical_address: address,
      phone: String(b.phone ?? '').trim(),
      email: String(b.email ?? '').trim(),
      vat_number: String(b.vat_number ?? '').trim(),
      tin: String(b.tin ?? '').trim(),
    };
  }

  private openPrintWindow(invoice: Invoice, qrImageDataUrl: string): void {
    const qrUrl = this.getQrSourceValue(invoice);
    const taxInclusive = !!invoice.tax_inclusive;
    const lineRows = (invoice.lines ?? [])
      .map((line, index) => {
        const qty = Number(line.quantity ?? 0);
        const unit = Number(line.unit_price ?? 0);
        const vatAmount = Number(line.tax_amount ?? 0);
        const baseTotal = Number(line.line_total ?? 0);
        const totalIncl = taxInclusive ? baseTotal : baseTotal + vatAmount;
        const totalExcl = taxInclusive ? totalIncl - vatAmount : baseTotal;
        return `
        <tr>
          <td>${index + 1}</td>
          <td>${this.escapeHtml(line.description || '')}</td>
          <td class="num">${qty.toFixed(2)}</td>
          <td class="num">${unit.toFixed(2)}</td>
          <td class="num">${vatAmount.toFixed(2)}</td>
          ${taxInclusive ? `<td class="num">${totalIncl.toFixed(2)}</td>` : `<td class="num">${totalExcl.toFixed(2)}</td><td class="num">${totalIncl.toFixed(2)}</td>`}
        </tr>
      `;
      })
      .join('');

    const seller = this.mapCompanyToPdfParty(this.company());
    const buyer = this.mapBuyerToPdfParty(invoice);
    const buyerName = buyer?.name || invoice.buyer?.name || invoice.buyer?.register_name || 'Walk-in customer';
    const headerCols = taxInclusive
      ? '<tr><th>#</th><th>Description</th><th>Qty</th><th>Unit Price (Incl)</th><th>VAT amount</th><th>Total (Incl)</th></tr>'
      : '<tr><th>#</th><th>Description</th><th>Qty</th><th>Unit Price</th><th>VAT amount</th><th>Total (Excl)</th><th>Total (Incl)</th></tr>';

    const html = `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Document ${this.escapeHtml(invoice.invoice_no)}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
          h1 { margin: 0 0 4px 0; font-size: 28px; }
          .muted { color: #6b7280; font-size: 12px; margin-bottom: 18px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; margin-bottom: 16px; }
          .card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; margin-bottom: 16px; }
          .label { color: #6b7280; font-size: 12px; display: block; }
          .value { font-size: 14px; font-weight: 600; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { border: 1px solid #e5e7eb; padding: 8px; font-size: 12px; }
          th { background: #f8fafc; text-align: left; }
          td.num { text-align: right; }
          .totals { margin-top: 12px; margin-left: auto; width: 320px; }
          .totals-row { display: flex; justify-content: space-between; padding: 4px 0; }
          .grand { font-size: 18px; color: #bc0515; font-weight: 700; border-top: 1px solid #e5e7eb; margin-top: 6px; padding-top: 8px; }
          .qr { margin-top: 8px; text-align: left; }
          .qr img { width: 190px; height: 190px; object-fit: contain; border: 1px solid #e5e7eb; padding: 6px; border-radius: 8px; }
          .qr-caption { margin-top: 8px; font-weight: 700; font-size: 13px; }
        </style>
      </head>
      <body>
        <h1>${this.escapeHtml(invoice.receipt_type === 'CreditNote' ? 'Credit Note' : invoice.receipt_type === 'DebitNote' ? 'Debit Note' : 'Invoice')}</h1>
        <div class="muted">Generated from e-Invoicing</div>

        <div class="card">
          <div class="grid">
            <div>
              <div class="value" style="margin-bottom: 6px;">Company details</div>
              <div><span class="label">Name</span><span class="value">${this.escapeHtml(seller?.name || '—')}</span></div>
              <div><span class="label">Address</span><span class="value">${this.escapeHtml(seller?.physical_address || '—')}</span></div>
              <div><span class="label">Phone</span><span class="value">${this.escapeHtml(seller?.phone || '—')}</span></div>
              <div><span class="label">Email</span><span class="value">${this.escapeHtml(seller?.email || '—')}</span></div>
              <div><span class="label">VAT number</span><span class="value">${this.escapeHtml(seller?.vat_number || '—')}</span></div>
              <div><span class="label">TIN</span><span class="value">${this.escapeHtml(seller?.tin || '—')}</span></div>
            </div>
            <div>
              <div class="value" style="margin-bottom: 6px;">Customer details</div>
              <div><span class="label">Name</span><span class="value">${this.escapeHtml(String(buyerName || '—'))}</span></div>
              <div><span class="label">Address</span><span class="value">${this.escapeHtml(buyer?.physical_address || '—')}</span></div>
              <div><span class="label">Phone</span><span class="value">${this.escapeHtml(buyer?.phone || '—')}</span></div>
              <div><span class="label">Email</span><span class="value">${this.escapeHtml(buyer?.email || '—')}</span></div>
              <div><span class="label">Customer VAT</span><span class="value">${this.escapeHtml(buyer?.vat_number || '—')}</span></div>
              <div><span class="label">Customer TIN</span><span class="value">${this.escapeHtml(buyer?.tin || '—')}</span></div>
            </div>
          </div>
          <div class="grid">
            <div><span class="label">Document No</span><span class="value">${this.escapeHtml(invoice.invoice_no || '—')}</span></div>
            <div><span class="label">Date</span><span class="value">${this.escapeHtml(invoice.receipt_date || '')}</span></div>
            <div><span class="label">Payment</span><span class="value">${this.escapeHtml(invoice.payment_method || '')}</span></div>
            <div><span class="label">Currency</span><span class="value">${this.escapeHtml(invoice.receipt_currency || '')}</span></div>
          </div>
        </div>

        <div class="card">
          <div class="value" style="margin-bottom: 8px;">Line items</div>
          <table>
            <thead>
              ${headerCols}
            </thead>
            <tbody>
              ${lineRows || `<tr><td colspan="${taxInclusive ? 6 : 7}">No lines</td></tr>`}
            </tbody>
          </table>

          <div class="totals">
            <div class="totals-row"><span>Subtotal</span><span>${this.escapeHtml(invoice.receipt_currency)} ${Number(invoice.total_excl_tax ?? 0).toFixed(2)}</span></div>
            <div class="totals-row"><span>Total VAT</span><span>${this.escapeHtml(invoice.receipt_currency)} ${Number(invoice.total_vat ?? 0).toFixed(2)}</span></div>
            <div class="totals-row grand"><span>Grand total</span><span>${this.escapeHtml(invoice.receipt_currency)} ${Number(invoice.receipt_total ?? 0).toFixed(2)}</span></div>
          </div>
        </div>

        <div class="card">
          <div class="value">Fiscal details</div>
          <div class="grid" style="margin-top: 10px;">
            <div><span class="label">Verification code</span><span class="value">${this.escapeHtml(invoice.fiscalResponse?.verification_code || '—')}</span></div>
            <div><span class="label">Fiscal day</span><span class="value">${this.escapeHtml(String(invoice.fiscalResponse?.fiscal_day_no || '—'))}</span></div>
            <div><span class="label">Device ID</span><span class="value">${this.escapeHtml(String(invoice.fiscalResponse?.device_id || '—'))}</span></div>
            <div><span class="label">Invoice Number</span><span class="value">${this.escapeHtml(String(invoice.fiscalResponse?.fdms_invoice_no || '—'))}</span></div>
          </div>
          <div class="qr">
            ${qrImageDataUrl ? `<img src="${this.escapeHtml(qrImageDataUrl)}" alt="Fiscal QR code" />` : '<div class="muted">QR code</div>'}
            <div class="qr-caption">Verify this receipt manually at</div>
            <div>${this.escapeHtml(qrUrl)}</div>
          </div>
        </div>

        <script>window.print();</script>
      </body>
      </html>
    `;

    const popup = window.open('', '_blank', 'width=1000,height=900');
    if (!popup) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Popup blocked',
        detail: 'Enable popups to print the invoice.',
      });
      return;
    }
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  private getQrSourceValue(invoice: Invoice): string {
    const fiscal = this.getFiscalResponse(invoice);
    return String(
      fiscal?.qr_code_url ||
      fiscal?.verification_link ||
      ''
    ).trim();
  }

  private async preparePreviewQr(invoice: Invoice): Promise<void> {
    const qrValue = this.getQrSourceValue(invoice);
    const dataUrl = await this.generateQrDataUrl(qrValue);
    this.previewQrDataUrl.set(dataUrl ?? '');
  }

  private async generateQrDataUrl(value: string): Promise<string | null> {
    if (!value) return null;
    try {
      return await QRCode.toDataURL(value, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 240,
      });
    } catch (error) {
      console.error('Failed to generate QR image', error);
      return null;
    }
  }

  private normalizeInvoice(invoice: Invoice | any): Invoice {
    const mapped: Invoice = { ...(invoice as Invoice) };
    const snakeFiscal = (invoice as any)?.fiscal_response;
    if (!mapped.fiscalResponse && snakeFiscal) {
      mapped.fiscalResponse = snakeFiscal;
    }
    if (mapped.lines?.length) {
      mapped.lines = mapped.lines.map((line: any) => ({
        ...line,
        line_total: line.line_total ?? line.line_total_incl ?? 0,
      }));
    }
    return mapped;
  }

  private getFiscalResponse(invoice: Invoice): any {
    return (invoice as any).fiscalResponse ?? (invoice as any).fiscal_response ?? null;
  }
}
