import { Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ApiService, FiscalDaySchedule } from '../../services/api.service';

@Component({
  selector: 'app-settings-fiscal-schedule',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, ToastModule],
  providers: [MessageService],
  template: `
    <header class="app-page-header">
      <div>
        <h1 class="app-page-title">Fiscal day schedule</h1>
        <p class="app-page-subtitle">
          Automatic fiscal day open and close.
        </p>
      </div>
    </header>
    <section class="app-panel-card">

      <div class="form-field">
        <label class="check">
          <input type="checkbox" [(ngModel)]="model.is_enabled" />
          Enable scheduled fiscal day actions
        </label>
      </div>

      <fieldset class="block">
        <legend>Auto close</legend>
        <label class="check">
          <input type="checkbox" [(ngModel)]="model.auto_close_enabled" [disabled]="!model.is_enabled" />
          Close fiscal day automatically
        </label>
        <div class="form-field">
          <label for="closeTime">Close time (local)</label>
          <input
            id="closeTime"
            type="time"
            [(ngModel)]="model.close_time"
            [disabled]="!model.is_enabled || !model.auto_close_enabled"
          />
        </div>
        <div class="days">
          <span class="days-label">Days</span>
          @for (d of weekdayOptions; track d.iso) {
            <label class="day-chip">
              <input
                type="checkbox"
                [checked]="model.close_weekdays.includes(d.iso)"
                [disabled]="!model.is_enabled || !model.auto_close_enabled"
                (change)="toggleDay(model.close_weekdays, d.iso, $event)"
              />
              {{ d.short }}
            </label>
          }
        </div>
      </fieldset>

      <fieldset class="block">
        <legend>Auto open</legend>
        <label class="check">
          <input type="checkbox" [(ngModel)]="model.auto_open_enabled" [disabled]="!model.is_enabled" />
          Open fiscal day automatically
        </label>
        <div class="form-field">
          <label for="openTime">Open time (local)</label>
          <input
            id="openTime"
            type="time"
            [(ngModel)]="model.open_time"
            [disabled]="!model.is_enabled || !model.auto_open_enabled"
          />
        </div>
        <div class="days">
          <span class="days-label">Days</span>
          @for (d of weekdayOptions; track d.iso) {
            <label class="day-chip">
              <input
                type="checkbox"
                [checked]="model.open_weekdays.includes(d.iso)"
                [disabled]="!model.is_enabled || !model.auto_open_enabled"
                (change)="toggleDay(model.open_weekdays, d.iso, $event)"
              />
              {{ d.short }}
            </label>
          }
        </div>
      </fieldset>

      <p class="meta">Timezone uses the application default.</p>

      @if (model.last_auto_close_date || model.last_auto_open_date) {
        <p class="meta">
          @if (model.last_auto_close_date) {
            <span>Last auto close: {{ model.last_auto_close_date }}</span>
          }
          @if (model.last_auto_open_date) {
            <span>Last auto open: {{ model.last_auto_open_date }}</span>
          }
        </p>
      }

      <p-button label="Save schedule" icon="pi pi-save" [loading]="saving()" (onClick)="save()" />
    </section>
    <p-toast />
  `,
  styles: [
    `
      .app-page-subtitle code {
        font-size: 0.85em;
      }
      .form-field {
        margin: 1rem 0;
      }
      .form-field label {
        display: block;
        font-weight: 500;
        margin-bottom: 0.35rem;
      }
      .check {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-weight: 500;
        cursor: pointer;
      }
      .block {
        margin: 1.25rem 0;
        padding: 1rem;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
      }
      .block legend {
        font-weight: 600;
        padding: 0 0.35rem;
      }
      input[type='time'],
      input[type='text'] {
        padding: 0.5rem 0.65rem;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        min-width: 8rem;
      }
      input[type='text'] {
        min-width: min(100%, 320px);
      }
      .days {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem 0.75rem;
        margin-top: 0.75rem;
      }
      .days-label {
        font-size: 0.85rem;
        color: #6b7280;
        margin-right: 0.25rem;
      }
      .day-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.85rem;
        cursor: pointer;
      }
      .meta {
        font-size: 0.85rem;
        color: #6b7280;
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        margin: 1rem 0;
      }
    `,
  ],
})
export class SettingsFiscalScheduleComponent implements OnInit {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  readonly weekdayOptions = [
    { iso: 1, short: 'Mon' },
    { iso: 2, short: 'Tue' },
    { iso: 3, short: 'Wed' },
    { iso: 4, short: 'Thu' },
    { iso: 5, short: 'Fri' },
    { iso: 6, short: 'Sat' },
    { iso: 7, short: 'Sun' },
  ];

  model: {
    is_enabled: boolean;
    auto_close_enabled: boolean;
    auto_open_enabled: boolean;
    close_time: string;
    open_time: string;
    close_weekdays: number[];
    open_weekdays: number[];
    timezone: string;
    last_auto_close_date: string | null;
    last_auto_open_date: string | null;
  } = {
    is_enabled: false,
    auto_close_enabled: false,
    auto_open_enabled: false,
    close_time: '',
    open_time: '',
    close_weekdays: [],
    open_weekdays: [],
    timezone: '',
    last_auto_close_date: null,
    last_auto_open_date: null,
  };

  saving = signal(false);

  constructor(
    private api: ApiService,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    if (!this.isBrowser) return;
    this.api.getFiscalDaySchedule().subscribe({
      next: (s) => this.applyServer(s),
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load schedule' });
      },
    });
  }

  private applyServer(s: FiscalDaySchedule): void {
    this.model = {
      is_enabled: s.is_enabled,
      auto_close_enabled: s.auto_close_enabled,
      auto_open_enabled: s.auto_open_enabled,
      close_time: s.close_time ?? '',
      open_time: s.open_time ?? '',
      close_weekdays: [...(s.close_weekdays ?? [])],
      open_weekdays: [...(s.open_weekdays ?? [])],
      timezone: '',
      last_auto_close_date: s.last_auto_close_date,
      last_auto_open_date: s.last_auto_open_date,
    };
  }

  toggleDay(arr: number[], iso: number, ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (checked) {
      if (!arr.includes(iso)) {
        arr.push(iso);
        arr.sort((a, b) => a - b);
      }
    } else {
      const i = arr.indexOf(iso);
      if (i >= 0) {
        arr.splice(i, 1);
      }
    }
  }

  save(): void {
    this.saving.set(true);
    const body: Partial<FiscalDaySchedule> = {
      is_enabled: this.model.is_enabled,
      auto_close_enabled: this.model.auto_close_enabled,
      auto_open_enabled: this.model.auto_open_enabled,
      close_time: this.model.close_time?.trim() ? this.model.close_time.trim() : null,
      open_time: this.model.open_time?.trim() ? this.model.open_time.trim() : null,
      close_weekdays: [...this.model.close_weekdays],
      open_weekdays: [...this.model.open_weekdays],
      timezone: null,
    };
    this.api.updateFiscalDaySchedule(body).subscribe({
      next: (s) => {
        this.applyServer(s);
        this.saving.set(false);
        this.messageService.add({ severity: 'success', summary: 'Saved', detail: 'Fiscal schedule updated' });
      },
      error: (err) => {
        this.saving.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err?.error?.message || 'Save failed',
        });
      },
    });
  }
}
