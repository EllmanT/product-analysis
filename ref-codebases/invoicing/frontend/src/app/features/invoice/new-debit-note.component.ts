import { Component } from '@angular/core';
import { InvoiceBuilderComponent } from './invoice-builder.component';

@Component({
  selector: 'app-new-debit-note',
  standalone: true,
  imports: [InvoiceBuilderComponent],
  template: `
    <app-invoice-builder
      pageTitle="Create debit note"
      pageSubtitle="Build your debit note, add line items, then save a draft or fiscalize when ready."
      [fixedReceiptType]="'DebitNote'"
    />
  `,
})
export class NewDebitNoteComponent {}

