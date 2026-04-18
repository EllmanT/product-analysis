import { Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ApiService, TaxRate } from '../../services/api.service';

@Component({
  selector: 'app-settings-taxes',
  standalone: true,
  imports: [CommonModule, TableModule, ToastModule],
  providers: [MessageService],
  template: `
    <header class="app-page-header">
      <div>
        <h1 class="app-page-title">Tax rates</h1>
        <p class="app-page-subtitle">
          Reference tax codes used on products and invoices. Values are system-defined and cannot be edited here.
        </p>
      </div>
    </header>
    <section class="app-panel-card">
      <p-table [value]="rows()" [loading]="loading()" styleClass="p-datatable-striped app-full-width-table">
        <ng-template #header>
          <tr>
            <th>Code</th>
            <th>Label</th>
            <th>Rate %</th>
          </tr>
        </ng-template>
        <ng-template #body let-r>
          <tr>
            <td>
              <code>{{ r.code }}</code>
            </td>
            <td>{{ r.label }}</td>
            <td>{{ r.percent | number: '1.2-2' }}</td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr>
            <td colspan="3" class="empty">No tax rates. Run <code>php artisan db:seed --class=TaxRateSeeder</code> on the API.</td>
          </tr>
        </ng-template>
      </p-table>
    </section>
    <p-toast />
  `,
  styles: [
    `
      .empty {
        text-align: center;
        padding: 2rem;
      }
    `,
  ],
})
export class SettingsTaxesComponent implements OnInit {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  rows = signal<TaxRate[]>([]);
  loading = signal(false);

  constructor(
    private api: ApiService,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    if (!this.isBrowser) return;
    this.loading.set(true);
    this.api.getTaxRates().subscribe({
      next: (list) => {
        this.rows.set(
          list.map((r) => ({
            ...r,
            percent: typeof r.percent === 'string' ? parseFloat(r.percent) : Number(r.percent),
          }))
        );
        this.loading.set(false);
      },
      error: () => {
        this.rows.set([]);
        this.loading.set(false);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load tax rates' });
      },
    });
  }
}
