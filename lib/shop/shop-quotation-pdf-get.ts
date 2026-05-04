import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

import Customer from "@/database/customer.model";
import Quotation from "@/database/quotation.model";
import handleError from "@/lib/handlers/error";
import { NotFoundError, UnauthorisedError } from "@/lib/http-errors";
import dbConnect from "@/lib/mongoose";
import { getSellerForPublicInvoice } from "@/lib/services/invoiceSeller.service";
import { getShopCustomerIdForRequest } from "@/lib/shop/customer-auth";

type QuotationLean = {
  _id: Types.ObjectId;
  items: Array<{
    name: string;
    standardCode: string;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
  }>;
  subtotal: string;
  status: string;
  paymentStatus: string;
  createdAt: Date;
};

type CustomerLean = {
  firstName: string;
  lastName: string;
  email: string;
  tradeName: string;
  address: string;
  buyerType?: string;
  tinNumber?: string;
  vatNumber?: string;
};

function fmt(s: string): string {
  const n = parseFloat(s);
  return `$${isNaN(n) ? "0.00" : n.toFixed(2)}`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}

export async function shopQuotationPdfGET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const customerId = await getShopCustomerIdForRequest();
    if (!customerId) throw new UnauthorisedError("Please sign in");

    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Quotation");

    const [quotation, customer] = await Promise.all([
      Quotation.findOne({
        _id: new Types.ObjectId(id),
        customerId: new Types.ObjectId(customerId),
      }).lean<QuotationLean | null>(),
      Customer.findById(customerId)
        .select(
          "firstName lastName email tradeName address buyerType tinNumber vatNumber"
        )
        .lean<CustomerLean | null>(),
    ]);

    if (!quotation) throw new NotFoundError("Quotation");
    if (!customer) throw new UnauthorisedError("Please sign in");

    const seller = await getSellerForPublicInvoice();

    const refId = String(quotation._id).slice(-8).toUpperCase();
    const createdAt = quotation.createdAt ? new Date(quotation.createdAt) : new Date();

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    const { width, height } = page.getSize();
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const navy = rgb(0.118, 0.227, 0.373);
    const blue = rgb(0.145, 0.388, 0.922);
    const lightGray = rgb(0.945, 0.961, 0.976);
    const darkText = rgb(0.067, 0.094, 0.153);
    const grayText = rgb(0.42, 0.447, 0.502);

    const headerH = 80;
    page.drawRectangle({ x: 0, y: height - headerH, width, height: headerH, color: navy });
    page.drawText("STOCKFLOW", { x: 40, y: height - 38, font: bold, size: 22, color: rgb(1, 1, 1) });
    page.drawText("QUOTATION", {
      x: width - 40 - bold.widthOfTextAtSize("QUOTATION", 13),
      y: height - 36,
      font: bold,
      size: 13,
      color: rgb(1, 1, 1),
    });
    page.drawText(`#${refId}`, {
      x: 40,
      y: height - 60,
      font: regular,
      size: 11,
      color: rgb(0.576, 0.765, 0.988),
    });

    const infoY = height - headerH - 28;

    const pushSellerLines = (): string[] => {
      const L: string[] = [];
      if (seller.legalName?.trim()) L.push(seller.legalName.trim());
      if (seller.tradeName?.trim() && seller.tradeName.trim() !== seller.legalName?.trim()) {
        L.push(seller.tradeName.trim());
      }
      if (seller.tin?.trim()) L.push(`TIN: ${seller.tin.trim().slice(0, 42)}`);
      if (seller.vatNumber?.trim()) L.push(`VAT: ${seller.vatNumber.trim().slice(0, 42)}`);
      if (seller.email?.trim()) L.push(seller.email.trim().slice(0, 54));
      if (seller.phone?.trim()) L.push(`Tel: ${seller.phone.trim().slice(0, 40)}`);
      const cityLine = [seller.address?.trim(), seller.city?.trim(), seller.region?.trim()]
        .filter(Boolean)
        .join(", ");
      if (cityLine) L.push(cityLine.slice(0, 72));
      if (L.length === 0) L.push("StockFlow");
      return L;
    };

    page.drawText("From:", { x: 40, y: infoY, font: bold, size: 10, color: grayText });
    let leftY = infoY - 14;
    for (const line of pushSellerLines()) {
      page.drawText(line, { x: 40, y: leftY, font: regular, size: 10, color: darkText });
      leftY -= 13;
    }

    const billX = 300;
    page.drawText("Bill To:", { x: billX, y: infoY, font: bold, size: 10, color: grayText });
    let lineY = infoY - 14;
    page.drawText(`${customer.firstName} ${customer.lastName}`, {
      x: billX,
      y: lineY,
      font: bold,
      size: 11,
      color: darkText,
    });
    lineY -= 15;
    const isBusiness = customer.buyerType === "business" && (customer.tradeName ?? "").trim() !== "";
    if (isBusiness) {
      page.drawText((customer.tradeName ?? "").trim(), {
        x: billX,
        y: lineY,
        font: regular,
        size: 10,
        color: darkText,
      });
      lineY -= 13;
      const tin = (customer.tinNumber ?? "").trim();
      const vat = (customer.vatNumber ?? "").trim();
      if (tin) {
        page.drawText(`TIN: ${tin.slice(0, 40)}`, {
          x: billX,
          y: lineY,
          font: regular,
          size: 9,
          color: darkText,
        });
        lineY -= 12;
      }
      if (vat) {
        page.drawText(`VAT: ${vat.slice(0, 40)}`, {
          x: billX,
          y: lineY,
          font: regular,
          size: 9,
          color: darkText,
        });
        lineY -= 12;
      }
    } else {
      page.drawText("Personal order", {
        x: billX,
        y: lineY,
        font: regular,
        size: 10,
        color: grayText,
      });
      lineY -= 14;
    }
    page.drawText(customer.email, { x: billX, y: lineY, font: regular, size: 10, color: darkText });
    lineY -= 14;
    if (customer.address) {
      page.drawText(customer.address.slice(0, 60), {
        x: billX,
        y: lineY,
        font: regular,
        size: 10,
        color: darkText,
      });
      lineY -= 14;
    }

    const rightX = width - 200;
    const rightRows: [string, string][] = [
      ["Quotation Date:", fmtDate(createdAt)],
      ["Reference:", `#${refId}`],
      ["Status:", quotation.status.charAt(0).toUpperCase() + quotation.status.slice(1)],
    ];
    rightRows.forEach(([label, value], idx) => {
      const ry = infoY - idx * 16;
      page.drawText(label, { x: rightX, y: ry, font: regular, size: 10, color: grayText });
      page.drawText(value, { x: rightX + 95, y: ry, font: bold, size: 10, color: darkText });
    });

    const dividerY = Math.min(leftY, lineY) - 20;
    page.drawLine({
      start: { x: 40, y: dividerY },
      end: { x: width - 40, y: dividerY },
      thickness: 0.75,
      color: lightGray,
    });

    const tableY = dividerY - 20;
    const colX = [40, 220, 330, 410, 490];
    const colW = [180, 110, 80, 80, 65];
    const headers = ["Product", "SKU", "Qty", "Unit Price", "Total"];
    const rowH = 26;

    page.drawRectangle({ x: 40, y: tableY - rowH + 4, width: width - 80, height: rowH, color: navy });
    headers.forEach((h, i) => {
      const align = i >= 3 ? "right" : "left";
      const tw = bold.widthOfTextAtSize(h, 10);
      const textX = align === "right" ? colX[i] + colW[i] - tw - 4 : colX[i] + 4;
      page.drawText(h, { x: textX, y: tableY - rowH + 10, font: bold, size: 10, color: rgb(1, 1, 1) });
    });

    let currentY = tableY - rowH - 2;
    const items = Array.isArray(quotation.items) ? quotation.items : [];
    items.forEach((item, idx) => {
      const bg = idx % 2 === 0 ? rgb(1, 1, 1) : rgb(0.973, 0.98, 0.988);
      page.drawRectangle({ x: 40, y: currentY - rowH + 6, width: width - 80, height: rowH, color: bg });
      const cells = [
        item.name.slice(0, 28),
        item.standardCode.slice(0, 16),
        String(item.quantity),
        fmt(item.unitPrice),
        fmt(item.lineTotal),
      ];
      cells.forEach((cell, ci) => {
        const align = ci >= 2 ? "right" : "left";
        const tw = regular.widthOfTextAtSize(cell, 9);
        const textX = align === "right" ? colX[ci] + colW[ci] - tw - 4 : colX[ci] + 4;
        page.drawText(cell, { x: textX, y: currentY - rowH + 12, font: regular, size: 9, color: darkText });
      });
      currentY -= rowH;
    });

    const totalsY = currentY - 20;
    page.drawLine({
      start: { x: width - 160, y: totalsY + 16 },
      end: { x: width - 40, y: totalsY + 16 },
      thickness: 0.75,
      color: lightGray,
    });
    page.drawText("Subtotal:", { x: width - 160, y: totalsY, font: regular, size: 10, color: grayText });
    page.drawText(fmt(quotation.subtotal), {
      x: width - 40 - regular.widthOfTextAtSize(fmt(quotation.subtotal), 10),
      y: totalsY,
      font: regular,
      size: 10,
      color: darkText,
    });
    page.drawLine({
      start: { x: width - 160, y: totalsY - 14 },
      end: { x: width - 40, y: totalsY - 14 },
      thickness: 0.75,
      color: lightGray,
    });
    const totalVal = fmt(quotation.subtotal);
    page.drawText("Total:", { x: width - 160, y: totalsY - 28, font: bold, size: 13, color: navy });
    page.drawText(totalVal, {
      x: width - 40 - bold.widthOfTextAtSize(totalVal, 13),
      y: totalsY - 28,
      font: bold,
      size: 13,
      color: blue,
    });

    const footerH = 44;
    page.drawRectangle({ x: 0, y: 0, width, height: footerH, color: lightGray });
    const footerLine1 = "Thank you for your business — StockFlow";
    page.drawText(footerLine1, {
      x: (width - regular.widthOfTextAtSize(footerLine1, 10)) / 2,
      y: footerH - 18,
      font: regular,
      size: 10,
      color: grayText,
    });

    const pdfBytes = await pdfDoc.save();

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Quotation-${refId}.pdf"`,
      },
    });
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
