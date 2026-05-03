/** All email templates use inline styles only — email clients strip external CSS. */

import type { InvoiceSeller } from "@/lib/services/invoiceSeller.service";

function fmt(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** Escape text for HTML body (names, addresses — user-supplied fields). */
function esc(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sellerEmailLines(s: InvoiceSeller): string[] {
  const lines: string[] = [];
  if (s.legalName?.trim()) lines.push(s.legalName.trim());
  if (s.tradeName?.trim() && s.tradeName.trim() !== s.legalName?.trim())
    lines.push(s.tradeName.trim());
  if (s.tin?.trim()) lines.push(`TIN: ${s.tin.trim()}`);
  if (s.vatNumber?.trim()) lines.push(`VAT: ${s.vatNumber.trim()}`);
  if (s.email?.trim()) lines.push(s.email.trim());
  if (s.phone?.trim()) lines.push(`Tel: ${s.phone.trim()}`);
  const addrParts = [s.address?.trim(), s.city?.trim(), s.region?.trim()].filter(Boolean);
  const addrJoined = addrParts.join(", ");
  if (addrJoined) lines.push(addrJoined);
  if (lines.length === 0) lines.push("StockFlow");
  return lines;
}

type BillToEmail = {
  displayName: string;
  tradeName?: string;
  email: string;
  phone?: string;
  address?: string;
  tin?: string;
  vat?: string;
};

function billToEmailLines(b: BillToEmail): string[] {
  const lines: string[] = [];
  if (b.displayName?.trim()) lines.push(b.displayName.trim());
  if (b.tradeName?.trim()) lines.push(b.tradeName.trim());
  if (b.tin?.trim()) lines.push(`TIN: ${b.tin.trim()}`);
  if (b.vat?.trim()) lines.push(`VAT: ${b.vat.trim()}`);
  if (b.email?.trim()) lines.push(b.email.trim());
  if (b.phone?.trim()) lines.push(`Tel: ${b.phone.trim()}`);
  if (b.address?.trim()) lines.push(b.address.trim());
  return lines;
}

function dualPartyBlock(titleA: string, linesA: string[], titleB: string, linesB: string[]): string {
  const cell = (tit: string, lines: string[], side: "left" | "right") => {
    const body = lines
      .filter((x) => x?.trim())
      .map(
        (line) =>
          `<div style="margin:0 0 4px;font-size:13px;line-height:1.4;color:#111827;">${esc(line)}</div>`
      )
      .join("");
    const border = side === "left" ? "border-right:1px solid #E5E7EB;" : "";
    const pad = side === "left" ? "8px 12px 16px 0" : "8px 0 16px 12px";
    return `
    <td valign="top" style="width:50%;padding:${pad};${border}">
      <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">${esc(
        tit
      )}</p>
      ${body}
    </td>`;
  };
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px 0;background:#F9FAFB;border-radius:8px;">
    <tr>${cell(titleA, linesA, "left")}${cell(titleB, linesB, "right")}</tr>
  </table>`;
}

export function baseEmailTemplate(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:#1E3A5F;padding:24px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="color:#ffffff;font-size:24px;font-weight:700;letter-spacing:1px;">STOCKFLOW</td>
                <td align="right" style="color:#93C5FD;font-size:12px;">B2B Trade Platform</td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Content -->
        <tr><td style="padding:32px;">${content}</td></tr>
        <!-- Footer -->
        <tr>
          <td style="background:#F1F5F9;padding:20px 32px;text-align:center;">
            <p style="margin:0;color:#6B7280;font-size:12px;">© StockFlow · You're receiving this because you have an account with us</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function quotationEmailTemplate(data: {
  customerFirstName: string;
  quotationId: string;
  referenceId: string;
  items: Array<{ name: string; quantity: number; unitPrice: number; lineTotal: number }>;
  subtotal: number;
  total: number;
  siteUrl: string;
  seller: InvoiceSeller;
  billTo: BillToEmail;
}): string {
  const itemRows = data.items
    .map(
      (item, i) => `
      <tr style="background:${i % 2 === 0 ? "#ffffff" : "#F8FAFC"};">
        <td style="padding:10px 12px;font-size:14px;color:#111827;border-bottom:1px solid #E5E7EB;">${esc(
          item.name
        )}</td>
        <td style="padding:10px 12px;font-size:14px;color:#374151;border-bottom:1px solid #E5E7EB;text-align:center;">${
          item.quantity
        }</td>
        <td style="padding:10px 12px;font-size:14px;color:#374151;border-bottom:1px solid #E5E7EB;text-align:right;">${fmt(
          item.unitPrice
        )}</td>
        <td style="padding:10px 12px;font-size:14px;font-weight:600;color:#111827;border-bottom:1px solid #E5E7EB;text-align:right;">${fmt(
          item.lineTotal
        )}</td>
      </tr>`
    )
    .join("");

  const party = dualPartyBlock(
    "From",
    sellerEmailLines(data.seller),
    "Bill to",
    billToEmailLines(data.billTo)
  );

  const linkBase = data.siteUrl || "";
  const viewUrl = `${linkBase}/account/quotations/${data.quotationId}`;

  const content = `
    <p style="margin:0 0 16px;font-size:12px;font-weight:700;color:#1E40AF;text-transform:uppercase;">Quotation #${
      data.referenceId
    }</p>
    ${party}
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1E3A5F;">Your quotation is ready, ${esc(
      data.customerFirstName
    )}!</h2>
    <p style="margin:0 0 24px;color:#6B7280;font-size:15px;">Thank you for your order. Your quotation has been confirmed &mdash; please sign in to review line items and complete payment.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:20px;">
      <thead>
        <tr style="background:#1E40AF;">
          <th style="padding:10px 12px;font-size:13px;color:#ffffff;text-align:left;font-weight:600;">Product</th>
          <th style="padding:10px 12px;font-size:13px;color:#ffffff;text-align:center;font-weight:600;">Qty</th>
          <th style="padding:10px 12px;font-size:13px;color:#ffffff;text-align:right;font-weight:600;">Unit Price</th>
          <th style="padding:10px 12px;font-size:13px;color:#ffffff;text-align:right;font-weight:600;">Total</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div style="text-align:right;margin-bottom:24px;">
      <table cellpadding="0" cellspacing="0" style="margin-left:auto;">
        <tr>
          <td style="padding:6px 12px;font-size:14px;color:#6B7280;">Subtotal</td>
          <td style="padding:6px 12px;font-size:14px;color:#111827;font-weight:600;text-align:right;">${fmt(
            data.subtotal
          )}</td>
        </tr>
        <tr style="border-top:2px solid #E5E7EB;">
          <td style="padding:8px 12px;font-size:16px;font-weight:700;color:#1E40AF;">Total</td>
          <td style="padding:8px 12px;font-size:18px;font-weight:700;color:#1E40AF;text-align:right;">${fmt(
            data.total
          )}</td>
        </tr>
      </table>
    </div>

    <div style="text-align:center;margin:24px 0;">
      <a href="${viewUrl}" style="display:inline-block;background:#2563EB;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;">View quotation &amp; pay</a>
    </div>

    <p style="margin:0;font-size:13px;color:#6B7280;text-align:center;">You can print or download the quotation PDF from that page anytime.</p>
  `;

  return baseEmailTemplate(content);
}

type InvoiceBuyerSnap = {
  registerName?: string;
  tradeName?: string;
  tin?: string;
  vatNumber?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  province?: string;
};

function buyerSnapToBillToEmail(b: InvoiceBuyerSnap | null | undefined): BillToEmail {
  if (!b) {
    return { displayName: "", email: "" };
  }
  const reg = b.registerName?.trim() ?? "";
  const tn = b.tradeName?.trim() ?? "";
  const displayName =
    reg && tn && reg.toLowerCase() !== tn.toLowerCase()
      ? reg
      : reg || tn;
  const tradeLine =
    reg && tn && reg.toLowerCase() !== tn.toLowerCase()
      ? tn
      : "";
  const loc = [b.city, b.province].filter((x) => x?.trim()).join(", ");
  const addrParts = [b.address?.trim(), loc || undefined].filter(Boolean);
  return {
    displayName,
    tradeName: tradeLine,
    email: b.email ?? "",
    phone: b.phone,
    address: addrParts.join(", ") || undefined,
    tin: b.tin,
    vat: b.vatNumber,
  };
}

export function invoiceEmailTemplate(data: {
  customerFirstName: string;
  invoiceId: string;
  invoiceNumber: string;
  items: Array<{ name: string; quantity: number; unitPrice: number; lineTotal: number }>;
  subtotal: number;
  total: number;
  siteUrl: string;
  seller: InvoiceSeller;
  buyerSnapshot: InvoiceBuyerSnap | null | undefined;
}): string {
  const itemRows = data.items
    .map(
      (item, i) => `
      <tr style="background:${i % 2 === 0 ? "#ffffff" : "#F8FAFC"};">
        <td style="padding:10px 12px;font-size:14px;color:#111827;border-bottom:1px solid #E5E7EB;">${esc(
          item.name
        )}</td>
        <td style="padding:10px 12px;font-size:14px;color:#374151;border-bottom:1px solid #E5E7EB;text-align:center;">${
          item.quantity
        }</td>
        <td style="padding:10px 12px;font-size:14px;color:#374151;border-bottom:1px solid #E5E7EB;text-align:right;">${fmt(
          item.unitPrice
        )}</td>
        <td style="padding:10px 12px;font-size:14px;font-weight:600;color:#111827;border-bottom:1px solid #E5E7EB;text-align:right;">${fmt(
          item.lineTotal
        )}</td>
      </tr>`
    )
    .join("");

  const bt = buyerSnapToBillToEmail(data.buyerSnapshot);
  if (!bt.displayName?.trim() && data.customerFirstName) {
    bt.displayName = data.customerFirstName;
  }
  const party = dualPartyBlock(
    "From",
    sellerEmailLines(data.seller),
    "Bill to",
    billToEmailLines(bt)
  );

  const linkBase = data.siteUrl || "";
  const invoiceUrl = `${linkBase}/account/invoices/${data.invoiceId}`;

  const headerOverride = `<table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#064E3B;padding:24px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="color:#ffffff;font-size:24px;font-weight:700;letter-spacing:1px;">STOCKFLOW</td>
                <td align="right" style="color:#6EE7B7;font-size:12px;">B2B Trade Platform</td>
              </tr>
            </table>
          </td>
        </tr>`;

  const content = `
    <p style="margin:0 0 16px;font-size:12px;font-weight:700;color:#059669;text-transform:uppercase;">Invoice ${esc(
      data.invoiceNumber
    )}</p>
    ${party}
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1E3A5F;">Your invoice is ready, ${esc(
      data.customerFirstName
    )}!</h2>
    <p style="margin:0 0 24px;color:#6B7280;font-size:15px;">We've issued your invoice. Open your account to view full details, print, or download the PDF.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:20px;">
      <thead>
        <tr style="background:#1E40AF;">
          <th style="padding:10px 12px;font-size:13px;color:#ffffff;text-align:left;font-weight:600;">Product</th>
          <th style="padding:10px 12px;font-size:13px;color:#ffffff;text-align:center;font-weight:600;">Qty</th>
          <th style="padding:10px 12px;font-size:13px;color:#ffffff;text-align:right;font-weight:600;">Unit Price</th>
          <th style="padding:10px 12px;font-size:13px;color:#ffffff;text-align:right;font-weight:600;">Total</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div style="text-align:right;margin-bottom:24px;">
      <table cellpadding="0" cellspacing="0" style="margin-left:auto;">
        <tr>
          <td style="padding:6px 12px;font-size:14px;color:#6B7280;">Subtotal</td>
          <td style="padding:6px 12px;font-size:14px;color:#111827;font-weight:600;text-align:right;">${fmt(
            data.subtotal
          )}</td>
        </tr>
        <tr style="border-top:2px solid #E5E7EB;">
          <td style="padding:8px 12px;font-size:16px;font-weight:700;color:#065F46;">Total</td>
          <td style="padding:8px 12px;font-size:18px;font-weight:700;color:#065F46;text-align:right;">${fmt(
            data.total
          )}</td>
        </tr>
      </table>
    </div>

    <div style="text-align:center;margin:24px 0;">
      <a href="${invoiceUrl}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;">View invoice</a>
    </div>

    <p style="margin:0;font-size:13px;color:#6B7280;text-align:center;">Keep this invoice for your records.</p>
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:Arial,sans-serif;">
  ${headerOverride}
        <tr><td style="padding:32px;">${content}</td></tr>
        <tr>
          <td style="background:#F1F5F9;padding:20px 32px;text-align:center;">
            <p style="margin:0;color:#6B7280;font-size:12px;">© StockFlow · You're receiving this because you have an account with us</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function adminQuotationNotificationTemplate(data: {
  customerName: string;
  tradeName: string;
  customerEmail: string;
  quotationId: string;
  referenceId: string;
  itemCount: number;
  total: number;
  siteUrl: string;
}): string {
  const content = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1E3A5F;">New Quotation Received</h2>

    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
      <tr style="border-bottom:1px solid #E5E7EB;">
        <td style="padding:10px 0;font-size:14px;color:#6B7280;width:40%;">Customer Name</td>
        <td style="padding:10px 0;font-size:14px;color:#111827;font-weight:600;">${esc(data.customerName)}</td>
      </tr>
      <tr style="border-bottom:1px solid #E5E7EB;">
        <td style="padding:10px 0;font-size:14px;color:#6B7280;">Trade Name</td>
        <td style="padding:10px 0;font-size:14px;color:#111827;font-weight:600;">${esc(
          data.tradeName
        )}</td>
      </tr>
      <tr style="border-bottom:1px solid #E5E7EB;">
        <td style="padding:10px 0;font-size:14px;color:#6B7280;">Email</td>
        <td style="padding:10px 0;font-size:14px;color:#111827;font-weight:600;">${esc(
          data.customerEmail
        )}</td>
      </tr>
      <tr style="border-bottom:1px solid #E5E7EB;">
        <td style="padding:10px 0;font-size:14px;color:#6B7280;">Reference</td>
        <td style="padding:10px 0;font-size:14px;color:#111827;font-weight:600;">#${esc(
          data.referenceId
        )}</td>
      </tr>
      <tr style="border-bottom:1px solid #E5E7EB;">
        <td style="padding:10px 0;font-size:14px;color:#6B7280;">Items</td>
        <td style="padding:10px 0;font-size:14px;color:#111827;font-weight:600;">${
          data.itemCount
        } item${data.itemCount !== 1 ? "s" : ""}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;font-size:14px;color:#6B7280;">Total</td>
        <td style="padding:10px 0;font-size:16px;color:#1E40AF;font-weight:700;">${fmt(data.total)}</td>
      </tr>
    </table>

    <div style="text-align:center;">
      <a href="${data.siteUrl}/admin/quotations/${data.quotationId}" style="display:inline-block;background:#1E40AF;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;">View in Admin Panel</a>
    </div>
  `;

  return baseEmailTemplate(content);
}

export function adminInvoiceSentNotificationTemplate(data: {
  customerName: string;
  tradeName: string;
  customerEmail: string;
  invoiceNumber: string;
  invoiceId: string;
  total: number;
  siteUrl: string;
}): string {
  const content = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1E3A5F;">Invoice sent to customer</h2>

    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
      <tr style="border-bottom:1px solid #E5E7EB;">
        <td style="padding:10px 0;font-size:14px;color:#6B7280;width:40%;">Customer</td>
        <td style="padding:10px 0;font-size:14px;color:#111827;font-weight:600;">${esc(
          data.customerName
        )}</td>
      </tr>
      <tr style="border-bottom:1px solid #E5E7EB;">
        <td style="padding:10px 0;font-size:14px;color:#6B7280;">Trade name</td>
        <td style="padding:10px 0;font-size:14px;color:#111827;font-weight:600;">${esc(
          data.tradeName
        )}</td>
      </tr>
      <tr style="border-bottom:1px solid #E5E7EB;">
        <td style="padding:10px 0;font-size:14px;color:#6B7280;">Email</td>
        <td style="padding:10px 0;font-size:14px;color:#111827;font-weight:600;">${esc(
          data.customerEmail
        )}</td>
      </tr>
      <tr style="border-bottom:1px solid #E5E7EB;">
        <td style="padding:10px 0;font-size:14px;color:#6B7280;">Invoice number</td>
        <td style="padding:10px 0;font-size:14px;color:#111827;font-weight:600;">${esc(
          data.invoiceNumber
        )}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;font-size:14px;color:#6B7280;">Total</td>
        <td style="padding:10px 0;font-size:16px;color:#059669;font-weight:700;">${fmt(data.total)}</td>
      </tr>
    </table>

    <div style="text-align:center;">
      <a href="${data.siteUrl}/admin/invoices/${data.invoiceId}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;">View invoice (admin)</a>
    </div>
  `;

  return baseEmailTemplate(content);
}
