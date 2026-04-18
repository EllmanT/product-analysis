import { Component, PLATFORM_ID, ViewChild, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { Table, TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ApiService, Buyer } from '../../services/api.service';

@Component({
  selector: 'app-buyers',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    TableModule,
    ToastModule,
  ],
  providers: [MessageService],
  template: `
    <div class="app-page app-page--full">
      <header class="app-page-header">
        <div>
          <h1 class="app-page-title">Buyers</h1>
          <p class="app-page-subtitle">Manage buyers used on invoices and fiscal receipts.</p>
        </div>
        <p-button label="Add buyer" icon="pi pi-plus" (onClick)="openDialog()" />
      </header>

      <section class="app-panel-card">
        <div class="filters">
          <div class="filter-field">
            <input
              type="text"
              pInputText
              [(ngModel)]="searchInput"
              placeholder="Search by name, TIN, email..."
              (input)="onSearchInput()"
            />
          </div>
        </div>

        <p-table
          #pt
          [value]="buyers()"
          [loading]="loading()"
          [paginator]="true"
          [rows]="pageSize"
          [rowsPerPageOptions]="[10, 15, 25, 50]"
          styleClass="p-datatable-striped app-full-width-table"
          [tableStyle]="{ width: '100%', 'min-width': '100%' }"
        >
          <ng-template #header>
            <tr>
              <th>Register name</th>
              <th>Trade name</th>
              <th>TIN</th>
              <th>Phone</th>
              <th>Email</th>
              <th style="width: 160px">Actions</th>
            </tr>
          </ng-template>
          <ng-template #body let-buyer>
            <tr>
              <td>{{ buyer.register_name || buyer.name || '—' }}</td>
              <td>{{ buyer.trade_name || '—' }}</td>
              <td>{{ buyer.tin || '—' }}</td>
              <td>{{ buyer.phone || '—' }}</td>
              <td>{{ buyer.email || '—' }}</td>
              <td>
                <p-button icon="pi pi-pencil" styleClass="p-button-text p-button-sm" (onClick)="editBuyer(buyer)" />
                <p-button icon="pi pi-trash" styleClass="p-button-text p-button-danger p-button-sm" (onClick)="deleteBuyer(buyer)" />
              </td>
            </tr>
          </ng-template>
          <ng-template #emptymessage>
            <tr>
              <td colspan="6" style="text-align:center;padding:2rem;">
                No buyers found. Click "Add buyer" to create one.
              </td>
            </tr>
          </ng-template>
        </p-table>
      </section>

      <p-dialog
        [(visible)]="dialogVisible"
        [header]="editMode() ? 'Edit buyer' : 'New buyer'"
        [modal]="true"
        [style]="{ width: '650px' }"
      >
        <div class="dialog-content">
          <div class="form-field">
            <label for="registerName">Register name *</label>
            <input id="registerName" type="text" pInputText [(ngModel)]="formData.register_name" />
          </div>

          <div class="form-field">
            <label for="tradeName">Trade name</label>
            <input id="tradeName" type="text" pInputText [(ngModel)]="formData.trade_name" />
          </div>

          <div class="form-row">
            <div class="form-field">
              <label for="tin">TIN</label>
              <input id="tin" type="text" pInputText [(ngModel)]="formData.tin" />
            </div>
            <div class="form-field">
              <label for="vatNumber">VAT number</label>
              <input id="vatNumber" type="text" pInputText [(ngModel)]="formData.vat_number" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-field">
              <label for="phone">Phone</label>
              <input id="phone" type="text" pInputText [(ngModel)]="formData.phone" />
            </div>
            <div class="form-field">
              <label for="email">Email</label>
              <input id="email" type="email" pInputText [(ngModel)]="formData.email" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-field">
              <label for="province">Province</label>
              <input id="province" type="text" pInputText [(ngModel)]="formData.address_province" />
            </div>
            <div class="form-field">
              <label for="city">City</label>
              <input id="city" type="text" pInputText [(ngModel)]="formData.address_city" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-field">
              <label for="street">Street</label>
              <input id="street" type="text" pInputText [(ngModel)]="formData.address_street" />
            </div>
            <div class="form-field">
              <label for="houseNo">House no</label>
              <input id="houseNo" type="text" pInputText [(ngModel)]="formData.address_house_no" />
            </div>
          </div>
        </div>

        <ng-template #footer>
          <p-button label="Cancel" styleClass="p-button-text" (onClick)="dialogVisible = false" />
          <p-button label="Save" [loading]="saving()" (onClick)="saveBuyer()" [disabled]="!isFormValid()" />
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

    .filters {
      margin-bottom: 1rem;
    }

    .filter-field {
      max-width: 420px;
    }

    .filter-field input {
      width: 100%;
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

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }
  `],
})
export class BuyersComponent {
  @ViewChild('pt') table?: Table;

  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly api = inject(ApiService);
  private readonly messageService = inject(MessageService);

  buyers = signal<Buyer[]>([]);
  loading = signal(false);
  saving = signal(false);
  editMode = signal(false);
  dialogVisible = false;

  readonly pageSize = 15;
  searchInput = '';
  private searchDebounce: ReturnType<typeof setTimeout> | undefined;
  private allBuyers: Buyer[] = [];

  formData: Partial<Buyer> = this.getEmptyForm();
  currentBuyerId: string | null = null;

  constructor() {
    if (this.isBrowser) {
      this.loadBuyers();
    }
  }

  loadBuyers(): void {
    this.loading.set(true);
    this.api.getBuyersList().subscribe({
      next: (rows) => {
        this.allBuyers = rows;
        this.buyers.set(rows);
        this.loading.set(false);
      },
      error: (error) => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: error?.error?.message || 'Failed to load buyers',
        });
      },
    });
  }

  onSearchInput(): void {
    clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => {
      const q = this.searchInput.trim().toLowerCase();
      if (!q) {
        this.buyers.set(this.allBuyers);
        return;
      }
      this.buyers.set(
        this.allBuyers.filter((buyer) =>
          [buyer.register_name, buyer.trade_name, buyer.tin, buyer.phone, buyer.email]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))
        )
      );
      this.table?.reset();
    }, 300);
  }

  openDialog(): void {
    this.editMode.set(false);
    this.formData = this.getEmptyForm();
    this.currentBuyerId = null;
    this.dialogVisible = true;
  }

  editBuyer(buyer: Buyer): void {
    this.editMode.set(true);
    this.currentBuyerId = buyer.id ?? null;
    this.formData = {
      register_name: buyer.register_name ?? buyer.name ?? '',
      trade_name: buyer.trade_name ?? '',
      tin: buyer.tin ?? '',
      vat_number: buyer.vat_number ?? '',
      address_province: buyer.address_province ?? '',
      address_city: buyer.address_city ?? '',
      address_street: buyer.address_street ?? '',
      address_house_no: buyer.address_house_no ?? '',
      phone: buyer.phone ?? '',
      email: buyer.email ?? '',
      is_active: buyer.is_active ?? true,
    };
    this.dialogVisible = true;
  }

  saveBuyer(): void {
    if (!this.isFormValid()) return;

    this.saving.set(true);
    const payload: Partial<Buyer> = {
      register_name: this.formData.register_name?.trim(),
      trade_name: this.optionalText(this.formData.trade_name),
      tin: this.optionalText(this.formData.tin),
      vat_number: this.optionalText(this.formData.vat_number),
      address_province: this.optionalText(this.formData.address_province),
      address_city: this.optionalText(this.formData.address_city),
      address_street: this.optionalText(this.formData.address_street),
      address_house_no: this.optionalText(this.formData.address_house_no),
      phone: this.optionalText(this.formData.phone),
      email: this.optionalText(this.formData.email),
      is_active: this.formData.is_active ?? true,
    };

    const operation = this.editMode() && this.currentBuyerId
      ? this.api.updateBuyer(this.currentBuyerId, payload)
      : this.api.createBuyer(payload);

    operation.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible = false;
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: `Buyer ${this.editMode() ? 'updated' : 'created'} successfully`,
        });
        this.loadBuyers();
      },
      error: (error) => {
        this.saving.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: error?.error?.message || `Failed to ${this.editMode() ? 'update' : 'create'} buyer`,
        });
      },
    });
  }

  deleteBuyer(buyer: Buyer): void {
    if (!buyer.id) return;
    if (!confirm(`Delete buyer "${buyer.register_name || buyer.name}"?`)) return;

    this.api.deleteBuyer(buyer.id).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Buyer deleted successfully',
        });
        this.loadBuyers();
      },
      error: (error) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: error?.error?.message || 'Failed to delete buyer',
        });
      },
    });
  }

  isFormValid(): boolean {
    return !!this.formData.register_name?.trim();
  }

  private getEmptyForm(): Partial<Buyer> {
    return {
      register_name: '',
      trade_name: '',
      tin: '',
      vat_number: '',
      address_province: '',
      address_city: '',
      address_street: '',
      address_house_no: '',
      phone: '',
      email: '',
      is_active: true,
    };
  }

  private optionalText(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  }
}
