import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, AxisPlan, AxisSubscription, AuthSessionUser, TenantDashboardCompany } from '../../services/api.service';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';

function normalizeSubscriptions(input: unknown): AxisSubscription[] {
  if (Array.isArray(input)) return input as AxisSubscription[];
  if (input && typeof input === 'object') {
    const anyObj = input as any;
    if (Array.isArray(anyObj.data)) return anyObj.data as AxisSubscription[];
    if (Array.isArray(anyObj.subscriptions)) return anyObj.subscriptions as AxisSubscription[];
  }
  return [];
}

function normalizePlans(input: unknown): AxisPlan[] {
  if (Array.isArray(input)) return input as AxisPlan[];
  if (input && typeof input === 'object') {
    const anyObj = input as any;
    if (Array.isArray(anyObj.data)) return anyObj.data as AxisPlan[];
    if (Array.isArray(anyObj.items)) return anyObj.items as AxisPlan[];
    if (Array.isArray(anyObj.plans)) return anyObj.plans as AxisPlan[];
  }
  return [];
}

@Component({
  selector: 'app-billing-history',
  standalone: true,
  imports: [CommonModule, CardModule, TableModule, TagModule, ButtonModule],
  templateUrl: './billing-history.component.html',
  styleUrl: './billing-history.component.css',
})
export class BillingHistoryComponent implements OnInit {
  private api = inject(ApiService);

  loading = signal(true);
  error = signal<string | null>(null);

  user = signal<AuthSessionUser | null>(null);
  company = signal<TenantDashboardCompany | null>(null);

  plans = signal<AxisPlan[]>([]);
  subscriptions = signal<AxisSubscription[]>([]);

  planNameById = computed(() => {
    const map = new Map<string, string>();
    for (const p of this.plans()) {
      const id = (p.id ?? p.plan_id) as any;
      if (id != null) map.set(String(id), (p.name ?? String(id)) as string);
    }
    return map;
  });

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loading.set(true);
    this.error.set(null);

    this.api.getAuthSession().subscribe({
      next: (session) => {
        this.user.set(session.user ?? null);
        this.company.set(session.company ?? null);

        const customerId = session.company?.axis_billing_customer_id ?? null;

        this.api.listAxisPlans().subscribe({
          next: (res) => this.plans.set(normalizePlans(res)),
          error: () => undefined,
        });

        if (customerId == null) {
          this.subscriptions.set([]);
          this.loading.set(false);
          return;
        }

        this.api.getAxisCustomerSubscriptions(customerId).subscribe({
          next: (res) => {
            this.subscriptions.set(normalizeSubscriptions(res));
            this.loading.set(false);
          },
          error: (err) => {
            this.error.set(err?.error?.message ?? 'Unable to load subscription history.');
            this.loading.set(false);
          },
        });
      },
      error: () => {
        this.error.set('Unable to load session.');
        this.loading.set(false);
      },
    });
  }

  planLabel(planId: unknown): string {
    const key = String(planId ?? '');
    return this.planNameById().get(key) ?? (key !== '' ? key : '-');
  }

  startDate(row: AxisSubscription): unknown {
    const r: any = row;
    return r?.start_date ?? r?.startDate ?? null;
  }

  endDate(row: AxisSubscription): unknown {
    const r: any = row;
    return r?.end_date ?? r?.endDate ?? null;
  }

  paymentPlatform(row: AxisSubscription): string {
    const r: any = row;
    return (r?.payment_platform ?? r?.paymentPlatform ?? '-') as string;
  }

  statusSeverity(status: unknown): 'success' | 'warn' | 'danger' | 'info' {
    const s = String(status ?? '').toLowerCase();
    if (s === 'active') return 'success';
    if (s === 'canceled' || s === 'cancelled') return 'danger';
    if (s === 'past_due' || s === 'paused') return 'warn';
    return 'info';
  }

  formatDate(value: unknown): string {
    if (typeof value !== 'string' || value.trim() === '') return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  }
}

