import { Component, OnInit, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { ChartModule } from 'primeng/chart';
import { ButtonModule } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { ApiService, ProductReportResponse } from '../../services/api.service';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function truncateLabel(s: string, max = 40): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

@Component({
  selector: 'app-reports-by-product',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ChartModule,
    ButtonModule,
    DatePicker,
    ProgressSpinnerModule,
    MessageModule,
    TableModule,
  ],
  templateUrl: './reports-by-product.component.html',
  styleUrls: ['./reports-shared.css', './reports-by-product.component.css'],
})
export class ReportsByProductComponent implements OnInit {
  private api = inject(ApiService);
  private platformId = inject(PLATFORM_ID);

  loading = signal(true);
  error = signal<string | null>(null);
  report = signal<ProductReportResponse | null>(null);

  fromDate: Date | null = null;
  toDate: Date | null = null;

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
    this.api.getProductReport({ from, to }).subscribe({
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

  private buildChart(res: ProductReportResponse): void {
    const axisColor = '#64748b';
    const gridColor = 'rgba(148, 163, 184, 0.2)';
    const top = res.series.slice(0, 10);
    const labels = top.length ? top.map((row) => truncateLabel(row.product_name)) : ['—'];
    const values = top.length ? top.map((row) => row.revenue) : [0];

    this.chartData.set({
      labels,
      datasets: [
        {
          label: 'Revenue',
          data: values,
          backgroundColor: 'rgba(188, 5, 21, 0.75)',
          borderRadius: 6,
        },
      ],
    });

    this.chartOptions.set({
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: `Top products by revenue (top 10 of ${res.series.length}) — ${res.from} → ${res.to}`,
          color: '#0f172a',
          font: { size: 14, weight: '600' },
        },
        tooltip: {
          callbacks: {
            label: (ctx: { parsed?: { x: number } }) => ` ${Number(ctx.parsed?.x ?? 0).toLocaleString()}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: axisColor },
          grid: { color: gridColor },
          title: { display: true, text: 'Revenue', color: axisColor },
        },
        y: {
          ticks: { color: axisColor },
          grid: { display: false },
        },
      },
    });
  }
}
