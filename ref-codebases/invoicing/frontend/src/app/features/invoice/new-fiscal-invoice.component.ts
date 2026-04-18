import { Component } from '@angular/core';
import { InvoiceBuilderComponent } from './invoice-builder.component';

@Component({
  selector: 'app-new-fiscal-invoice',
  standalone: true,
  imports: [InvoiceBuilderComponent],
  template: `
    <app-invoice-builder
      pageTitle="Create fiscal invoice"
      pageSubtitle="Build your fiscal invoice, add line items, then save a draft or fiscalize when ready."
      [fixedReceiptType]="'FiscalInvoice'"
    />
  `,
})
export class NewFiscalInvoiceComponent {}

