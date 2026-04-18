import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class FiscalizationDialogService {
  showDialog = signal(false);

  open() {
    this.showDialog.set(true);
  }

  close() {
    this.showDialog.set(false);
  }
}
