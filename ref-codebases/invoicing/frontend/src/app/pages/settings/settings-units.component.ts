import { Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ApiService, UnitOfMeasure } from '../../services/api.service';

@Component({
  selector: 'app-settings-units',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, TableModule, DialogModule, InputTextModule, ToastModule],
  providers: [MessageService],
  templateUrl: './settings-units.component.html',
  styles: [
    `
      .toolbar {
        margin-bottom: 1rem;
      }
      .dialog-body {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 0.5rem 0;
      }
      .w-full {
        width: 100%;
      }
      .empty {
        text-align: center;
        padding: 2rem;
      }
    `,
  ],
})
export class SettingsUnitsComponent implements OnInit {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  units = signal<UnitOfMeasure[]>([]);
  loading = signal(false);
  saving = signal(false);
  editMode = signal(false);
  dialogVisible = false;
  formName = '';
  currentId: string | null = null;

  constructor(
    private api: ApiService,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    if (this.isBrowser) {
      this.load();
    }
  }

  load(): void {
    this.loading.set(true);
    this.api.getUnitsOfMeasure({ per_page: 500 }).subscribe({
      next: (res) => {
        this.units.set(res.data ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.units.set([]);
        this.loading.set(false);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load units' });
      },
    });
  }

  openDialog(): void {
    this.editMode.set(false);
    this.formName = '';
    this.currentId = null;
    this.dialogVisible = true;
  }

  editUnit(row: UnitOfMeasure): void {
    if (!row.id) return;
    this.editMode.set(true);
    this.formName = row.name;
    this.currentId = row.id;
    this.dialogVisible = true;
  }

  save(): void {
    const name = this.formName.trim();
    if (!name) return;
    this.saving.set(true);
    const op = this.editMode() && this.currentId
      ? this.api.updateUnitOfMeasure(this.currentId, { name })
      : this.api.createUnitOfMeasure({ name });
    op.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible = false;
        this.messageService.add({
          severity: 'success',
          summary: 'Saved',
          detail: this.editMode() ? 'Unit updated' : 'Unit created',
        });
        this.load();
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

  deleteUnit(row: UnitOfMeasure): void {
    if (!row.id || !confirm(`Delete unit "${row.name}"?`)) return;
    this.api.deleteUnitOfMeasure(row.id).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Unit removed' });
        this.load();
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Delete failed' });
      },
    });
  }
}
