import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { PDFDocument, rgb, StandardFonts, degrees } from "pdf-lib";

import Customer from "@/database/customer.model";
import Invoice from "@/database/invoice.model";
import handleError from "@/lib/handlers/error";
import { NotFoundError, UnauthorisedError } from "@/lib/http-errors";
import dbConnect from "@/lib/mongoose";
import { getShopCustomerIdFromCookies } from "@/lib/shop/customer-auth";

type InvoiceLean = {
  _id: Types.ObjectId;
  invoiceNumber: string;
  quotationId: Types.ObjectId;
  customerId: Types.ObjectId;
  items: Array<{
    name: string;
    standardCode: string;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
  }>;
  subtotal: string;
  status: string;
  createdAt: Date;
};

type CustomerLean = {
  firstName: string;
  lastName: string;
  email: string;
  tradeName: string;
  tinNumber: string;
  vatNumber: string;
  address: string;
};

function fmt(s: string): string {
  const n = parseFloat(s);
  return `$${isNaN(n) ? "0.00" : n.toFixed(2)}`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const customerId = await getShopCustomerIdFromCookies();
    if (!customerId) throw new UnauthorisedError("Please sign in");

    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Invoice");

    const [invoice, customer] = await Promise.all([
      Invoice.findOne({
        _id: new Types.ObjectId(id),
        customerId: new Types.ObjectId(customerId),
      }).lean<InvoiceLean | null>(),
      Customer.findById(customerId)
        .select("firstName lastName email tradeName tinNumber vatNumber address")
        .lean<CustomerLean | null>(),
    ]);

    if (!invoice) throw new NotFoundError("Invoice");
    if (!customer) throw new UnauthorisedError("Please sign in");

    const createdAt = invoice.createdAt ? new Date(invoice.createdAt) : new Date();
    const siteUrl = process.env.SITE_URL ?? "https://stockflow.com";

    // ── Build PDF ──────────────────────────────────────────────
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4
    const { width, height } = page.getSize();
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const headerGreen = rgb(0.024, 0.306, 0.231);
    const lightGray = rgb(0.945, 0.961, 0.976);
    const darkText = rgb(0.067, 0.094, 0.153);
    const grayText = rgb(0.42, 0.447, 0.502);
    const green = rgb(0.02, 0.557, 0.408);
    const navy = rgb(0.118, 0.227, 0.373);

    // Header band
    const headerH = 80;
    page.drawRectangle({ x: 0, y: height - headerH, width, height: headerH, color: headerGreen });
    page.drawText("STOCKFLOW", { x: 40, y: height - 38, font: bold, size: 22, color: rgb(1, 1, 1) });
    page.drawText("INVOICE", {
      x: width - 40 - bold.widthOfTextAtSize("INVOICE", 13),
      y: height - 36, font: bold, size: 13, color: rgb(1, 1, 1),
    });
    page.drawText(invoice.invoiceNumber, {
      x: 40, y: height - 60, font: regular, size: 11, color: rgb(0.431, 0.906, 0.718),
    });

    // Info block
    const infoY = height - headerH - 30;
    page.drawText("Bill To:", { x: 40, y: infoY, font: bold, size: 10, color: grayText });
    page.drawText(`${customer.firstName} ${customer.lastName}`, {
      x: 40, y: infoY - 16, font: bold, size: 11, color: darkText,
    });
    page.drawText(customer.tradeName, { x: 40, y: infoY - 30, font: regular, size: 10, color: darkText });
    page.drawText(customer.email, { x: 40, y: infoY - 44, font: regular, size: 10, color: darkText });
    if (customer.address) {
      page.drawText(customer.address.slice(0, 60), { x: 40, y: infoY - 58, font: regular, size: 10, color: darkText });
    }

    const rightX = width - 200;
    const rightRows: [string, string][] = [
      ["Invoice Date:", fmtDate(createdAt)],
      ["Invoice #:", invoice.invoiceNumber],
      ["Status:", "PAID"],
    ];
    rightRows.forEach(([label, value], idx) => {
      const ry = infoY - idx * 16;
      page.drawText(label, { x: rightX, y: ry, font: regular, size: 10, color: grayText });
      page.drawText(value, { x: rightX + 95, y: ry, font: bold, size: 10, color: darkText });
    });

    // Divider
    const dividerY = infoY - 80;
    page.drawLine({ start: { x: 40, y: dividerY }, end: { x: width - 40, y: dividerY }, thickness: 0.75, color: lightGray });

    // Items table
    const tableY = dividerY - 20;
    const colX = [40, 220, 330, 410, 490];
    const colW = [180, 110, 80, 80, 65];
    const headers = ["Product", "SKU", "Qty", "Unit Price", "Total"];
    const rowH = 26;

    page.drawRectangle({ x: 40, y: tableY - rowH + 4, width: width - 80, height: rowH, color: navy });
    headers.forEach((h, i) => {
      const align = i >= 2 ? "right" : "left";
      const tw = bold.widthOfTextAtSize(h, 10);
      const textX = align === "right" ? colX[i] + colW[i] - tw - 4 : colX[i] + 4;
      page.drawText(h, { x: textX, y: tableY - rowH + 10, font: bold, size: 10, color: rgb(1, 1, 1) });
    });

    let currentY = tableY - rowH - 2;
    const items = Array.isArray(invoice.items) ? invoice.items : [];
    items.forEach((item, idx) => {
      const bg = idx % 2 === 0 ? rgb(1, 1, 1) : rgb(0.973, 0.98, 0.988);
      page.drawRectangle({ x: 40, y: currentY - rowH + 6, width: width - 80, height: rowH, color: bg });
      const cells = [item.name.slice(0, 28), item.standardCode.slice(0, 16), String(item.quantity), fmt(item.unitPrice), fmt(item.lineTotal)];
      cells.forEach((cell, ci) => {
        const align = ci >= 2 ? "right" : "left";
        const tw = regular.widthOfTextAtSize(cell, 9);
        const textX = align === "right" ? colX[ci] + colW[ci] - tw - 4 : colX[ci] + 4;
        page.drawText(cell, { x: textX, y: currentY - rowH + 12, font: regular, size: 9, color: darkText });
      });
      currentY -= rowH;
    });

    // Totals
    const totalsY = currentY - 20;
    page.drawLine({ start: { x: width - 160, y: totalsY + 16 }, end: { x: width - 40, y: totalsY + 16 }, thickness: 0.75, color: lightGray });
    page.drawText("Subtotal:", { x: width - 160, y: totalsY, font: regular, size: 10, color: grayText });
    page.drawText(fmt(invoice.subtotal), {
      x: width - 40 - regular.widthOfTextAtSize(fmt(invoice.subtotal), 10),
      y: totalsY, font: regular, size: 10, color: darkText,
    });
    page.drawLine({ start: { x: width - 160, y: totalsY - 14 }, end: { x: width - 40, y: totalsY - 14 }, thickness: 0.75, color: lightGray });
    const totalVal = fmt(invoice.subtotal);
    page.drawText("Total:", { x: width - 160, y: totalsY - 28, font: bold, size: 13, color: navy });
    page.drawText(totalVal, {
      x: width - 40 - bold.widthOfTextAtSize(totalVal, 13),
      y: totalsY - 28, font: bold, size: 13, color: green,
    });

    // PAID watermark
    page.drawText("PAID", {
      x: 180, y: 380, font: bold, size: 80,
      color: rgb(0.02, 0.557, 0.408), opacity: 0.08, rotate: degrees(35),
    });

    // Footer
    const footerH = 56;
    page.drawRectangle({ x: 0, y: 0, width, height: footerH, color: lightGray });
    const footerLine1 = "This invoice serves as your official proof of purchase.";
    page.drawText(footerLine1, {
      x: (width - regular.widthOfTextAtSize(footerLine1, 10)) / 2,
      y: footerH - 16, font: regular, size: 10, color: grayText,
    });
    const verifyUrl = `Verify at: ${siteUrl}/verify/${String(invoice._id)}`;
    page.drawText(verifyUrl, {
      x: (width - regular.widthOfTextAtSize(verifyUrl, 9)) / 2,
      y: footerH - 32, font: regular, size: 9, color: grayText,
    });

    const pdfBytes = await pdfDoc.save();

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Invoice-${invoice.invoiceNumber}.pdf"`,
      },
    });
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
