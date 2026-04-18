import { Component, OnInit, signal, computed, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { Router, RouterLink } from '@angular/router';
import jsPDF from 'jspdf';

interface InvoiceLineItem {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

@Component({
  selector: 'app-guest-invoice',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    DatePickerModule,
    TextareaModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './guest-invoice.component.html',
  styleUrl: './guest-invoice.component.css',
})
export class GuestInvoiceComponent implements OnInit {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);
  private router = inject(Router);
  private messageService = inject(MessageService);

  // Form data
  invoiceNumber = '1';
  invoiceDate = new Date();
  paymentTerms = '';
  dueDate: Date | null = null;
  poNumber = '';
  
  billFrom = '';
  billTo = '';
  shipTo = '';
  
  logoUrl = signal<string | null>(null);
  
  lines = signal<InvoiceLineItem[]>([
    { description: '', quantity: 1, rate: 0, amount: 0 }
  ]);

  notes = '';
  terms = '';
  
  // UI state
  downloading = signal(false);
  
  // Computed totals
  subtotal = computed(() => {
    return this.lines().reduce((sum, line) => sum + (line.amount || 0), 0);
  });
  
  taxRate = signal(0); // percentage
  discountRate = signal(0); // percentage
  shippingAmount = signal(0);
  showDiscount = signal(false);
  showShipping = signal(false);
  
  tax = computed(() => {
    return this.subtotal() * ((this.taxRate() || 0) / 100);
  });
  
  discount = computed(() => {
    return this.subtotal() * ((this.discountRate() || 0) / 100);
  });
  
  total = computed(() => {
    return this.subtotal() + this.tax() - this.discount() + (this.shippingAmount() || 0);
  });
  
  amountPaid = signal(0);
  
  balanceDue = computed(() => {
    return this.total() - (this.amountPaid() || 0);
  });

  // Local storage key
  private readonly GUEST_INVOICES_KEY = 'guest_invoices';

  ngOnInit() {
    if (!this.isBrowser) return;
    this.generateInvoiceNumber();
  }

  generateInvoiceNumber() {
    const timestamp = Date.now().toString().slice(-6);
    this.invoiceNumber = timestamp;
  }

  addLine() {
    this.lines.update(lines => [...lines, { description: '', quantity: 1, rate: 0, amount: 0 }]);
  }

  removeLine(index: number) {
    if (this.lines().length === 1) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Warning',
        detail: 'At least one line item is required'
      });
      return;
    }
    this.lines.update(lines => lines.filter((_, i) => i !== index));
  }

  /** Recompute line amount and replace the row immutably so `lines` signal (and subtotal) updates. */
  recalcLine(index: number): void {
    this.lines.update((rows) => {
      const row = rows[index];
      if (!row) return rows;
      const qty = Number(row.quantity) || 0;
      const rate = Number(row.rate) || 0;
      const amount = qty * rate;
      const next = [...rows];
      next[index] = { ...row, quantity: qty, rate, amount };
      return next;
    });
  }

  toggleDiscount() {
    this.showDiscount.update(v => !v);
    if (!this.showDiscount()) {
      this.discountRate.set(0);
    }
  }

  toggleShipping() {
    this.showShipping.update(v => !v);
    if (!this.showShipping()) {
      this.shippingAmount.set(0);
    }
  }

  onLogoUpload(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      this.messageService.add({
        severity: 'error',
        summary: 'Invalid File',
        detail: 'Please select an image file'
      });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      this.messageService.add({
        severity: 'error',
        summary: 'File Too Large',
        detail: 'Please select an image smaller than 2MB'
      });
      return;
    }

    // Read and display the image
    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.logoUrl.set(e.target.result);
    };
    reader.readAsDataURL(file);
  }

  removeLogo() {
    this.logoUrl.set(null);
  }

  downloadPDF() {
    if (!this.validateInvoice()) return;

    this.downloading.set(true);

    try {
      this.generatePDF();
      this.saveToLocalStorage();
      
      this.messageService.add({
        severity: 'success',
        summary: 'Invoice Downloaded',
        detail: 'Invoice downloaded as PDF and saved locally'
      });
    } catch (error) {
      console.error('Failed to download invoice', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Download Failed',
        detail: 'Failed to download invoice'
      });
    } finally {
      this.downloading.set(false);
    }
  }

  private validateInvoice(): boolean {
    if (!this.invoiceNumber) {
      this.messageService.add({
        severity: 'error',
        summary: 'Validation Error',
        detail: 'Invoice number is required'
      });
      return false;
    }
    
    if (this.lines().length === 0 || !this.lines().some(line => line.description)) {
      this.messageService.add({
        severity: 'error',
        summary: 'Validation Error',
        detail: 'At least one line item with description is required'
      });
      return false;
    }
    
    return true;
  }

  private generatePDF() {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = 210;
    const margin = 20;
    let y = margin;

    // Add logo if exists
    if (this.logoUrl()) {
      try {
        doc.addImage(this.logoUrl()!, 'PNG', margin, y, 40, 20, undefined, 'FAST');
      } catch (error) {
        console.error('Failed to add logo to PDF', error);
      }
    }

    // Title
    doc.setFontSize(32);
    doc.setFont('helvetica', 'bold');
    doc.text('INVOICE', pageWidth - margin, y, { align: 'right' });
    
    // Invoice number
    y += 10;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`# ${this.invoiceNumber}`, pageWidth - margin, y, { align: 'right' });

    // Bill From/To section
    y = margin + 20;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Bill From:', margin, y);
    
    y += 5;
    doc.setFont('helvetica', 'normal');
    const billFromLines = doc.splitTextToSize(this.billFrom || 'N/A', 80);
    doc.text(billFromLines, margin, y);
    
    // Date, Payment Terms, etc.
    let rightY = margin + 20;
    const rightX = pageWidth - margin - 60;
    
    doc.setFont('helvetica', 'bold');
    doc.text('Date:', rightX, rightY);
    doc.setFont('helvetica', 'normal');
    doc.text(this.invoiceDate.toLocaleDateString(), rightX + 30, rightY);
    
    rightY += 6;
    if (this.paymentTerms) {
      doc.setFont('helvetica', 'bold');
      doc.text('Payment Terms:', rightX, rightY);
      doc.setFont('helvetica', 'normal');
      doc.text(this.paymentTerms, rightX + 30, rightY);
      rightY += 6;
    }
    
    if (this.dueDate) {
      doc.setFont('helvetica', 'bold');
      doc.text('Due Date:', rightX, rightY);
      doc.setFont('helvetica', 'normal');
      doc.text(this.dueDate.toLocaleDateString(), rightX + 30, rightY);
      rightY += 6;
    }
    
    if (this.poNumber) {
      doc.setFont('helvetica', 'bold');
      doc.text('PO Number:', rightX, rightY);
      doc.setFont('helvetica', 'normal');
      doc.text(this.poNumber, rightX + 30, rightY);
    }

    y = Math.max(y + billFromLines.length * 5, rightY) + 10;

    // Bill To
    doc.setFont('helvetica', 'bold');
    doc.text('Bill To:', margin, y);
    
    if (this.shipTo) {
      doc.text('Ship To:', pageWidth / 2, y);
    }
    
    y += 5;
    doc.setFont('helvetica', 'normal');
    const billToLines = doc.splitTextToSize(this.billTo || 'N/A', 80);
    doc.text(billToLines, margin, y);
    
    if (this.shipTo) {
      const shipToLines = doc.splitTextToSize(this.shipTo, 80);
      doc.text(shipToLines, pageWidth / 2, y);
    }
    
    y += Math.max(billToLines.length, this.shipTo ? doc.splitTextToSize(this.shipTo, 80).length : 0) * 5 + 10;

    // Line items table
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);
    
    y += 7;
    doc.setFont('helvetica', 'bold');
    doc.text('Description', margin, y);
    doc.text('Qty', margin + 100, y);
    doc.text('Rate', margin + 120, y);
    doc.text('Amount', pageWidth - margin - 20, y, { align: 'right' });
    
    y += 2;
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
    
    doc.setFont('helvetica', 'normal');
    this.lines().forEach(line => {
      if (line.description) {
        const descLines = doc.splitTextToSize(line.description, 95);
        doc.text(descLines, margin, y);
        doc.text(line.quantity.toString(), margin + 100, y);
        doc.text(`$${line.rate.toFixed(2)}`, margin + 120, y);
        doc.text(`$${line.amount.toFixed(2)}`, pageWidth - margin - 20, y, { align: 'right' });
        y += descLines.length * 5 + 3;
      }
    });

    y += 5;
    doc.line(margin, y, pageWidth - margin, y);

    // Totals
    y += 8;
    const totalsX = pageWidth - margin - 70;
    
    doc.text('Subtotal:', totalsX, y);
    doc.text(`$${this.subtotal().toFixed(2)}`, pageWidth - margin - 20, y, { align: 'right' });
    
    if (this.taxRate() > 0) {
      y += 6;
      doc.text(`Tax (${this.taxRate()}%):`, totalsX, y);
      doc.text(`$${this.tax().toFixed(2)}`, pageWidth - margin - 20, y, { align: 'right' });
    }
    
    if (this.discountRate() > 0) {
      y += 6;
      doc.text(`Discount (${this.discountRate()}%):`, totalsX, y);
      doc.text(`-$${this.discount().toFixed(2)}`, pageWidth - margin - 20, y, { align: 'right' });
    }
    
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Total:', totalsX, y);
    doc.text(`$${this.total().toFixed(2)}`, pageWidth - margin - 20, y, { align: 'right' });
    
    if (this.amountPaid() > 0) {
      y += 6;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Amount Paid:', totalsX, y);
      doc.text(`$${this.amountPaid().toFixed(2)}`, pageWidth - margin - 20, y, { align: 'right' });
      
      y += 6;
      doc.setFont('helvetica', 'bold');
      doc.text('Balance Due:', totalsX, y);
      doc.text(`$${this.balanceDue().toFixed(2)}`, pageWidth - margin - 20, y, { align: 'right' });
    }

    // Notes and Terms
    if (this.notes || this.terms) {
      y += 15;
      if (this.notes) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('Notes:', margin, y);
        y += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const notesLines = doc.splitTextToSize(this.notes, pageWidth - 2 * margin);
        doc.text(notesLines, margin, y);
        y += notesLines.length * 4 + 5;
      }
      
      if (this.terms) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('Terms & Conditions:', margin, y);
        y += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const termsLines = doc.splitTextToSize(this.terms, pageWidth - 2 * margin);
        doc.text(termsLines, margin, y);
      }
    }

    doc.save(`invoice-${this.invoiceNumber}.pdf`);
  }

  private saveToLocalStorage() {
    if (!this.isBrowser) return;

    const invoice = {
      invoice_no: this.invoiceNumber,
      date: this.invoiceDate.toISOString(),
      bill_from: this.billFrom,
      bill_to: this.billTo,
      ship_to: this.shipTo,
      payment_terms: this.paymentTerms,
      due_date: this.dueDate?.toISOString(),
      po_number: this.poNumber,
      lines: this.lines(),
      subtotal: this.subtotal(),
      tax_rate: this.taxRate(),
      tax: this.tax(),
      discount_rate: this.discountRate(),
      discount: this.discount(),
      total: this.total(),
      amount_paid: this.amountPaid(),
      balance_due: this.balanceDue(),
      notes: this.notes,
      terms: this.terms,
      savedAt: new Date().toISOString()
    };

    const existingInvoices = this.getLocalInvoices();
    existingInvoices.push(invoice);
    localStorage.setItem(this.GUEST_INVOICES_KEY, JSON.stringify(existingInvoices));
  }

  private getLocalInvoices(): any[] {
    if (!this.isBrowser) return [];
    const stored = localStorage.getItem(this.GUEST_INVOICES_KEY);
    return stored ? JSON.parse(stored) : [];
  }

  clearForm() {
    if (confirm('Clear all form data?')) {
      this.lines.set([{ description: '', quantity: 1, rate: 0, amount: 0 }]);
      this.billFrom = '';
      this.billTo = '';
      this.shipTo = '';
      this.paymentTerms = '';
      this.dueDate = null;
      this.poNumber = '';
      this.notes = '';
      this.terms = '';
      this.taxRate.set(0);
      this.discountRate.set(0);
      this.shippingAmount.set(0);
      this.amountPaid.set(0);
      this.showDiscount.set(false);
      this.showShipping.set(false);
      this.generateInvoiceNumber();
    }
  }

  login() {
    void this.router.navigate(['/login'], { queryParams: { returnUrl: '/dashboard' } });
  }

  signUp() {
    void this.router.navigate(['/signup']);
  }
}
