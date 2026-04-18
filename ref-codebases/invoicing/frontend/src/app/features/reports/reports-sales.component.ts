import { Component, OnInit, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { ChartModule } from 'primeng/chart';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { DatePicker } from 'primeng/datepicker';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { ApiService, SalesReportResponse } from '../../services/api.service';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

@Component({
  selector: 'app-reports-sales',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ChartModule,
    ButtonModule,
    SelectModule,
    DatePicker,
    ProgressSpinnerModule,
    MessageModule,
    TableModule,
  ],
  templateUrl: './reports-sales.component.html',
  styleUrls: ['./reports-shared.css', './reports-sales.component.css'],
})
export class ReportsSalesComponent implements OnInit {
  private api = inject(ApiService);
  private platformId = inject(PLATFORM_ID);
  loading = signal(true);
  error = signal<string | null>(null);
  report = signal<SalesReportResponse | null>(null);

  fromDate: Date | null = null;
  toDate: Date | null = null;
  groupBy: 'day' | 'week' | 'month' = 'day';

  groupOptions = [
    { label: 'By day', value: 'day' as const },
    { label: 'By week', value: 'week' as const },
    { label: 'By month', value: 'month' as const },
  ];

  chartData = signal<Record<string, unknown>>({});
  chartOptions = signal<Record<string, unknown>>({});

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - 29);
    this.fromDate = start;
    this.toDate = end;

    this.error.set(null);
    this.loadReport();
  }

  presetLast7Days(): void {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    this.fromDate = start;
    this.toDate = end;
    this.loadReport();
  }

  presetLast30Days(): void {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - 29);
    this.fromDate = start;
    this.toDate = end;
    this.loadReport();
  }

  presetThisMonth(): void {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    this.fromDate = start;
    this.toDate = end;
    this.loadReport();
  }

  loadReport(): void {
    if (!this.fromDate || !this.toDate) {
      return;
    }
    const from = formatLocalYmd(this.fromDate);
    const to = formatLocalYmd(this.toDate);
    if (from > to) {
      this.error.set('From date must be before or equal to to date.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.api.getSalesReport({ from, to, group_by: this.groupBy }).subscribe({
      next: (res) => {
        this.report.set(res);
        this.loading.set(false);
        this.buildChart(res);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(this.toFriendlyErrorMessage(err));
      },
    });
  }

  private toFriendlyErrorMessage(err: unknown): string {
    return this.extractErrorMessage(err);
  }

  private extractErrorMessage(err: unknown): string {
    const fallback = 'Could not load report.';
    if (!err || typeof err !== 'object') {
      return fallback;
    }

    const value = err as { error?: { message?: string }; message?: string };
    return value.error?.message ?? value.message ?? fallback;
  }

  private buildChart(res: SalesReportResponse): void {
    const axisColor = '#64748b';
    const gridColor = 'rgba(148, 163, 184, 0.2)';
    const series = res.series;
    const labels = series.length ? series.map((r) => r.period) : ['—'];
    const revenues = series.length ? series.map((r) => r.revenue) : [0];
    const counts = series.length ? series.map((r) => r.invoice_count) : [0];

    const groupLabel =
      res.group_by === 'day' ? 'day' : res.group_by === 'week' ? 'week' : 'month';

    this.chartData.set({
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

    this.chartOptions.set({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { color: axisColor } },
        title: {
          display: true,
          text: `Sales by ${groupLabel} (${res.from} → ${res.to})`,
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
  }
}
