import { Component, inject, NgZone, effect, untracked, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { Router } from '@angular/router';
import { FiscalizationDialogService } from '../../services/fiscalization-dialog.service';


@Component({
  selector: 'app-fiscalization-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DialogModule,
    ButtonModule,
    InputTextModule,
    MessageModule,
    ProgressSpinnerModule,
  ],
  templateUrl: './fiscalization-dialog.component.html',
  styleUrl: './fiscalization-dialog.component.css',
})
export class FiscalizationDialogComponent {
  private router = inject(Router);
  private dialogService = inject(FiscalizationDialogService);
  private ngZone = inject(NgZone);
  wizardStep = signal<1>(1);

  constructor() {
    effect(() => {
      const open = this.dialogService.showDialog();
      if (open) {
        untracked(() => this.resetWizard());
      }
    });
  }

  get visible() {
    return this.dialogService.showDialog();
  }

  set visible(value: boolean) {
    if (!value) {
      this.dialogService.close();
    }
  }

  private resetWizard() {
    this.wizardStep.set(1);
  }

  dialogTitle = computed(() => {
    return 'Setup Your Account';
  });

  onContinueWithout() {
    this.dialogService.close();
    this.ngZone.run(() => {
      void this.router.navigate(['/company-setup']);
    });
  }

  onSetupWithFiscalization() {
    this.dialogService.close();
    this.ngZone.run(() => {
      void this.router.navigate(['/apply-fiscalization']);
    });
  }

  onDialogHide() {
    this.dialogService.close();
  }
}
