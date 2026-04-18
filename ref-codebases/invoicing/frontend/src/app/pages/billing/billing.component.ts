import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, AuthSessionUser, AxisPlan, AxisSubscription, TenantDashboardCompany } from '../../services/api.service';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

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

function extractCustomerId(input: unknown): number | null {
  if (input == null) return null;
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input === 'string' && input.trim() !== '' && !Number.isNaN(Number(input))) return Number(input);

  if (typeof input !== 'object') return null;
  const obj: any = input;

  const direct = extractCustomerId(obj.customer_id);
  if (direct != null) return direct;

  const nested = extractCustomerId(obj.customer?.id);
  if (nested != null) return nested;

  const nestedData = extractCustomerId(obj.data?.customer_id) ?? extractCustomerId(obj.data?.customer?.id);
  if (nestedData != null) return nestedData;

  return null;
}

@Component({
  selector: 'app-billing',
  standalone: true,
  imports: [CommonModule, CardModule, TableModule, TagModule, ButtonModule, ToastModule, RouterLink],
  providers: [MessageService],
  templateUrl: './billing.component.html',
  styleUrl: './billing.component.css',
})
export class BillingComponent implements OnInit {
  private api = inject(ApiService);
  private messages = inject(MessageService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  loading = signal(true);
  subscribingPlanId = signal<string | number | null>(null);
  error = signal<string | null>(null);

  user = signal<AuthSessionUser | null>(null);
  company = signal<TenantDashboardCompany | null>(null);
  plans = signal<AxisPlan[]>([]);
  subscriptions = signal<AxisSubscription[]>([]);
  showPlans = signal(false);

  activeSubscription = computed(() =>
    this.subscriptions().some((s) => String((s as any).status ?? '').toLowerCase() === 'active')
  );

  activeSubscriptionRow = computed(() => {
    const rows = this.subscriptions();
    return rows.find((s) => String((s as any).status ?? '').toLowerCase() === 'active') ?? null;
  });

  activeExpiryLabel = computed(() => {
    const row: any = this.activeSubscriptionRow();
    const end = row?.end_date ?? row?.endDate ?? null;
    if (typeof end !== 'string' || end.trim() === '') return '—';
    const d = new Date(end);
    if (Number.isNaN(d.getTime())) return end;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  });

  planNameById = computed(() => {
    const map = new Map<string, string>();
    for (const p of this.plans()) {
      const id = this.planId(p);
      if (id == null) continue;
      map.set(String(id), p.name ?? String(id));
    }
    return map;
  });

  activePlanLabel = computed(() => {
    const row: any = this.activeSubscriptionRow();
    const planId = row?.plan_id ?? row?.planId ?? null;
    if (planId == null) return '—';
    return this.planNameById().get(String(planId)) ?? String(planId);
  });

  activeStartLabel = computed(() => {
    const row: any = this.activeSubscriptionRow();
    const start = row?.start_date ?? row?.startDate ?? null;
    if (typeof start !== 'string' || start.trim() === '') return '—';
    const d = new Date(start);
    if (Number.isNaN(d.getTime())) return start;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  });

  activePaymentPlatform = computed(() => {
    const row: any = this.activeSubscriptionRow();
    const v = row?.payment_platform ?? row?.paymentPlatform ?? null;
    if (typeof v !== 'string' || v.trim() === '') return '—';
    return v;
  });

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const status = (params.get('status') ?? '').toLowerCase();
      const checkoutSessionId = params.get('checkout_session_id');
      const subscriptionId = params.get('subscription_id');

      if (status === 'succeeded') {
        this.messages.add({
          severity: 'success',
          summary: 'Payment succeeded',
          detail: checkoutSessionId ? `Checkout session ${checkoutSessionId} succeeded.` : 'Your payment succeeded.',
        });

        if (subscriptionId) {
          this.loading.set(true);
          this.api.activateAxisSubscription(subscriptionId).subscribe({
            next: () => {
              this.messages.add({
                severity: 'success',
                summary: 'Subscription activated',
                detail: 'Your subscription is now active.',
              });
              this.refresh();
              this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
            },
            error: (err) => {
              this.loading.set(false);
              this.messages.add({
                severity: 'error',
                summary: 'Activation failed',
                detail: err?.error?.message ?? 'Payment succeeded, but we could not activate the subscription yet.',
              });
            },
          });
        }
      } else if (status === 'failed') {
        this.messages.add({
          severity: 'error',
          summary: 'Payment failed',
          detail: checkoutSessionId ? `Checkout session ${checkoutSessionId} failed.` : 'Your payment failed.',
        });
        this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
      }
    });

    this.refresh();
  }

  refresh(): void {
    this.loading.set(true);
    this.error.set(null);
    this.plans.set([]);

    this.api.getAuthSession().subscribe({
      next: (session) => {
        this.user.set(session.user ?? null);
        this.company.set(session.company ?? null);
        const customerId = session.company?.axis_billing_customer_id ?? null;

        this.api.listAxisPlans().subscribe({
          next: (res) => this.plans.set(normalizePlans(res)),
          error: () => undefined,
        });

        this.loadSubscriptions(customerId);
      },
      error: () => {
        this.error.set('Unable to load session.');
        this.loading.set(false);
      },
    });
  }

  openUpgrade(): void {
    this.showPlans.set(true);
    this.messages.add({
      severity: 'info',
      summary: 'Choose a plan',
      detail: 'Select a plan below to subscribe.',
    });
  }

  private loadSubscriptions(customerId: number | null): void {
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
        this.error.set(err?.error?.message ?? 'Unable to load subscriptions.');
        this.loading.set(false);
      },
    });
  }

  subscribeToPlan(plan: AxisPlan): void {
    if (this.subscribingPlanId() != null) {
      return;
    }

    const customerId = this.company()?.axis_billing_customer_id ?? null;
    const planId = this.planId(plan);
    if (planId == null) {
      this.messages.add({
        severity: 'error',
        summary: 'Invalid plan',
        detail: 'Plan id is missing.',
      });
      return;
    }

    this.subscribingPlanId.set(planId);

    const companyName = (this.company()?.legal_name ?? '').trim();
    const userEmail = (this.user()?.email ?? '').trim();
    const customer =
      customerId == null
        ? {
            name: companyName !== '' ? companyName : 'Customer',
            ...(userEmail !== '' ? { email: userEmail } : {}),
          }
        : undefined;

    this.api
      .createAxisCheckoutSession({
        plan_id: Number(planId),
        callback_url: `${window.location.origin}/billing`,
        external_reference: this.company()?.id ?? undefined,
        ...(customerId != null ? { customer_id: Number(customerId) } : {}),
        ...(customer ? { customer } : {}),
        metadata: {
          app: 'e-invoicing',
          company_id: this.company()?.id ?? undefined,
        },
      })
      .subscribe({
        next: (res) => {
          const url = (res as any)?.data?.url ?? (res as any)?.url ?? null;
          if (typeof url === 'string' && url.trim() !== '') {
            this.messages.add({
              severity: 'info',
              summary: 'Redirecting to checkout',
              detail: 'Complete payment on Axis Billing to activate your subscription.',
            });
            window.location.assign(url);
            return;
          }

          this.subscribingPlanId.set(null);
          this.messages.add({
            severity: 'error',
            summary: 'Checkout unavailable',
            detail: 'Axis Billing did not return a checkout URL.',
          });
        },
        error: (err) => {
          this.subscribingPlanId.set(null);
          this.messages.add({
            severity: 'error',
            summary: 'Subscription failed',
            detail: err?.error?.message ?? 'Unable to start checkout.',
          });
        },
      });
  }

  cancelActive(): void {
    const active = this.activeSubscriptionRow() as any;
    const id = active?.subscription_id ?? active?.id;
    if (!id) return;

    this.api.cancelAxisSubscription(id, {}).subscribe({
      next: () => {
        this.messages.add({
          severity: 'success',
          summary: 'Cancellation requested',
          detail: 'Your subscription cancellation was sent.',
        });
        this.refresh();
      },
      error: (err) => {
        this.messages.add({
          severity: 'error',
          summary: 'Cancel failed',
          detail: err?.error?.message ?? 'Unable to cancel subscription.',
        });
      },
    });
  }

  statusSeverity(status: unknown): 'success' | 'warn' | 'danger' | 'info' {
    const s = String(status ?? '').toLowerCase();
    if (s === 'active') return 'success';
    if (s === 'canceled' || s === 'cancelled') return 'danger';
    if (s === 'past_due' || s === 'paused') return 'warn';
    return 'info';
  }

  planPriceLabel(plan: AxisPlan): string {
    const price = plan.price ?? plan.amount ?? null;
    const currency = plan.currency ?? '';
    const interval = plan.interval ?? plan.billing_interval ?? '';
    const priceStr = price == null ? 'Custom' : `${price} ${currency}`.trim();
    if (!interval) return priceStr;
    return `${priceStr} / ${interval}`;
  }

  planId(plan: AxisPlan): string | number | null {
    return plan.id ?? plan.plan_id ?? null;
  }
}

