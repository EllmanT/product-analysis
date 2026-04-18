import { Component, ViewChild, signal, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Table, TableLazyLoadEvent, TableModule } from 'primeng/table';
import { InputTextModule } from 'primeng/inputtext';
import { CardModule } from 'primeng/card';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ApiService, TenantHsCode } from '../../services/api.service';

@Component({
  selector: 'app-hs-codes',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    InputTextModule,
    CardModule,
    ToggleSwitchModule,
    ButtonModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './hs-codes.component.html',
  styleUrl: './hs-codes.component.css',
})
export class HsCodesComponent {
  @ViewChild('dt') dt?: Table;

  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);
  private api = inject(ApiService);
  private messages = inject(MessageService);

  rows = signal<TenantHsCode[]>([]);
  savingHsCodeId = signal<string | null>(null);
  bulkSaving = signal(false);
  totalRecords = signal(0);
  loading = signal(false);

  searchInput = '';
  private searchApplied = '';
  private searchDebounce: ReturnType<typeof setTimeout> | undefined;

  readonly pageSize = 50;

  onLazyLoad(event: TableLazyLoadEvent): void {
    if (!this.isBrowser) return;

    const rows = event.rows ?? this.pageSize;
    const first = event.first ?? 0;
    const page = Math.floor(first / rows) + 1;

    this.loading.set(true);
    this.api
      .getCompanyHsCodes({
        page,
        per_page: rows,
        search: this.searchApplied || undefined,
      })
      .subscribe({
        next: (res) => {
          this.rows.set(res.data ?? []);
          this.totalRecords.set(res.total ?? 0);
          this.loading.set(false);
        },
        error: () => {
          this.rows.set([]);
          this.totalRecords.set(0);
          this.loading.set(false);
        },
      });
  }

  onSetAll(enabled: boolean): void {
    if (!this.isBrowser || this.bulkSaving()) {
      return;
    }
    if (
      !enabled &&
      !confirm(
        'Turn off “Use for my company” for every active HS code in the catalog? Inactive catalog codes stay unavailable.'
      )
    ) {
      return;
    }

    this.bulkSaving.set(true);
    this.api.setAllCompanyHsCodePreferences(enabled).subscribe({
      next: (res) => {
        this.bulkSaving.set(false);
        this.messages.add({
          severity: 'success',
          summary: enabled ? 'All enabled' : 'All disabled',
          detail: res.message ?? 'Preferences updated.',
        });
        this.dt?.reset();
      },
      error: (err) => {
        this.bulkSaving.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'Update failed',
          detail: err?.error?.message ?? 'Could not update HS code preferences.',
        });
      },
    });
  }

  onTenantToggle(row: TenantHsCode, enabled: boolean): void {
    if (this.bulkSaving()) {
      return;
    }
    if (!row.id || !row.is_active) {
      return;
    }
    const current = !!row.usable_for_company;
    if (current === enabled) {
      return;
    }

    this.savingHsCodeId.set(row.id);
    this.api
      .syncCompanyHsCodePreferences({
        items: [{ hs_code_id: row.id, is_enabled: enabled }],
      })
      .subscribe({
        next: () => {
          row.tenant_preference_enabled = enabled;
          row.usable_for_company = !!row.is_active && enabled;
          this.savingHsCodeId.set(null);
        },
        error: () => {
          this.savingHsCodeId.set(null);
          this.dt?.reset();
        },
      });
  }

  onSearchInput(): void {
    clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => {
      this.searchApplied = this.searchInput.trim();
      this.dt?.reset();
    }, 400);
  }
}
