import { Component, signal, PLATFORM_ID, inject, ViewChild, OnInit } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { Table, TableLazyLoadEvent, TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { MessageService } from 'primeng/api';
import { ApiService, Product, TaxRate, TenantHsCode } from '../../services/api.service';

type TaxSelectRow = TaxRate & { displayLabel: string; percent: number };

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    TableModule,
    DialogModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    ToastModule,
    AutoCompleteModule,
  ],
  providers: [MessageService],
  template: `
    <div class="app-page app-page--full">
      <header class="app-page-header">
        <div>
          <h1 class="app-page-title">Products</h1>
          <p class="app-page-subtitle">Manage your catalog — prices, tax defaults, and units used on invoices.</p>
        </div>
        <p-button label="Add product" icon="pi pi-plus" (onClick)="openDialog()" />
      </header>

      <section class="app-panel-card">
      <div class="filters">
        <div class="filter-field">
          <input
            type="text"
            pInputText
            [(ngModel)]="searchInput"
            placeholder="Search name, description, HS code…"
            (input)="onSearchInput()"
          />
        </div>
        <div class="filter-field filter-field--narrow">
          <p-select
            [(ngModel)]="activeFilter"
            [options]="activeOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="Status"
            (onChange)="onActiveFilterChange()"
            [showClear]="true"
          />
        </div>
      </div>

      <p-table
        #pt
        [value]="products()"
        [loading]="loading()"
        [lazy]="true"
        (onLazyLoad)="onLazyLoad($event)"
        [paginator]="true"
        [rows]="pageSize"
        [totalRecords]="totalRecords()"
        [rowsPerPageOptions]="[10, 15, 25, 50]"
        styleClass="p-datatable-striped app-full-width-table"
        [tableStyle]="{ width: '100%', 'min-width': '100%' }"
      >
        <ng-template #header>
          <tr>
            <th>Name</th>
            <th>Description</th>
            <th>Unit Price</th>
            <th>Tax %</th>
            <th>Unit</th>
            <th>Status</th>
            <th style="width: 150px">Actions</th>
          </tr>
        </ng-template>
        <ng-template #body let-product>
          <tr>
            <td>{{ product.name }}</td>
            <td>{{ product.description }}</td>
            <td>{{ product.default_unit_price | number: '1.2-2' }}</td>
            <td>{{ product.tax_percent || 0 }}%</td>
            <td>{{ product.unit_of_measure || '—' }}</td>
            <td>
              <span [class]="product.is_active ? 'badge badge-success' : 'badge badge-danger'">
                {{ product.is_active ? 'Active' : 'Inactive' }}
              </span>
            </td>
            <td>
              <p-button icon="pi pi-pencil" styleClass="p-button-text p-button-sm" (onClick)="editProduct(product)" />
              <p-button icon="pi pi-trash" styleClass="p-button-text p-button-danger p-button-sm" (onClick)="deleteProduct(product)" />
            </td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr>
            <td colspan="7" style="text-align: center; padding: 2rem;">
              No products found. Click "Add Product" to create one.
            </td>
          </tr>
        </ng-template>
      </p-table>
      </section>

      <p-dialog
        [(visible)]="dialogVisible"
        [header]="editMode() ? 'Edit Product' : 'New Product'"
        [modal]="true"
        [style]="{ width: '600px' }">
        <div class="dialog-content">
          <div class="form-field">
            <label for="name">Product Name *</label>
            <input
              id="name"
              type="text"
              pInputText
              [(ngModel)]="formData.name"
              class="form-input"
              placeholder="Enter product name" />
          </div>

          <div class="form-field">
            <label for="hsCode">HS code</label>
            <p-autoComplete
              inputId="hsCode"
              [(ngModel)]="formData.hs_code"
              (ngModelChange)="onHsCodeInputChange($event)"
              [suggestions]="filteredHsCodeCodes()"
              (completeMethod)="searchHsCodes($event)"
              (onSelect)="onHsCodeSelect($event)"
              placeholder="Pick from codes enabled for your company or type a code"
              [dropdown]="true"
              [forceSelection]="false"
              class="form-input"
            >
              <ng-template let-code #item>
                <div class="hs-suggest-item">
                  <span class="hs-suggest-code">{{ code }}</span>
                  @let hint = hsCodeDescription(code);
                  @if (hint) {
                    <span class="text-muted hs-suggest-desc">{{ hint }}</span>
                  }
                </div>
              </ng-template>
            </p-autoComplete>
            <p class="field-hint">Only HS codes enabled for your company (see <strong>HS codes</strong>) can be saved.</p>
          </div>

          <div class="form-field">
            <label for="description">Description</label>
            <input
              id="description"
              type="text"
              pInputText
              [(ngModel)]="formData.description"
              class="form-input"
              placeholder="Product description" />
          </div>

          <div class="form-field">
            <label for="price">Unit Price *</label>
            <p-inputNumber
              [(ngModel)]="formData.default_unit_price"
              inputId="price"
              mode="decimal"
              [minFractionDigits]="2"
              [maxFractionDigits]="2"
            />
          </div>

          <div class="form-field">
            <label for="taxCodeSel">Tax *</label>
            <p-select
              inputId="taxCodeSel"
              [(ngModel)]="formData.tax_code"
              (ngModelChange)="onTaxCodeChange($event)"
              [options]="taxRates()"
              optionLabel="displayLabel"
              optionValue="code"
              placeholder="Select tax"
              appendTo="body"
              styleClass="w-full"
            />
            <p class="field-hint">Rates are defined under <strong>Settings → Tax rates</strong>. The server sets the percentage from the selected code.</p>
          </div>

          <div class="form-field">
            <label for="unit">Unit of measure</label>
            <p-autoComplete
              inputId="unit"
              [(ngModel)]="formData.unit_of_measure"
              (ngModelChange)="onUnitOfMeasureInputChange($event)"
              [suggestions]="filteredUnitNames()"
              (completeMethod)="searchUnits($event)"
              (onSelect)="onUnitSelect($event)"
              placeholder="Pick a saved unit or type a new name"
              [dropdown]="true"
              [forceSelection]="false"
              class="form-input"
            />
            <p class="field-hint">Manage the list under <strong>Settings → Units of measure</strong>. New names are saved when you create or update the product.</p>
          </div>

          <div class="form-field-checkbox">
            <input
              id="isActive"
              type="checkbox"
              [(ngModel)]="formData.is_active" />
            <label for="isActive">Active</label>
          </div>
        </div>

        <ng-template #footer>
          <p-button label="Cancel" styleClass="p-button-text" (onClick)="dialogVisible = false" />
          <p-button label="Save" [loading]="saving()" (onClick)="saveProduct()" [disabled]="!isFormValid()" />
        </ng-template>
      </p-dialog>

      <p-toast />
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      max-width: 100%;
    }

    .app-page {
      width: 100% !important;
      max-width: none !important;
      margin: 0 !important;
      padding-top: 1rem !important;
      min-height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
    }

    .app-panel-card {
      background: #ffffff !important;
      border: 1px solid #dbe4ef !important;
      border-radius: 14px !important;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08) !important;
      padding: 1.25rem 1.5rem !important;
      width: 100% !important;
      max-width: none !important;
      flex: 1 1 auto;
      min-height: calc(100vh - 220px);
    }

    :host ::ng-deep .app-full-width-table,
    :host ::ng-deep .app-full-width-table .p-datatable-table-container,
    :host ::ng-deep .app-full-width-table .p-datatable-table {
      width: 100% !important;
      min-width: 100% !important;
    }

    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      align-items: center;
      margin-bottom: 1.25rem;
    }

    .filter-field {
      flex: 1;
      min-width: 200px;
    }

    .filter-field--narrow {
      flex: 0 0 200px;
      min-width: 160px;
    }

    .dialog-content {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding: 1rem 0;
    }

    .form-field {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .form-field label {
      font-weight: 500;
      font-size: 0.9rem;
    }

    .form-input {
      width: 100%;
    }

    :host ::ng-deep .form-field p-autoComplete,
    :host ::ng-deep .form-field p-autoComplete .p-autocomplete,
    :host ::ng-deep .form-field p-autoComplete input {
      width: 100%;
    }

    :host ::ng-deep .form-field p-select,
    :host ::ng-deep .form-field p-select .p-select {
      width: 100%;
    }

    .field-hint {
      margin: 0;
      font-size: 0.8rem;
      color: #6b7280;
      line-height: 1.35;
    }

    .text-muted {
      color: #6b7280;
    }

    .hs-suggest-item {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      padding: 0.25rem 0;
      max-width: 22rem;
    }

    .hs-suggest-code {
      font-weight: 600;
      font-family: ui-monospace, monospace;
    }

    .hs-suggest-desc {
      font-size: 0.8rem;
      line-height: 1.25;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }

    .form-field-checkbox {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .badge {
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .badge-success {
      background: #d4edda;
      color: #155724;
    }

    .badge-danger {
      background: #f8d7da;
      color: #721c24;
    }
  `]
})
export class ProductsComponent implements OnInit {
  @ViewChild('pt') productsTable?: Table;

  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  products = signal<Product[]>([]);
  totalRecords = signal(0);
  loading = signal(false);
  saving = signal(false);
  editMode = signal(false);
  dialogVisible = false;

  readonly pageSize = 15;
  searchInput = '';
  activeFilter: boolean | null = null;
  activeOptions = [
    { label: 'Active only', value: true },
    { label: 'Inactive only', value: false },
  ];

  private searchApplied = '';
  private activeApplied: boolean | null = null;
  private searchDebounce: ReturnType<typeof setTimeout> | undefined;

  formData: Partial<Product> = this.getEmptyForm();
  currentProductId: string | null = null;

  hsCodeSearchResults = signal<TenantHsCode[]>([]);
  filteredHsCodeCodes = signal<string[]>([]);
  private hsCodeSearchDebounce: ReturnType<typeof setTimeout> | undefined;

  taxRates = signal<TaxSelectRow[]>([]);
  unitNamesList = signal<string[]>([]);
  filteredUnitNames = signal<string[]>([]);

  constructor(
    private api: ApiService,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    // Defer dialog-only lookups (HS codes, tax rates, units) until the user opens
    // the product create/edit dialog. This keeps initial page load fast.
  }

  private loadTaxRates(): void {
    this.api.getTaxRates().subscribe({
      next: (rows) => {
        this.taxRates.set(
          rows.map((r) => {
            const p = typeof r.percent === 'string' ? parseFloat(r.percent) : Number(r.percent);
            return {
              ...r,
              percent: p,
              displayLabel: `${r.code} — ${r.label} (${p}%)`,
            };
          })
        );
      },
      error: () => this.taxRates.set([]),
    });
  }

  private loadUnitNames(): void {
    this.api.getUnitsOfMeasure({ per_page: 500 }).subscribe({
      next: (res) => {
        const names = (res.data ?? []).map((u) => u.name);
        this.unitNamesList.set(Array.from(new Set(names)));
      },
      error: () => this.unitNamesList.set([]),
    });
  }

  onTaxCodeChange(code: string | null): void {
    if (!code) {
      return;
    }
    const row = this.taxRates().find((t) => t.code === code);
    if (row) {
      this.formData.tax_percent = row.percent;
    }
  }

  searchUnits(event: { query?: string }): void {
    const q = String(event?.query ?? '').trim().toLowerCase();
    const list = this.unitNamesList();
    const names = !q
      ? list.slice(0, 40)
      : list.filter((n) => n.toLowerCase().includes(q)).slice(0, 50);
    this.filteredUnitNames.set(names);
  }

  onUnitSelect(event: { value?: unknown }): void {
    this.formData.unit_of_measure = String(event?.value ?? '').trim();
  }

  onUnitOfMeasureInputChange(value: unknown): void {
    this.formData.unit_of_measure = String(value ?? '').trim();
  }

  hsCodeDescription(code: string): string {
    const c = code.trim().toLowerCase();
    const row = this.hsCodeSearchResults().find((h) => h.code.toLowerCase() === c);
    return row?.description ?? '';
  }

  searchHsCodes(event: { query?: string }): void {
    const raw = String(event?.query ?? '');
    const q = raw.trim();

    clearTimeout(this.hsCodeSearchDebounce);
    this.hsCodeSearchDebounce = setTimeout(() => {
      const normalized = q.trim();
      if (normalized.length < 2) {
        this.hsCodeSearchResults.set([]);
        this.filteredHsCodeCodes.set([]);
        return;
      }

      this.api.getCompanyHsCodes({ per_page: 50, usable_only: true, search: normalized }).subscribe({
        next: (res) => {
          const rows = res.data ?? [];
          this.hsCodeSearchResults.set(rows);
          this.filteredHsCodeCodes.set(
            Array.from(new Set(rows.map((h) => h.code))).slice(0, 50)
          );
        },
        error: () => {
          this.hsCodeSearchResults.set([]);
          this.filteredHsCodeCodes.set([]);
        },
      });
    }, 250);
  }

  onHsCodeInputChange(value: unknown): void {
    this.formData.hs_code = String(value ?? '').trim();
  }

  onHsCodeSelect(event: { value?: unknown }): void {
    const code = String(event?.value ?? '').trim();
    if (!code) return;
    this.formData.hs_code = code;
    const row = this.hsCodeSearchResults().find(
      (h) => h.code.toLowerCase() === code.toLowerCase()
    );
    const tc = row?.default_tax_code?.trim().toUpperCase();
    if (tc === 'A' || tc === 'B' || tc === 'C') {
      this.formData.tax_code = tc;
      this.onTaxCodeChange(tc);
    }
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    if (!this.isBrowser) return;

    const rows = event.rows ?? this.pageSize;
    const first = event.first ?? 0;
    const page = Math.floor(first / rows) + 1;

    this.loading.set(true);
    const params: Record<string, string | number | boolean> = { page, per_page: rows };
    if (this.searchApplied) params['search'] = this.searchApplied;
    if (this.activeApplied !== null) params['is_active'] = this.activeApplied;

    this.api.getProducts(params).subscribe({
      next: (response) => {
        this.products.set(response.data || []);
        this.totalRecords.set(response.total ?? 0);
        this.loading.set(false);
      },
      error: (error) => {
        console.error('Failed to load products', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: error.error?.message || 'Failed to load products',
        });
        this.products.set([]);
        this.totalRecords.set(0);
        this.loading.set(false);
      },
    });
  }

  onSearchInput(): void {
    clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => {
      this.searchApplied = this.searchInput.trim();
      this.productsTable?.reset();
    }, 400);
  }

  onActiveFilterChange(): void {
    this.activeApplied = this.activeFilter;
    this.productsTable?.reset();
  }

  private reloadTable(): void {
    this.productsTable?.reset();
  }

  openDialog() {
    this.editMode.set(false);
    this.formData = this.getEmptyForm();
    this.currentProductId = null;
    this.loadUnitNames();
    this.loadTaxRates();
    this.hsCodeSearchResults.set([]);
    this.filteredHsCodeCodes.set([]);
    this.dialogVisible = true;
  }

  editProduct(product: Product) {
    this.editMode.set(true);
    this.formData = { ...product };
    this.currentProductId = product.id!;
    this.loadUnitNames();
    this.loadTaxRates();
    this.hsCodeSearchResults.set([]);
    this.filteredHsCodeCodes.set([]);
    this.onTaxCodeChange(this.formData.tax_code ?? null);
    this.dialogVisible = true;
  }

  deleteProduct(product: Product) {
    if (!confirm(`Are you sure you want to delete "${product.name}"?`)) {
      return;
    }

    this.api.deleteProduct(product.id!).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Product deleted successfully'
        });
        this.reloadTable();
      },
      error: (error) => {
        console.error('Failed to delete product', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to delete product'
        });
      }
    });
  }

  saveProduct() {
    if (!this.isFormValid()) return;

    this.saving.set(true);

    const payload: Partial<Product> = {
      ...this.formData,
      hs_code: this.formData.hs_code?.trim() || undefined,
    };

    const operation = this.editMode()
      ? this.api.updateProduct(this.currentProductId!, payload)
      : this.api.createProduct(payload);

    operation.subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: `Product ${this.editMode() ? 'updated' : 'created'} successfully`
        });
        this.dialogVisible = false;
        this.saving.set(false);
        this.reloadTable();
      },
      error: (error) => {
        console.error('Failed to save product', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: `Failed to ${this.editMode() ? 'update' : 'create'} product`
        });
        this.saving.set(false);
      }
    });
  }

  isFormValid(): boolean {
    return !!(
      this.formData.name?.trim() &&
      this.formData.default_unit_price !== undefined &&
      this.formData.default_unit_price > 0
    );
  }

  private getEmptyForm(): Partial<Product> {
    return {
      name: '',
      description: '',
      default_unit_price: 0,
      tax_code: 'A',
      tax_percent: 15.5,
      unit_of_measure: 'pcs',
      hs_code: '',
      is_active: true,
    };
  }
}
