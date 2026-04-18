import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { ApiService, ActivationCodeStatus } from '../../services/api.service';

@Component({
  selector: 'app-settings-activation',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, ToastModule],
  providers: [MessageService],
  templateUrl: './settings-activation.component.html',
  styleUrl: './settings-activation.component.css',
})
export class SettingsActivationComponent implements OnInit {
  private api = inject(ApiService);
  private messages = inject(MessageService);

  status = signal<ActivationCodeStatus | null>(null);
  loading = signal(false);
  regenerating = signal(false);
  /** Shown only once after regenerate */
  plainCode = signal<string | null>(null);

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loading.set(true);
    this.plainCode.set(null);
    this.api.getActivationCodeStatus().subscribe({
      next: (s) => {
        this.status.set(s);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'Could not load',
          detail: err?.error?.message ?? 'Activation code is not available for this account.',
        });
      },
    });
  }

  regenerate(): void {
    this.regenerating.set(true);
    this.plainCode.set(null);
    this.api.regenerateActivationCode().subscribe({
      next: (res) => {
        this.regenerating.set(false);
        this.plainCode.set(res.activation_code);
        this.status.set({
          has_code: true,
          hint: res.hint ?? null,
          updated_at: new Date().toISOString(),
        });
        this.messages.add({
          severity: 'success',
          summary: 'New code created',
          detail: res.message ?? 'Copy the code below and store it securely.',
        });
      },
      error: (err) => {
        this.regenerating.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'Failed',
          detail: err?.error?.message ?? 'Could not generate a code.',
        });
      },
    });
  }

  copyPlain(): void {
    const v = this.plainCode();
    if (!v || !navigator.clipboard) {
      return;
    }
    void navigator.clipboard.writeText(v).then(() => {
      this.messages.add({ severity: 'info', summary: 'Copied', detail: 'Code copied to clipboard.' });
    });
  }
}
