import { Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ApiService, FiscalDayStatusResponse } from '../../services/api.service';

@Component({
  selector: 'app-fiscal-day',
  standalone: true,
  imports: [
    CommonModule,
    ButtonModule,
    CardModule,
    MessageModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './fiscal-day.component.html',
  styleUrl: './fiscal-day.component.css',
})
export class FiscalDayComponent implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly api = inject(ApiService);
  private readonly messageService = inject(MessageService);

  loading = signal(false);
  actionLoading = signal(false);
  status = signal<FiscalDayStatusResponse | null>(null);
  statusError = signal<string | null>(null);

  ngOnInit(): void {
    if (!this.isBrowser) return;
    this.refreshStatus();
  }

  get canOpen(): boolean {
    return this.status()?.code === '1' && this.status()?.fiscal_day_status === 'FiscalDayClosed';
  }

  get canClose(): boolean {
    return this.status()?.code === '1' && this.status()?.fiscal_day_status === 'FiscalDayOpened';
  }

  refreshStatus(): void {
    this.loading.set(true);
    this.statusError.set(null);
    this.api.getFiscalDayStatus().subscribe({
      next: (res) => {
        this.status.set(res);
        this.loading.set(false);
      },
      error: (error) => {
        const fallback = error?.error?.message || 'Failed to get fiscal day status.';
        this.status.set(error?.error ?? null);
        this.statusError.set(
          error?.error?.code === '0'
            ? 'There is a fiscal day error. Contact support@axissol.com.'
            : fallback
        );
        this.loading.set(false);
      },
    });
  }

  openFiscalDay(): void {
    if (!this.canOpen) return;

    this.actionLoading.set(true);
    this.api.openFiscalDay().subscribe({
      next: (res) => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: res?.message || 'Fiscal day opened successfully.',
        });
        this.actionLoading.set(false);
        this.refreshStatus();
      },
      error: (error) => {
        this.actionLoading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Open fiscal day failed',
          detail: error?.error?.message || 'Failed to open fiscal day.',
        });
      },
    });
  }

  closeFiscalDay(): void {
    if (!this.canClose) return;

    this.actionLoading.set(true);
    this.api.closeFiscalDay().subscribe({
      next: (res) => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: res?.message || 'Fiscal day closed successfully.',
        });
        this.actionLoading.set(false);
        this.refreshStatus();
      },
      error: (error) => {
        this.actionLoading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Close fiscal day failed',
          detail: error?.error?.message || 'Failed to close fiscal day.',
        });
      },
    });
  }
}
