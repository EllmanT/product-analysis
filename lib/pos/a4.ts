/**
 * A4 invoice. Inline styles throughout so the same markup prints from the browser and renders in
 * email clients (which drop most <style> rules). The QR is passed in as `qrSrc`: a data URL for
 * printing, a `cid:` reference for email (Gmail blocks data URLs).
 */
import { esc, formatDate, formatDeviceDate, isFiscalSlip, money, qty, type SlipBranch, type SlipSale } from "@/lib/pos/slip";

const INK = "#18181b";
const MUTED = "#71717a";
const LINE = "#e4e4e7";
const FONT = "'Segoe UI',Helvetica,Arial,sans-serif";

const label = (t: string) =>
  `<div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED};margin-bottom:4px">${esc(t)}</div>`;

const kv = (k: string, v?: string) =>
  v ? `<tr><td style="padding:2px 12px 2px 0;color:${MUTED};white-space:nowrap">${esc(k)}</td><td style="padding:2px 0;font-weight:600">${esc(v)}</td></tr>` : "";

export function a4Title(sale: SlipSale): string {
  const fiscal = isFiscalSlip(sale);
  if (sale.kind === "CREDIT_NOTE") return fiscal ? "Fiscal credit note" : "Credit note";
  return fiscal ? "Fiscal tax invoice" : "Receipt";
}

export function a4BodyHtml(sale: SlipSale, branch: SlipBranch, opts: { qrSrc?: string; duplicate?: boolean } = {}): string {
  const fiscal = isFiscalSlip(sale);
  const credit = sale.kind === "CREDIT_NOTE";
  const f = sale.fiscal ?? {};
  const b = sale.buyer ?? {};
  const number = fiscal ? (f.receiptGlobalNo ?? "") : (sale.provisionalNumber ?? "");
  const date = fiscal && f.receiptDate ? formatDeviceDate(f.receiptDate) : formatDate(sale.soldAt);

  const vatGroups = new Map<number, { net: number; vat: number }>();
  for (const l of sale.lines) {
    const g = vatGroups.get(l.taxPercent) ?? { net: 0, vat: 0 };
    g.net += l.lineTotalExcl;
    g.vat += l.vatAmount;
    vatGroups.set(l.taxPercent, g);
  }

  const th = (t: string, right = false) =>
    `<th style="text-align:${right ? "right" : "left"};padding:8px 10px;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};font-weight:600;border-bottom:1px solid ${INK}">${t}</th>`;
  const td = (t: string, right = false, bold = false) =>
    `<td style="padding:9px 10px;text-align:${right ? "right" : "left"};border-bottom:1px solid ${LINE};${bold ? "font-weight:600;" : ""}vertical-align:top">${t}</td>`;

  const rows = sale.lines
    .map(
      (l, i) =>
        `<tr>${td(String(i + 1))}${td(esc(l.description))}${td(esc(qty(l.quantity)), true)}${td(esc(money(l.unitPrice)), true)}${td(esc(l.taxPercent.toFixed(2)) + "%", true)}${td(esc(money(l.lineTotalIncl)), true, true)}</tr>`
    )
    .join("");

  const strongStyle = `font-size:15px;font-weight:700;border-top:2px solid ${INK};padding-top:10px;`;
  const totalRow = (k: string, v: string, strong = false) =>
    `<tr><td style="padding:4px 0;${strong ? strongStyle : `color:${MUTED};`}">${k}</td><td style="padding:4px 0;text-align:right;${strong ? strongStyle : ""}">${v}</td></tr>`;

  const vatRows = [...vatGroups.entries()]
    .map(([pct, g]) => totalRow(`VAT ${esc(pct.toFixed(2))}% on ${esc(money(g.net))}`, esc(money(g.vat))))
    .join("");

  const addressLines = [branch.address, branch.phone ? `Tel: ${branch.phone}` : "", branch.email].filter(Boolean) as string[];
  const company = `
    <div style="font-size:16px;font-weight:700">${esc(branch.companyName)}</div>
    ${branch.branchName ? `<div>${esc(branch.branchName)}</div>` : ""}
    ${addressLines.map((l) => `<div style="color:${MUTED}">${esc(l)}</div>`).join("")}
    ${
      branch.tin
        ? `<div style="color:${MUTED}">TIN ${esc(branch.tin)}${branch.vatNumber ? ` &nbsp;·&nbsp; VAT ${esc(branch.vatNumber)}` : ""}</div>`
        : branch.vatNumber
          ? `<div style="color:${MUTED}">VAT ${esc(branch.vatNumber)}</div>`
          : ""
    }`;

  const buyerLines = [[b.address, b.city].filter(Boolean).join(", "), b.phone ? `Tel: ${b.phone}` : "", b.email].filter(Boolean) as string[];

  // Amount by tax: one row per tax code and rate, as ZIMRA invoices list them.
  const taxGroups = new Map<string, { code: string; pct: number; net: number; vat: number; gross: number }>();
  for (const l of sale.lines) {
    const key = `${l.taxCode ?? ""}|${l.taxPercent}`;
    const g = taxGroups.get(key) ?? { code: l.taxCode ?? "", pct: l.taxPercent, net: 0, vat: 0, gross: 0 };
    g.net += l.lineTotalExcl;
    g.vat += l.vatAmount;
    g.gross += l.lineTotalIncl;
    taxGroups.set(key, g);
  }
  const taxRows = [...taxGroups.values()]
    .map((g) => `<tr>${td(esc(g.code || "-"))}${td(esc(g.pct.toFixed(2)) + "%", true)}${td(esc(money(g.net)), true)}${td(esc(money(g.vat)), true)}${td(esc(money(g.gross)), true)}</tr>`)
    .join("");

  return `
<div style="font-family:${FONT};font-size:12px;line-height:1.45;color:${INK};max-width:760px;margin:0 auto;background:#fff;padding:32px">
  ${opts.duplicate ? `<div style="text-align:right;font-size:10px;letter-spacing:.14em;color:${MUTED};margin-bottom:8px">DUPLICATE COPY</div>` : ""}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr>
    <td style="vertical-align:top">
      ${branch.logoUrl ? `<img src="${esc(branch.logoUrl)}" alt="" style="display:block;max-height:56px;max-width:180px;margin-bottom:10px" />` : ""}
      ${company}
    </td>
    <td style="vertical-align:top;text-align:right">
      <div style="font-size:22px;font-weight:700;letter-spacing:-.01em">${esc(a4Title(sale))}</div>
      ${number ? `<div style="font-size:13px;margin-top:4px">${credit ? "Credit note" : "Invoice"} No <b>${esc(number)}</b></div>` : ""}
      <div style="color:${MUTED};margin-top:2px">${esc(date)}</div>
    </td>
  </tr></table>

  ${
    fiscal
      ? ""
      : `<div style="margin-top:16px;border:1px solid ${INK};padding:8px 12px;font-weight:700;text-align:center">NOT A FISCAL TAX INVOICE. A fiscal invoice will follow.</div>`
  }

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:28px"><tr>
    <td style="vertical-align:top;width:50%;padding-right:16px">
      ${label("Billed to")}
      <div style="font-size:14px;font-weight:700">${esc(b.registerName || "Cash sale")}</div>
      ${b.tradeName && b.tradeName !== b.registerName ? `<div style="color:${MUTED}">t/a ${esc(b.tradeName)}</div>` : ""}
      ${buyerLines.map((l) => `<div style="color:${MUTED}">${esc(l)}</div>`).join("")}
      ${b.tin ? `<div style="color:${MUTED}">TIN ${esc(b.tin)}</div>` : ""}
      ${b.vatNumber ? `<div style="color:${MUTED}">VAT ${esc(b.vatNumber)}</div>` : ""}
    </td>
    <td style="vertical-align:top;width:50%">
      ${label("Details")}
      <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
        ${kv("Customer reference", (fiscal ? sale.invoiceNumber : sale.provisionalNumber) ?? "")}
        ${credit ? kv("Original invoice", sale.originalNumber ?? "") : ""}
        ${credit ? kv("Reason", sale.creditReason ?? "") : ""}
        ${kv("Currency", sale.currency)}
        ${kv("Payment", sale.paymentMethod)}
        ${fiscal && f.fiscalDayNo != null ? kv("Fiscal day", String(f.fiscalDayNo)) : ""}
        ${fiscal && f.receiptCounter != null ? kv("Receipt counter", String(f.receiptCounter)) : ""}
        ${fiscal ? kv("Device ID", f.deviceId ?? "") : ""}
        ${fiscal ? kv("Device serial", f.deviceSerialNumber ?? "") : ""}
      </table>
    </td>
  </tr></table>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:28px">
    <thead><tr>${th("#")}${th("Description")}${th("Qty", true)}${th("Unit price", true)}${th("VAT", true)}${th("Amount", true)}</tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:24px">
    <thead><tr>${th("Tax code")}${th("Rate", true)}${th("Net", true)}${th("VAT", true)}${th("Gross", true)}</tr></thead>
    <tbody>${taxRows}</tbody>
  </table>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:16px"><tr>
    <td style="width:55%"></td>
    <td style="vertical-align:top">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
        ${totalRow("Subtotal (excl. VAT)", esc(money(sale.subtotalExclTax)))}
        ${vatRows}
        ${totalRow(`${credit ? "Total credit" : "Total"} ${esc(sale.currency)}`, esc(money(sale.totalAmount)), true)}
      </table>
    </td>
  </tr></table>

  ${
    fiscal
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:32px;border-top:1px solid ${LINE}"><tr>
    <td style="width:120px;padding:16px 16px 0 0;vertical-align:top">${opts.qrSrc ? `<img src="${opts.qrSrc}" alt="Verification QR code" width="104" height="104" style="display:block;width:104px;height:104px" />` : ""}</td>
    <td style="padding-top:16px;vertical-align:top">
      ${label("ZIMRA fiscal verification")}
      <div style="font-size:16px;font-weight:700;letter-spacing:.06em">${esc(f.verificationCode)}</div>
      <div style="color:${MUTED};margin-top:4px">Scan the QR code, or verify at</div>
      <div style="word-break:break-all">${esc(f.verificationLink)}</div>
    </td>
  </tr></table>`
      : ""
  }

  <div style="margin-top:28px;padding-top:12px;border-top:1px solid ${LINE};text-align:center;color:${MUTED}">
    ${(branch.footerLines?.length ? branch.footerLines : ["Thank you for your business"]).map((l) => `<div>${esc(l)}</div>`).join("")}
  </div>
</div>`;
}

export const A4_PAGE_CSS = `@page { size: A4; margin: 12mm; } html,body{margin:0;background:#fff} @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`;

export function a4DocumentHtml(sale: SlipSale, branch: SlipBranch, opts: { qrSrc?: string; duplicate?: boolean } = {}): string {
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(sale.invoiceNumber ?? sale.provisionalNumber ?? "Invoice")}</title><style>${A4_PAGE_CSS}</style></head><body>${a4BodyHtml(sale, branch, opts)}</body></html>`;
}
