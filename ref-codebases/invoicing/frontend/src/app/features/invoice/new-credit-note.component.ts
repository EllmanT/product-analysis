import { Component } from '@angular/core';
import { InvoiceBuilderComponent } from './invoice-builder.component';

@Component({
  selector: 'app-new-credit-note',
  standalone: true,
  imports: [InvoiceBuilderComponent],
  template: `
    <app-invoice-builder
      pageTitle="Create credit note"
      pageSubtitle="Build your credit note, add line items, then save a draft or fiscalize when ready."
      [fixedReceiptType]="'CreditNote'"
    />
  `,
})
export class NewCreditNoteComponent {}

