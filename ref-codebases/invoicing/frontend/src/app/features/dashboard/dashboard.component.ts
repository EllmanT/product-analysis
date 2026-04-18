import { Component, OnInit, inject, signal, computed, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { ChartModule } from 'primeng/chart';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { ApiService, TenantDashboardResponse } from '../../services/api.service';
import { FiscalizationDialogService } from '../../services/fiscalization-dialog.service';
import { formatInvoiceStatus } from '../../utils/invoice-status';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    ChartModule,
    CardModule,
    ButtonModule,
    ProgressSpinnerModule,
    MessageModule,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit {
  private api = inject(ApiService);
  private fiscalizationDialog = inject(FiscalizationDialogService);
  private platformId = inject(PLATFORM_ID);

  loading = signal(true);
  error = signal<string | null>(null);
  data = signal<TenantDashboardResponse | null>(null);

  hasCompany = computed(() => {
    const d = this.data();
    return d !== null && 'has_company' in d && d.has_company === true;
  });

  companyName = computed(() => {
    const d = this.data();
    if (d && 'has_company' in d && d.has_company) {
      return d.company.trade_name || d.company.legal_name;
    }
    return '';
  });

  lineChartData = signal<Record<string, unknown>>({});
  lineChartOptions = signal<Record<string, unknown>>({});
  barChartData = signal<Record<string, unknown>>({});
  barChartOptions = signal<Record<string, unknown>>({});
  doughnutChartData = signal<Record<string, unknown>>({});
  doughnutChartOptions = signal<Record<string, unknown>>({});

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.error.set(null);
    this.loadDashboard();
  }

  openCompanySetupDialog(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.fiscalizationDialog.open();
  }

  loadDashboard(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.getDashboard().subscribe({
      next: (res) => {
        this.data.set(res);
        this.loading.set(false);
        if ('has_company' in res && res.has_company) {
          this.buildCharts(res);
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(this.toFriendlyErrorMessage(err));
      },
    });
  }

  private toFriendlyErrorMessage(err: unknown): string {
    const rawMessage = this.extractErrorMessage(err).toLowerCase();

    return this.extractErrorMessage(err);
  }

  private extractErrorMessage(err: unknown): string {
    const fallback = 'Could not load dashboard.';
    if (!err || typeof err !== 'object') {
      return fallback;
    }

    const value = err as { error?: { message?: string }; message?: string };
    return value.error?.message ?? value.message ?? fallback;
  }

  private buildCharts(res: Extract<TenantDashboardResponse, { has_company: true }>): void {
    const axisColor = '#64748b';
    const gridColor = 'rgba(148, 163, 184, 0.2)';

    const days = res.invoices_by_day;
    const labels = days.length ? days.map((d) => d.date) : ['—'];
    const counts = days.length ? days.map((d) => d.invoice_count) : [0];
    const revenues = days.length ? days.map((d) => d.revenue) : [0];

    this.lineChartData.set({
      labels,
      datasets: [
        {
          type: 'line',
          label: 'Revenue',
          data: revenues,
          borderColor: '#bc0515',
          backgroundColor: 'rgba(188, 5, 21, 0.12)',
          fill: true,
          tension: 0.35,
          yAxisID: 'y',
        },
        {
          type: 'bar',
          label: 'Invoices',
          data: counts,
          backgroundColor: 'rgba(30, 41, 59, 0.35)',
          borderColor: '#1e293b',
          borderWidth: 1,
          yAxisID: 'y1',
        },
      ],
    });

    this.lineChartOptions.set({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { color: axisColor } },
        title: {
          display: true,
          text: 'Last 30 days — invoices & revenue',
          color: '#0f172a',
          font: { size: 14, weight: '600' },
        },
        tooltip: {
          callbacks: {
            label: (ctx: { dataset?: { label?: string }; parsed?: { y: number } }) => {
              const v = ctx.parsed?.y ?? 0;
              if (ctx.dataset?.label === 'Revenue') {
                return ` Revenue: ${Number(v).toLocaleString()}`;
              }
              return ` ${ctx.dataset?.label}: ${v}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: axisColor, maxRotation: 45, minRotation: 0 },
          grid: { color: gridColor },
        },
        y: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'Revenue', color: axisColor },
          ticks: { color: axisColor },
          grid: { color: gridColor },
        },
        y1: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: 'Invoice count', color: axisColor },
          ticks: { color: axisColor, stepSize: 1 },
          grid: { drawOnChartArea: false },
        },
      },
    });

    const weeks = res.revenue_by_week;
    const weekLabels = weeks.length ? weeks.map((w) => w.period) : ['—'];
    const weekValues = weeks.length ? weeks.map((w) => w.revenue) : [0];
    this.barChartData.set({
      labels: weekLabels,
      datasets: [
        {
          label: 'Revenue',
          data: weekValues,
          backgroundColor: 'rgba(188, 5, 21, 0.75)',
          borderRadius: 6,
        },
      ],
    });

    this.barChartOptions.set({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: 'Revenue by week (12 weeks)',
          color: '#0f172a',
          font: { size: 14, weight: '600' },
        },
      },
      scales: {
        x: { ticks: { color: axisColor }, grid: { color: gridColor } },
        y: {
          ticks: { color: axisColor },
          grid: { color: gridColor },
          title: { display: true, text: 'Revenue', color: axisColor },
        },
      },
    });

    const statusRows = res.invoices_by_status;
    const palette = ['#1e293b', '#bc0515', '#0ea5e9', '#22c55e', '#eab308', '#8b5cf6', '#64748b'];
    const statusLabels = statusRows.length ? statusRows.map((s) => formatInvoiceStatus(s.status)) : ['No invoices'];
    const statusCounts = statusRows.length ? statusRows.map((s) => s.count) : [1];
    this.doughnutChartData.set({
      labels: statusLabels,
      datasets: [
        {
          data: statusCounts,
          backgroundColor: statusRows.length
            ? statusRows.map((_, i) => palette[i % palette.length])
            : ['#e2e8f0'],
          borderWidth: 2,
          borderColor: '#ffffff',
        },
      ],
    });

    this.doughnutChartOptions.set({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: axisColor, boxWidth: 12 } },
        title: {
          display: true,
          text: 'Invoices by status',
          color: '#0f172a',
          font: { size: 14, weight: '600' },
        },
      },
    });
  }
}
