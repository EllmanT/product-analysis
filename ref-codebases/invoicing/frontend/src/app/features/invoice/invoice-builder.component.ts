import { Component, OnInit, signal, computed, PLATFORM_ID, inject, OnDestroy, Input } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { ApiService, Product, Buyer, Invoice, TenantDashboardCompany, TenantHsCode } from '../../services/api.service';
import { AuthTokenService } from '../../services/auth-token.service';
import { InvoicePdfService } from '../../services/invoice-pdf.service';
import { Subject, takeUntil } from 'rxjs';

/** Same shape as billing page — Axis subscription list payloads vary. */
function normalizeSubscriptions(input: unknown): unknown[] {
  if (Array.isArray(input)) return input;
  if (input && typeof input === 'object') {
    const anyObj = input as Record<string, unknown>;
    if (Array.isArray(anyObj['data'])) return anyObj['data'] as unknown[];
    if (Array.isArray(anyObj['subscriptions'])) return anyObj['subscriptions'] as unknown[];
  }
  return [];
}

interface InvoiceLineItem {
  /** Set when user picks a suggested product from item description field. */
  product_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  tax_code: string;
  tax_percent: number;
  tax_amount: number;
  hs_code?: string;
}

interface HsSearchRow {
  code: string;
  codeLower: string;
  descriptionLower: string;
}

interface BuyerOption extends Buyer {
  display_name: string;
}

@Component({
  selector: 'app-invoice-builder',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    TextareaModule,
    ToastModule,
    AutoCompleteModule,
    DialogModule,
  ],
  providers: [MessageService],
  templateUrl: './invoice-builder.component.html',
  styleUrl: './invoice-builder.component.css',
})
export class InvoiceBuilderComponent implements OnInit, OnDestroy {
  @Input() pageTitle = 'Create invoice';
  @Input()
  pageSubtitle = 'Build your receipt, add line items, then save a draft or fiscalize when ready.';
  @Input() fixedReceiptType: 'FiscalInvoice' | 'CreditNote' | 'DebitNote' | null = null;

  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);
  private tokens = inject(AuthTokenService);
  private destroy$ = new Subject<void>();

  // Authentication state
  isAuthenticated = signal(false);
  /** Used for A4 invoice template company block + PDF downloads. */
  company = signal<TenantDashboardCompany | null>(null);

  /** Axis Billing: null = not checked, true/false after load. */
  hasActiveSubscription = signal<boolean | null>(null);
  subscriptionCheckLoading = signal(false);
  /** Shown when user has no active subscription (or API says 402). */
  subscriptionModalVisible = signal(false);

  // Data
  products = signal<Product[]>([]);
  buyers = signal<BuyerOption[]>([]);
  filteredProductNames = signal<string[]>([]);
  filteredBuyers = signal<BuyerOption[]>([]);
  /** HS codes usable for the tenant (when authenticated); guests type manually with no suggestions. */
  tenantUsableHsCodes = signal<TenantHsCode[]>([]);
  filteredHsCodeCodes = signal<string[]>([]);
  hsCodesLoaded = signal(false);
  hsCodesLoading = signal(false);
  private hsSearchIndex: HsSearchRow[] = [];
  private hsSearchDebounce: ReturnType<typeof setTimeout> | undefined;

  // Form data
  invoiceNo = '';
  receiptType: 'FiscalInvoice' | 'CreditNote' | 'DebitNote' = 'FiscalInvoice';
  receiptDate = new Date();
  selectedBuyer: BuyerOption | null = null;
  notes = '';
  taxInclusive = true;
  currency = 'USD';

  lines = signal<InvoiceLineItem[]>([this.createEmptyLine()]);

  // UI state
  saving = signal(false);
  fiscalizing = signal(false);
  loading = signal(false);
  downloading = signal(false);

  // Local storage key
  private readonly GUEST_INVOICES_KEY = 'guest_invoices';
  // Computed
  subtotal = computed(() => {
    return this.lines().reduce((sum, line) => sum + (line.line_total || 0), 0);
  });

  totalTax = computed(() => {
    return this.lines().reduce((sum, line) => sum + (line.tax_amount || 0), 0);
  });

  netSubtotalForDisplay = computed(() =>
    this.taxInclusive ? this.subtotal() - this.totalTax() : this.subtotal()
  );

  grandTotal = computed(() => {
    if (this.taxInclusive) {
      return this.subtotal();
    }
    return this.subtotal() + this.totalTax();
  });

  /** When true, Save / Fiscalize must not run (matches backend subscription gate). */
  subscriptionSaveBlocked = computed(() => {
    if (!this.isAuthenticated()) {
      return false;
    }
    if (this.subscriptionCheckLoading()) {
      return true;
    }
    return this.hasActiveSubscription() === false;
  });

  receiptTypes = [
    { label: 'Fiscal Invoice', value: 'FiscalInvoice' },
    { label: 'Credit Note', value: 'CreditNote' },
    { label: 'Debit Note', value: 'DebitNote' },
  ];

  currencies = [
    { label: 'USD', value: 'USD' },
    { label: 'ZWG', value: 'ZWG' },
    { label: 'ZAR', value: 'ZAR' },
  ];

  constructor(
    private api: ApiService,
    private messageService: MessageService,
    private router: Router,
    private invoicePdf: InvoicePdfService
  ) {}

  ngOnInit() {
    if (!this.isBrowser) return;

    if (this.fixedReceiptType) {
      this.receiptType = this.fixedReceiptType;
    }

    // Always generate invoice number for guest users
    this.generateInvoiceNo();
    this.receiptDate = new Date();

    const sync = () => {
      const authed = this.tokens.hasToken();
      this.isAuthenticated.set(authed);
      if (authed) {
        this.loadProducts();
        this.loadBuyers();
        this.refreshSubscriptionStatus();
        // HS codes are loaded lazily on first HS autocomplete interaction.
      } else {
        this.hasActiveSubscription.set(null);
        this.subscriptionCheckLoading.set(false);
        this.subscriptionModalVisible.set(false);
        this.company.set(null);
        this.tenantUsableHsCodes.set([]);
        this.hsCodesLoaded.set(false);
        this.hsCodesLoading.set(false);
        this.filteredHsCodeCodes.set([]);
        this.hsSearchIndex = [];
      }
    };
    sync();
    this.tokens.authChanged.pipe(takeUntil(this.destroy$)).subscribe(() => sync());
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Load subscription status (same rule as billing: any row with status `active`). */
  refreshSubscriptionStatus(): void {
    if (!this.isBrowser || !this.tokens.hasToken()) {
      return;
    }
    this.subscriptionCheckLoading.set(true);
    this.api.getAuthSession().subscribe({
      next: (session) => {
        this.company.set(session.company ?? null);
        const customerId = session.company?.axis_billing_customer_id ?? null;
        if (customerId == null) {
          this.hasActiveSubscription.set(false);
          this.subscriptionCheckLoading.set(false);
          return;
        }
        this.api.getAxisCustomerSubscriptions(customerId).subscribe({
          next: (res) => {
            const subs = normalizeSubscriptions(res);
            const active = subs.some(
              (s) => String((s as { status?: string }).status ?? '').toLowerCase() === 'active'
            );
            this.hasActiveSubscription.set(active);
            this.subscriptionCheckLoading.set(false);
          },
          error: () => {
            this.hasActiveSubscription.set(false);
            this.subscriptionCheckLoading.set(false);
          },
        });
      },
      error: () => {
        this.subscriptionCheckLoading.set(false);
        this.hasActiveSubscription.set(false);
      },
    });
  }

  onSubscriptionDialogVisible(visible: boolean): void {
    this.subscriptionModalVisible.set(visible);
  }

  goToBilling(): void {
    this.subscriptionModalVisible.set(false);
    void this.router.navigate(['/billing']);
  }

  private invoiceSaveBlocked(): boolean {
    if (!this.isAuthenticated()) {
      return false;
    }
    if (this.subscriptionCheckLoading()) {
      this.messageService.add({
        severity: 'info',
        summary: 'Please wait',
        detail: 'Checking your subscription…',
      });
      return true;
    }
    if (this.hasActiveSubscription() === false) {
      this.subscriptionModalVisible.set(true);
      return true;
    }
    return false;
  }

  private handleInvoiceApiError(error: { status?: number; error?: { message?: string } }): void {
    const msg =
      error?.error && typeof error.error === 'object' && 'message' in error.error
        ? String((error.error as { message?: string }).message ?? '')
        : '';
    if (error?.status === 402) {
      this.hasActiveSubscription.set(false);
      this.subscriptionModalVisible.set(true);
      this.messageService.add({
        severity: 'warn',
        summary: 'Subscription required',
        detail: msg || 'An active subscription is required to create invoices.',
      });
      return;
    }
    this.messageService.add({
      severity: 'error',
      summary: 'Error',
      detail: msg || 'Request failed.',
    });
  }

  loadProducts() {
    this.api.getProducts({ is_active: true, per_page: 500 }).subscribe({
      next: (response) => {
        this.products.set(response.data || []);
      },
      error: (error) => {
        console.error('Failed to load products', error);
      }
    });
  }

  loadBuyers() {
    this.api.getBuyersList().subscribe({
      next: (buyers) => {
        const rows = (buyers || []).map((b) => ({
          ...b,
          display_name: this.buyerDisplayName(b),
        }));
        this.buyers.set(rows);
      },
      error: (error) => {
        console.error('Failed to load buyers', error);
      }
    });
  }

  private buyerDisplayName(b: Buyer): string {
    const primary = (b.name ?? b.register_name ?? b.trade_name ?? '').trim();
    if (primary) return primary;
    if ((b.tin ?? '').trim()) return `TIN ${b.tin}`;
    if ((b.vat_number ?? '').trim()) return `VAT ${b.vat_number}`;
    return 'Unnamed buyer';
  }

  /** All pages of tenant-enabled HS codes for line-item autocomplete. */
  private loadTenantUsableHsCodes(page = 1, acc: TenantHsCode[] = []): void {
    if (page === 1) {
      this.hsCodesLoading.set(true);
    }

    this.api.getCompanyHsCodes({ page, per_page: 200, usable_only: true }).subscribe({
      next: (res) => {
        const chunk = res.data ?? [];
        const merged = [...acc, ...chunk];
        const currentPage = Number(res.current_page ?? 1);
        const lastPage = Number(res.last_page ?? 1);
        if (currentPage < lastPage) {
          this.loadTenantUsableHsCodes(page + 1, merged);
        } else {
          this.tenantUsableHsCodes.set(merged);
          this.hsSearchIndex = merged.map((h) => ({
            code: h.code,
            codeLower: h.code.toLowerCase(),
            descriptionLower: h.description.toLowerCase(),
          }));
          this.hsCodesLoaded.set(true);
          this.hsCodesLoading.set(false);
        }
      },
      error: () => {
        this.tenantUsableHsCodes.set([]);
        this.hsSearchIndex = [];
        this.hsCodesLoaded.set(false);
        this.hsCodesLoading.set(false);
      },
    });
  }

  private ensureHsCodesLoaded(): void {
    if (!this.isAuthenticated() || this.hsCodesLoaded() || this.hsCodesLoading()) {
      return;
    }
    this.loadTenantUsableHsCodes();
  }

  hsCodeDescription(code: string): string {
    const c = code.trim().toLowerCase();
    const row = this.tenantUsableHsCodes().find((h) => h.code.toLowerCase() === c);
    return row?.description ?? '';
  }

  searchHsCodes(event: { query?: string }) {
    this.ensureHsCodesLoaded();
    if (!this.hsCodesLoaded()) {
      this.filteredHsCodeCodes.set([]);
      return;
    }

    clearTimeout(this.hsSearchDebounce);
    const q = String(event?.query ?? '').trim().toLowerCase();

    // Instant lightweight fallback list when user opens dropdown/no query.
    if (!q) {
      this.filteredHsCodeCodes.set(this.hsSearchIndex.slice(0, 20).map((r) => r.code));
      return;
    }

    this.hsSearchDebounce = setTimeout(() => {
      // For short queries, only do fast code-prefix match to avoid expensive description scans.
      if (q.length < 2) {
        this.filteredHsCodeCodes.set(
          this.hsSearchIndex
            .filter((r) => r.codeLower.startsWith(q))
            .slice(0, 20)
            .map((r) => r.code)
        );
        return;
      }

      const codePrefix = this.hsSearchIndex
        .filter((r) => r.codeLower.startsWith(q))
        .slice(0, 20);
      const codeContains = this.hsSearchIndex
        .filter((r) => !r.codeLower.startsWith(q) && r.codeLower.includes(q))
        .slice(0, 20);
      const descContains = this.hsSearchIndex
        .filter(
          (r) =>
            !r.codeLower.includes(q) &&
            r.descriptionLower.includes(q)
        )
        .slice(0, 20);

      const merged = [...codePrefix, ...codeContains, ...descContains]
        .slice(0, 30)
        .map((r) => r.code);
      this.filteredHsCodeCodes.set(Array.from(new Set(merged)));
    }, 120);
  }

  onHsCodeSelect(line: InvoiceLineItem, event: { value?: unknown }) {
    const code = String(event?.value ?? '').trim();
    if (!code) return;
    line.hs_code = code;
    this.applySingleProductByHsCode(line, code);
    this.lines.update((lines) => [...lines]);
  }

  onHsCodeInputChange(line: InvoiceLineItem, value: string): void {
    line.hs_code = String(value ?? '').trim();
    const linked = line.product_id
      ? this.products().find((p) => p.id === line.product_id)
      : undefined;
    if (linked) {
      const pHs = (linked.hs_code || '').trim().toLowerCase();
      const cur = line.hs_code.trim().toLowerCase();
      if (pHs !== cur) {
        line.product_id = undefined;
      }
    }
    this.lines.update((lines) => [...lines]);
  }

  private applySingleProductByHsCode(line: InvoiceLineItem, code: string): void {
    const norm = code.trim().toLowerCase();
    const matches = this.products().filter(
      (p) => (p.hs_code || '').trim().toLowerCase() === norm
    );
    if (matches.length !== 1) {
      return;
    }
    const product = matches[0];
    line.description = product.name;
    line.product_id = product.id;
    line.unit_price = product.default_unit_price;
    line.tax_code = product.tax_code || 'A';
    line.tax_percent = product.tax_percent ?? 15.5;
    line.hs_code = product.hs_code || code;
    this.recalculateLine(line);
  }

  generateInvoiceNo() {
    const timestamp = Date.now().toString().slice(-8);
    this.invoiceNo = `INV-${timestamp}`;
  }

  searchProducts(event: any) {
    const query = String(event?.query ?? '').toLowerCase();
    const names = this.products()
      .filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          (p.description && p.description.toLowerCase().includes(query)) ||
          (p.hs_code && p.hs_code.toLowerCase().includes(query))
      )
      .map((p) => p.name);
    this.filteredProductNames.set(Array.from(new Set(names)));
  }

  searchBuyers(event: any) {
    const query = String(event?.query ?? '').toLowerCase().trim();
    this.filteredBuyers.set(
      this.buyers().filter(b =>
        b.display_name.toLowerCase().includes(query) ||
        (b.tin && b.tin.toLowerCase().includes(query))
      )
    );
  }

  onDescriptionSelect(line: InvoiceLineItem, event: { value: unknown }) {
    const selectedName = String(event?.value ?? '').trim();
    if (!selectedName) return;

    const product = this.products().find((p) => p.name.toLowerCase() === selectedName.toLowerCase());
    if (!product) return;

    line.description = product.name;
    line.product_id = product.id;
    line.unit_price = product.default_unit_price;
    line.tax_code = product.tax_code || 'A';
    line.tax_percent = product.tax_percent ?? 15.5;
    line.hs_code = product.hs_code;
    this.recalculateLine(line);
  }

  /** Free typing is allowed; only keep product link when text exactly matches a known product. */
  onDescriptionInputChange(line: InvoiceLineItem, value: string): void {
    const typed = String(value ?? '');
    line.description = typed;
    const exact = this.products().find((p) => p.name.toLowerCase() === typed.trim().toLowerCase());
    if (!exact) {
      const prev = line.product_id
        ? this.products().find((p) => p.id === line.product_id)
        : undefined;
      line.product_id = undefined;
      if (
        prev?.hs_code &&
        line.hs_code?.trim().toLowerCase() === (prev.hs_code || '').trim().toLowerCase()
      ) {
        line.hs_code = undefined;
      }
    }
    this.lines.update((lines) => [...lines]);
  }

  recalculateLine(line: InvoiceLineItem) {
    const subtotal = line.quantity * line.unit_price;

    if (this.taxInclusive) {
      // Tax is included in the unit price
      line.line_total = subtotal;
      line.tax_amount = subtotal - (subtotal / (1 + line.tax_percent / 100));
    } else {
      // Tax is added on top
      line.tax_amount = subtotal * (line.tax_percent / 100);
      line.line_total = subtotal;
    }

    // Notify signal dependents (totals) after mutating line object fields.
    this.lines.update((lines) => [...lines]);
  }

  onTaxInclusiveChange(): void {
    this.lines.update((lines) =>
      lines.map((line) => {
        const subtotal = line.quantity * line.unit_price;
        if (this.taxInclusive) {
          line.line_total = subtotal;
          line.tax_amount = subtotal - (subtotal / (1 + line.tax_percent / 100));
        } else {
          line.tax_amount = subtotal * (line.tax_percent / 100);
          line.line_total = subtotal;
        }
        return line;
      })
    );
  }

  addLine() {
    this.lines.update(lines => [...lines, this.createEmptyLine()]);
  }

  removeLine(index: number) {
    if (this.lines().length === 1) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Warning',
        detail: 'At least one line item is required'
      });
      return;
    }
    this.lines.update(lines => lines.filter((_, i) => i !== index));
  }

  login() {
    void this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
  }

  saveToLocalStorage() {
    if (!this.validate()) return;

    if (!this.isBrowser) return;

    const invoice = this.buildInvoiceData();

    // Get existing invoices from local storage
    const existingInvoices = this.getLocalInvoices();

    // Add new invoice
    existingInvoices.push({
      ...invoice,
      savedAt: new Date().toISOString()
    });

    // Save back to local storage
    localStorage.setItem(this.GUEST_INVOICES_KEY, JSON.stringify(existingInvoices));

    this.messageService.add({
      severity: 'success',
      summary: 'Invoice Saved',
      detail: 'Invoice saved to browser storage'
    });
  }

  downloadInvoice() {
    if (!this.validate()) return;

    this.downloading.set(true);

    try {
      const invoice = this.buildInvoiceData();

      this.invoicePdf.savePdf(invoice);

      // Also save to local storage if guest
      if (!this.isAuthenticated()) {
        this.saveToLocalStorage();
      }

      this.messageService.add({
        severity: 'success',
        summary: 'Invoice Downloaded',
        detail: 'Invoice downloaded as PDF'
      });
    } catch (error) {
      console.error('Failed to download invoice', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Download Failed',
        detail: 'Failed to download invoice'
      });
    } finally {
      this.downloading.set(false);
    }
  }

  private getLocalInvoices(): any[] {
    if (!this.isBrowser) return [];

    const stored = localStorage.getItem(this.GUEST_INVOICES_KEY);
    return stored ? JSON.parse(stored) : [];
  }

  private buildInvoiceData() {
    this.receiptDate = new Date();
    const totalExclTax = this.taxInclusive ? this.subtotal() - this.totalTax() : this.subtotal();

    const buyer = this.selectedBuyer;
    const buyerDisplay =
      buyer?.display_name?.trim() ||
      buyer?.name?.trim() ||
      buyer?.register_name?.trim() ||
      'Walk-in customer';

    const company = this.company();
    const sellerAddressParts = [
      company?.house_number,
      company?.address_line,
      company?.city,
      company?.province,
      company?.region,
      company?.station,
    ]
      .map((p) => String(p ?? '').trim())
      .filter(Boolean);
    const sellerAddress = sellerAddressParts.join(', ');

    const buyerAddressParts = [
      buyer?.address_house_no,
      buyer?.address_street,
      buyer?.address_city,
      buyer?.address_province,
      buyer?.address,
    ]
      .map((p) => String(p ?? '').trim())
      .filter(Boolean);
    const buyerAddress = buyerAddressParts.join(', ');

    return {
      invoice_no: this.invoiceNo,
      receipt_type: this.receiptType,
      receipt_date: this.receiptDate.toISOString(),
      tax_inclusive: this.taxInclusive,
      currency: this.currency,
      subtotal: this.subtotal(),
      total_tax: this.totalTax(),
      total_excl_tax: totalExclTax,
      grand_total: this.grandTotal(),
      payment_method: 'CASH',
      payment_amount: this.grandTotal(),
      buyer_display_name: buyerDisplay,
      seller: company
        ? {
            name: (company.trade_name || company.legal_name || '').trim(),
            physical_address: sellerAddress,
            phone: String(company.phone ?? '').trim(),
            email: String(company.email ?? '').trim(),
            vat_number: String(company.vat_number ?? '').trim(),
            tin: String(company.tin ?? '').trim(),
          }
        : undefined,
      buyer: buyer
        ? {
            name: buyerDisplay,
            physical_address: buyerAddress,
            phone: String(buyer.phone ?? '').trim(),
            email: String(buyer.email ?? '').trim(),
            vat_number: String(buyer.vat_number ?? '').trim(),
            tin: String(buyer.tin ?? '').trim(),
          }
        : undefined,
      notes: this.notes,
      lines: this.lines().map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_price,
        line_total: line.line_total,
        tax_percent: line.tax_percent,
        tax_amount: line.tax_amount,
        hs_code: line.hs_code || undefined,
      }))
    };
  }


  saveDraft() {
    if (!this.isAuthenticated()) {
      this.messageService.add({
        severity: 'info',
        summary: 'Login Required',
        detail: 'Please login to save invoices'
      });
      this.login();
      return;
    }

    if (this.invoiceSaveBlocked()) {
      this.saving.set(false);
      return;
    }

    if (!this.validate()) return;

    this.saving.set(true);

    const invoice = this.buildInvoicePayload('DRAFT');

    this.api.createInvoice(invoice).subscribe({
      next: (response) => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Invoice saved as draft'
        });
        this.saving.set(false);
        this.router.navigate(['/invoices']);
      },
      error: (error) => {
        console.error('Failed to save invoice', error);
        this.handleInvoiceApiError(error);
        this.saving.set(false);
      }
    });
  }

  saveAndFiscalize() {
    if (!this.isAuthenticated()) {
      this.messageService.add({
        severity: 'info',
        summary: 'Login Required',
        detail: 'Please login to fiscalize invoices'
      });
      this.login();
      return;
    }

    if (this.invoiceSaveBlocked()) {
      this.fiscalizing.set(false);
      return;
    }

    if (!this.validate()) return;
    this.fiscalizing.set(true);

    const invoice = this.buildInvoicePayload('DRAFT');

    // First create the invoice
    this.api.createInvoice(invoice).subscribe({
      next: (response) => {
        // Then fiscalize it
        this.api.fiscalizeInvoice(response.id!).subscribe({
          next: (fiscalResponse) => {
            this.messageService.add({
              severity: 'success',
              summary: 'Success',
              detail: 'Invoice fiscalized successfully'
            });
            this.fiscalizing.set(false);
            this.router.navigate(['/invoices']);
          },
          error: (error) => {
            console.error('Failed to fiscalize invoice', error);
            this.messageService.add({
              severity: 'error',
              summary: 'Fiscalization Error',
              detail: error.error?.message || 'Failed to fiscalize invoice'
            });
            this.fiscalizing.set(false);
          }
        });
      },
      error: (error) => {
        console.error('Failed to create invoice', error);
        this.handleInvoiceApiError(error);
        this.fiscalizing.set(false);
      }
    });
  }

  private validate(): boolean {
    if (!this.invoiceNo.trim()) {
      this.messageService.add({
        severity: 'error',
        summary: 'Validation Error',
        detail: 'Invoice number is required'
      });
      return false;
    }

    if (this.lines().length === 0) {
      this.messageService.add({
        severity: 'error',
        summary: 'Validation Error',
        detail: 'At least one line item is required'
      });
      return false;
    }

    for (const line of this.lines()) {
      if (!line.description.trim()) {
        this.messageService.add({
          severity: 'error',
          summary: 'Validation Error',
          detail: 'All line items must have a description'
        });
        return false;
      }
      if (line.quantity <= 0) {
        this.messageService.add({
          severity: 'error',
          summary: 'Validation Error',
          detail: 'Quantity must be greater than zero'
        });
        return false;
      }
    }

    return true;
  }

  private buildInvoicePayload(status: string): Partial<Invoice> {
    this.receiptDate = new Date();
    // Calculate tax totals by tax code
    const taxGroups = new Map<string, { tax_code: string; tax_percent: number; tax_amount: number; sales_amount: number }>();

    for (const line of this.lines()) {
      const key = `${line.tax_code}-${line.tax_percent}`;
      const existing = taxGroups.get(key);
      if (existing) {
        existing.tax_amount += line.tax_amount;
        existing.sales_amount += line.line_total;
      } else {
        taxGroups.set(key, {
          tax_code: line.tax_code,
          tax_percent: line.tax_percent,
          tax_amount: line.tax_amount,
          sales_amount: line.line_total,
        });
      }
    }

    const totalExclTax = this.taxInclusive ? this.subtotal() - this.totalTax() : this.subtotal();

    return {
      invoice_no: this.invoiceNo,
      receipt_type: this.receiptType,
      receipt_print_form: 'InvoiceA4',
      receipt_currency: this.currency,
      receipt_date: this.receiptDate.toISOString(),
      tax_inclusive: this.taxInclusive,
      receipt_total: this.grandTotal(),
      total_excl_tax: totalExclTax,
      total_vat: this.totalTax(),
      receipt_notes: this.notes,
      payment_method: 'CASH',
      payment_amount: this.grandTotal(),
      status: status as any,
      buyer_id: this.selectedBuyer?.id,
      lines: this.lines().map((line) => {
        return {
          product_id: line.product_id,
          description: line.description,
          quantity: line.quantity,
          unit_price: line.unit_price,
          line_total: line.line_total,
          tax_code: line.tax_code,
          tax_percent: line.tax_percent,
          tax_amount: line.tax_amount,
          hs_code: line.hs_code?.trim() || undefined,
        };
      }),
      taxes: Array.from(taxGroups.values()),
    };
  }

  private createEmptyLine(): InvoiceLineItem {
    return {
      description: '',
      hs_code: '',
      quantity: 1,
      unit_price: 0,
      line_total: 0,
      tax_code: 'A',
      tax_percent: 15.5,
      tax_amount: 0,
    };
  }

  clearForm() {
    if (confirm('Clear all form data?')) {
      this.lines.set([this.createEmptyLine()]);
      this.selectedBuyer = null;
      this.receiptDate = new Date();
      this.currency = 'USD';
      this.notes = '';
      this.generateInvoiceNo();
    }
  }
}
