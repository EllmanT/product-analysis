import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, AuthSessionResponse, CompanyDevice } from '../../services/api.service';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

@Component({
  selector: 'app-company',
  standalone: true,
  imports: [CommonModule, ButtonModule, CardModule, MessageModule, ProgressSpinnerModule],
  templateUrl: './company.component.html',
  styleUrl: './company.component.css',
})
export class CompanyComponent {
  private api = inject(ApiService);

  loading = signal(true);
  error = signal<string | null>(null);
  session = signal<AuthSessionResponse | null>(null);
  devices = signal<CompanyDevice[]>([]);
  retrying = signal(false);

  constructor() {
    this.refresh();
  }

  refresh(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.getAuthSession().subscribe({
      next: (s) => {
        this.session.set(s);
        this.api.getDevices({ page: 1, per_page: 50 }).subscribe({
          next: (res) => {
            const list = Array.isArray(res) ? (res as CompanyDevice[]) : (res?.data ?? []);
            this.devices.set(list);
            this.loading.set(false);
          },
          error: (err) => {
            this.loading.set(false);
            this.error.set(err?.error?.message ?? 'Failed to load devices.');
          },
        });
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'Failed to load company session.');
      },
    });
  }

  statusLabel(d: CompanyDevice): string {
    const s = (d.activation_status ?? 'PENDING').toString().toUpperCase();
    if (s === 'ACTIVATED') return 'Activated';
    if (s === 'PROCESSING') return 'Activating…';
    if (s === 'FAILED') return 'Activation failed';
    return 'Pending activation';
  }

  deviceSerial(d: CompanyDevice): string {
    const raw = d?.fiscal_cloud_payload;
    const nested =
      raw?.device?.serial_number ??
      raw?.data?.device?.serial_number ??
      raw?.device?.serialNumber ??
      raw?.data?.device?.serialNumber;
    const s = typeof nested === 'string' ? nested.trim() : '';
    if (s) return s;
    return (d.device_serial_no ?? '').toString() || '-';
  }

  primaryDevice(): CompanyDevice | null {
    return this.devices()[0] ?? null;
  }

  retryActivation(): void {
    const d = this.primaryDevice();
    if (!d?.id) return;
    const status = (d.activation_status ?? '').toString().toUpperCase();
    if (status !== 'FAILED') return;

    this.retrying.set(true);
    this.error.set(null);
    this.api.retryDeviceActivation(String(d.id)).subscribe({
      next: () => {
        this.retrying.set(false);
        this.refresh();
      },
      error: (err) => {
        this.retrying.set(false);
        this.error.set(err?.error?.message ?? 'Failed to queue activation retry.');
      },
    });
  }
}

