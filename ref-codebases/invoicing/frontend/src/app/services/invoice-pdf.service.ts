import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';

export interface InvoicePdfLine {
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  tax_percent: number;
  /** VAT amount for this line (required for FDMS templates). */
  tax_amount?: number;
  hs_code?: string;
}

export interface InvoicePdfFiscal {
  verification_code?: string;
  fiscal_day_no?: string;
  device_id?: string;
  fdms_invoice_no?: string;
  verification_link?: string;
}

export interface InvoicePdfParty {
  name?: string;
  physical_address?: string;
  phone?: string;
  email?: string;
  vat_number?: string;
  tin?: string;
}

export interface InvoicePdfPayload {
  invoice_no: string;
  receipt_type: string;
  receipt_date: string;
  tax_inclusive: boolean;
  currency: string;
  subtotal: number;
  total_tax: number;
  total_excl_tax: number;
  grand_total: number;
  payment_method: string;
  payment_amount: number;
  notes?: string;
  lines: InvoicePdfLine[];
  /** Matches invoice preview: buyer name or walk-in. */
  buyer_display_name?: string;
  /** Company / seller (required on the approved A4 templates). */
  seller?: InvoicePdfParty;
  /** Buyer / customer details (required on the approved A4 templates). */
  buyer?: InvoicePdfParty;
  fiscal?: InvoicePdfFiscal;
  /** PNG data URL from QRCode.toDataURL, when fiscal verification data exists. */
  qr_image_data_url?: string;
}

const GRAND_RED: [number, number, number] = [188, 5, 21];
const BORDER_GRAY = 200;
const HEADER_FILL: [number, number, number] = [248, 250, 252];
const MUTED: [number, number, number] = [107, 114, 128];

@Injectable({ providedIn: 'root' })
export class InvoicePdfService {
  savePdf(invoice: InvoicePdfPayload): void {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 20;
    const contentW = pageWidth - 2 * margin;
    let y = margin;

    const bump = (mm: number) => {
      y += mm;
    };

    const newPageIfNeeded = (needed: number) => {
      if (y + needed > pageHeight - 22) {
        doc.addPage();
        y = margin;
      }
    };

    const formatReceiptDate = (iso: string) => {
      try {
        return new Date(iso).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        });
      } catch {
        return iso;
      }
    };

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    const receiptTitle =
      String(invoice.receipt_type || '').toLowerCase() === 'creditnote'
        ? 'Fiscal credit note'
        : String(invoice.receipt_type || '').toLowerCase() === 'debitnote'
          ? 'Fiscal debit note'
          : 'Fiscal tax invoice';
    doc.text(receiptTitle, margin, y);
    bump(8);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const col1 = margin;
    const col2 = margin + contentW / 2;
    const lh = 6;
    const label = (x: number, yy: number, l: string, v: string) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      const lw = doc.getTextWidth(l + ' ');
      doc.text(l, x, yy);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text(v, x + lw, yy);
      doc.setFont('helvetica', 'normal');
    };

    // Authorities require "Document No" or "Reference Number" (not "Invoice No").
    label(col1, y, 'Document No:', invoice.invoice_no);
    label(col2, y, 'Date', formatReceiptDate(invoice.receipt_date));
    bump(lh);

    const buyerName =
      invoice.buyer?.name?.trim() ||
      invoice.buyer_display_name?.trim() ||
      'Walk-in customer';
    label(col1, y, 'Customer', buyerName);
    label(col2, y, 'Payment', invoice.payment_method);
    bump(lh);

    label(col1, y, 'Currency', invoice.currency);
    bump(lh + 6);

    // Seller + customer details block (required fields per FDMS checklist).
    const partyLine = (x: number, yy: number, l: string, v: string) => {
      label(x, yy, l, v || '—');
    };

    const seller = invoice.seller ?? {};
    const buyer = invoice.buyer ?? {};

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('Company details', col1, y);
    doc.text('Customer details', col2, y);
    bump(6.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    partyLine(col1, y, 'Name', String(seller.name ?? '').trim());
    partyLine(col2, y, 'Name', String(buyer.name ?? buyerName).trim());
    bump(lh);
    partyLine(col1, y, 'Address', String(seller.physical_address ?? '').trim());
    partyLine(col2, y, 'Address', String(buyer.physical_address ?? '').trim());
    bump(lh);
    partyLine(col1, y, 'Phone', String(seller.phone ?? '').trim());
    partyLine(col2, y, 'Phone', String(buyer.phone ?? '').trim());
    bump(lh);
    partyLine(col1, y, 'Email', String(seller.email ?? '').trim());
    partyLine(col2, y, 'Email', String(buyer.email ?? '').trim());
    bump(lh);
    partyLine(col1, y, 'VAT number', String(seller.vat_number ?? '').trim());
    partyLine(col2, y, 'Customer VAT', String(buyer.vat_number ?? '').trim());
    bump(lh);
    partyLine(col1, y, 'TIN', String(seller.tin ?? '').trim());
    partyLine(col2, y, 'Customer TIN', String(buyer.tin ?? '').trim());
    bump(lh + 4);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('Line items', margin, y);
    bump(6);

    const tableLeft = margin;
    const tableW = contentW;
    const colNum = tableLeft + 2;
    const colDesc = tableLeft + 10;
    const colQty = tableLeft + 108;
    const colPrice = tableLeft + 128;
    const colVat = tableLeft + 152;
    // Keep the last columns inside the A4 content width (210mm - margins).
    const colTotA = tableLeft + 162;
    const colTotB = tableLeft + 186;
    const rowH = 7;
    const headH = 8;

    doc.setFillColor(...HEADER_FILL);
    doc.setDrawColor(BORDER_GRAY, BORDER_GRAY, BORDER_GRAY);
    doc.rect(tableLeft, y, tableW, headH, 'FD');
    doc.setTextColor(55, 65, 81);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('#', colNum, y + 5.2);
    doc.text('Description', colDesc, y + 5.2);
    doc.text('Qty', colQty, y + 5.2);
    doc.text(invoice.tax_inclusive ? 'Unit price (Incl)' : 'Unit price', colPrice, y + 5.2);
    doc.text('VAT amount', colVat, y + 5.2);
    if (invoice.tax_inclusive) {
      doc.text('Total (Incl)', colTotA, y + 5.2);
    } else {
      doc.text('Total (Excl)', colTotA, y + 5.2);
      doc.text('Total (Incl)', colTotB, y + 5.2);
    }
    y += headH;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);

    invoice.lines.forEach((line, index) => {
      newPageIfNeeded(rowH + 8);
      if (index % 2 === 0) {
        doc.setFillColor(249, 250, 251);
        doc.rect(tableLeft, y, tableW, rowH, 'F');
      }
      doc.rect(tableLeft, y, tableW, rowH, 'S');
      doc.setFontSize(8);
      doc.text(String(index + 1), colNum, y + 4.8);
      const descMax = colQty - colDesc - 2;
      const descLines = doc.splitTextToSize(line.description || '—', descMax);
      doc.text(descLines[0] || '—', colDesc, y + 4.8);
      doc.text(Number(line.quantity).toFixed(2), colQty, y + 4.8);
      doc.text(Number(line.unit_price).toFixed(2), colPrice, y + 4.8);
      const vatAmount = Number(line.tax_amount ?? 0);
      const lineIncl = invoice.tax_inclusive ? Number(line.line_total) : Number(line.line_total) + vatAmount;
      const lineExcl = invoice.tax_inclusive ? lineIncl - vatAmount : Number(line.line_total);
      doc.text(Number(vatAmount).toFixed(2), colVat, y + 4.8);
      if (invoice.tax_inclusive) {
        doc.text(Number(lineIncl).toFixed(2), colTotA, y + 4.8);
      } else {
        doc.text(Number(lineExcl).toFixed(2), colTotA, y + 4.8);
        doc.text(Number(lineIncl).toFixed(2), colTotB, y + 4.8);
      }
      y += rowH;
    });

    bump(8);

    newPageIfNeeded(40);
    const totalsW = 78;
    const totalsX = pageWidth - margin - totalsW;
    const amountX = pageWidth - margin;

    const totalRow = (lab: string, val: string, opts?: { grand?: boolean }) => {
      doc.setFontSize(opts?.grand ? 10 : 9);
      if (opts?.grand) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...GRAND_RED);
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(55, 65, 81);
      }
      doc.text(lab, totalsX, y);
      doc.text(val, amountX, y, { align: 'right' });
      if (opts?.grand) {
        doc.setTextColor(15, 23, 42);
      }
      bump(opts?.grand ? 7 : 5.5);
    };

    totalRow(
      'Subtotal',
      `${invoice.currency} ${Number(invoice.total_excl_tax).toFixed(2)}`
    );
    totalRow(
      'Total VAT',
      `${invoice.currency} ${Number(invoice.total_tax).toFixed(2)}`
    );

    doc.setDrawColor(BORDER_GRAY, BORDER_GRAY, BORDER_GRAY);
    bump(2);
    doc.line(totalsX, y, amountX, y);
    bump(4);

    totalRow('Grand total', `${invoice.currency} ${Number(invoice.grand_total).toFixed(2)}`, {
      grand: true,
    });

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);

    if (invoice.notes?.trim()) {
      bump(6);
      newPageIfNeeded(30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Notes', margin, y);
      bump(5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const noteLines = doc.splitTextToSize(invoice.notes.trim(), contentW);
      doc.text(noteLines, margin, y);
      bump(noteLines.length * 4 + 4);
    }

    const hasFiscalBlock =
      !!invoice.qr_image_data_url ||
      !!invoice.fiscal?.verification_code ||
      !!invoice.fiscal?.fiscal_day_no ||
      !!invoice.fiscal?.device_id ||
      !!invoice.fiscal?.fdms_invoice_no ||
      !!invoice.fiscal?.verification_link?.trim();

    if (hasFiscalBlock) {
      bump(6);
      newPageIfNeeded(95);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text('Fiscal verification', margin, y);
      bump(7);

      const f = invoice.fiscal;
      const show = (a: string | undefined) => (a?.trim() ? a : '—');

      doc.setFontSize(9);
      const fCol1 = margin;
      const fCol2 = margin + contentW / 2;
      const flh = 6;
      label(fCol1, y, 'Verification code', show(f?.verification_code));
      label(fCol2, y, 'Fiscal day', show(f?.fiscal_day_no));
      bump(flh);
      label(fCol1, y, 'Device ID', show(f?.device_id));
      label(fCol2, y, 'Invoice Number', show(f?.fdms_invoice_no));
      bump(flh + 4);

      const qrSize = 45;
      let fy = y;
      // Always reserve QR space (requirement: leave a QR area even if blank).
      newPageIfNeeded(qrSize + 20);
      doc.setDrawColor(BORDER_GRAY, BORDER_GRAY, BORDER_GRAY);
      doc.rect(margin, fy, qrSize, qrSize, 'S');
      if (invoice.qr_image_data_url) {
        try {
          doc.addImage(invoice.qr_image_data_url, 'PNG', margin, fy, qrSize, qrSize);
        } catch {
          doc.setFontSize(8);
          doc.setTextColor(...MUTED);
          doc.text('QR code could not be embedded.', margin, fy + 4);
        }
      } else {
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        doc.text('QR code', margin + 2, fy + qrSize / 2);
      }
      fy += qrSize + 4;

      const link = f?.verification_link?.trim();
      if (link) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(37, 99, 235);
        const linkLines = doc.splitTextToSize(link, contentW);
        doc.text(linkLines, margin, fy);
        fy += linkLines.length * 3.6 + 2;
      }

      y = fy;
      doc.setTextColor(15, 23, 42);
    }

    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(
      'This is a computer-generated document. No signature is required.',
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );

    doc.save(`${invoice.invoice_no || 'invoice'}.pdf`);
  }
}
