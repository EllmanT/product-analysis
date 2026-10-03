/**
 * 80mm till slip. One pure function so the browser print and the emailed copy are identical.
 * Layout follows the desktop app's "EpsonSlip - new-shop-online" report, with the client
 * specific text and the hard-coded 15.50% moved into branch settings / the sale itself.
 */

export interface SlipBranch {
  companyName?: string;
  branchName?: string;
  address?: string;
  phone?: string;
  email?: string;
  tin?: string;
  vatNumber?: string;
  logoUrl?: string;
  footerLines?: string[];
}

export interface SlipLine {
  description: string;
  quantity: number;
  unitPrice: number;
  taxPercent: number;
  vatAmount: number;
  lineTotalExcl: number;
  lineTotalIncl: number;
}

export interface SlipSale {
  /** "CREDIT_NOTE" prints as a credit note (negative amounts) that refers to the original invoice. */
  kind?: string;
  originalNumber?: string;
  creditReason?: string;
  status: string;
  currency: string;
  paymentMethod: string;
  lines: SlipLine[];
  subtotalExclTax: number;
  totalVat: number;
  totalAmount: number;
  buyer?: { registerName?: string; tin?: string; vatNumber?: string; address?: string; phone?: string; email?: string };
  invoiceNumber?: string;
  provisionalNumber?: string;
  soldAt: string | Date;
  fiscal?: {
    verificationCode?: string;
    verificationLink?: string;
    qrCodeUrl?: string;
    fiscalDayNo?: number | null;
    receiptGlobalNo?: string;
    deviceId?: string;
    deviceSerialNumber?: string;
    receiptDate?: string;
  };
}

const TZ = "Africa/Harare";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const money = (n: number) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const qty = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3))));

function formatDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return String(d);
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("day")}-${g("month")}-${g("year")} ${g("hour")}:${g("minute")}:${g("second")}`;
}

/** The device returns a local timestamp without a zone ("2026-10-03T12:57:04"); show it as given. */
function formatDeviceDate(s: string): string {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}:\d{2}:\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]} ${m[4]}` : s;
}

export function isFiscalSlip(sale: SlipSale): boolean {
  return sale.status === "FISCALISED" && !!sale.fiscal?.verificationCode;
}

const row = (k: string, v: string) =>
  v ? `<div class="kv"><span>${esc(k)}</span><b>${esc(v)}</b></div>` : "";

/** The slip content without the surrounding document (used inside the email too). */
export function slipBodyHtml(
  sale: SlipSale,
  branch: SlipBranch,
  opts: { qrDataUrl?: string; duplicate?: boolean; test?: boolean } = {}
): string {
  const fiscal = isFiscalSlip(sale);
  const credit = sale.kind === "CREDIT_NOTE";
  const f = sale.fiscal ?? {};
  const b = sale.buyer ?? {};
  const title = credit
    ? fiscal
      ? "FISCAL CREDIT NOTE"
      : "PROVISIONAL CREDIT NOTE"
    : fiscal
      ? "FISCAL TAX INVOICE"
      : "PROVISIONAL RECEIPT";

  const vatGroups = new Map<number, { net: number; vat: number; gross: number }>();
  for (const l of sale.lines) {
    const g = vatGroups.get(l.taxPercent) ?? { net: 0, vat: 0, gross: 0 };
    g.net += l.lineTotalExcl;
    g.vat += l.vatAmount;
    g.gross += l.lineTotalIncl;
    vatGroups.set(l.taxPercent, g);
  }

  const items = sale.lines
    .map(
      (l) => `
      <div class="item">
        <div class="name">${esc(l.description)}</div>
        <div class="calc"><span>${esc(qty(l.quantity))} x ${esc(money(l.unitPrice))}</span><b>${esc(money(l.lineTotalIncl))}</b></div>
      </div>`
    )
    .join("");

  const vatRows = [...vatGroups.entries()]
    .map(
      ([pct, g]) =>
        `<tr><td>${esc(pct.toFixed(2))}</td><td>${esc(money(g.net))}</td><td>${esc(money(g.vat))}</td><td>${esc(money(g.gross))}</td></tr>`
    )
    .join("");

  return `
  <div class="slip">
    ${opts.test ? `<div class="warn">*** TEST PRINT: NOT A RECEIPT ***</div>` : ""}
    ${opts.duplicate ? `<div class="dup">DUPLICATE COPY</div>` : ""}
    ${branch.logoUrl ? `<img class="logo" src="${esc(branch.logoUrl)}" alt="" />` : ""}
    <div class="title">${title}</div>
    ${
      fiscal
        ? ""
        : credit
          ? `<div class="warn">NOT A FISCAL CREDIT NOTE<br/>A fiscal credit note will follow</div>`
          : `<div class="warn">NOT A FISCAL TAX INVOICE<br/>A fiscal invoice will follow</div>`
    }
    <div class="co">
      <b>${esc(branch.companyName)}</b>
      ${branch.branchName ? `<div>${esc(branch.branchName)}</div>` : ""}
      ${branch.address ? `<div>${esc(branch.address)}</div>` : ""}
      ${branch.phone ? `<div>Tel: ${esc(branch.phone)}</div>` : ""}
      ${branch.email ? `<div>${esc(branch.email)}</div>` : ""}
      ${branch.tin ? `<div>TIN: ${esc(branch.tin)}</div>` : ""}
      ${branch.vatNumber ? `<div>VAT No: ${esc(branch.vatNumber)}</div>` : ""}
    </div>
    <hr/>
    ${row("Customer", b.registerName || "CASH SALE")}
    ${row("Customer TIN", b.tin ?? "")}
    ${row("Customer VAT", b.vatNumber ?? "")}
    ${row("Address", b.address ?? "")}
    <hr/>
    ${fiscal ? row(credit ? "Credit note No" : "Invoice No", f.receiptGlobalNo ?? "") : ""}
    ${credit ? row("Original invoice", sale.originalNumber ?? "") : ""}
    ${credit ? row("Reason", sale.creditReason ?? "") : ""}
    ${row("Customer reference", (fiscal ? sale.invoiceNumber : sale.provisionalNumber) ?? "")}
    ${row("Date", fiscal && f.receiptDate ? formatDeviceDate(f.receiptDate) : formatDate(sale.soldAt))}
    ${fiscal && f.fiscalDayNo != null ? row("Fiscal Day", String(f.fiscalDayNo)) : ""}
    ${fiscal ? row("Device ID", f.deviceId ?? "") : ""}
    ${fiscal ? row("Serial No", f.deviceSerialNumber ?? "") : ""}
    ${row("Currency", sale.currency)}
    <hr/>
    <div class="head"><span>Description</span><span>Total (incl)</span></div>
    ${items}
    <hr/>
    <table class="vat"><thead><tr><th>VAT%</th><th>Net Amt</th><th>VAT</th><th>Amount</th></tr></thead><tbody>${vatRows}</tbody></table>
    <div class="total"><span>${credit ? "TOTAL CREDIT" : "TOTAL"} ${esc(sale.currency)}</span><b>${esc(money(sale.totalAmount))}</b></div>
    ${row("Payment", sale.paymentMethod)}
    ${
      fiscal
        ? `<hr/>
    <div class="center">Verification Code</div>
    <div class="code">${esc(f.verificationCode)}</div>
    <div class="center small">You can verify manually at</div>
    <div class="center small link">${esc(f.verificationLink)}</div>
    ${opts.qrDataUrl ? `<img class="qr" src="${opts.qrDataUrl}" alt="QR" />` : ""}`
        : ""
    }
    <hr/>
    <div class="center">${(branch.footerLines?.length ? branch.footerLines : ["Thank you for your business"])
      .map((l) => `<div>${esc(l)}</div>`)
      .join("")}</div>
  </div>`;
}

export const SLIP_CSS = `
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; font-size: 11px; line-height: 1.35; }
  .slip { width: 72mm; margin: 0 auto; padding: 3mm 0 6mm; font-variant-numeric: tabular-nums; }
  .logo { display: block; max-width: 40mm; max-height: 18mm; margin: 0 auto 2mm; }
  .title { text-align: center; font-weight: 700; font-size: 14px; letter-spacing: .02em; margin: 1mm 0; }
  .warn { text-align: center; font-weight: 700; font-size: 10px; border: 1px solid #000; padding: 1mm; margin: 1mm 0 2mm; }
  .dup { text-align: center; font-weight: 700; font-size: 10px; letter-spacing: .12em; margin-bottom: 1mm; }
  .co { text-align: center; }
  .co b { font-size: 12px; }
  hr { border: 0; border-top: 1px dashed #000; margin: 2mm 0; }
  .kv { display: flex; justify-content: space-between; gap: 3mm; }
  .kv span { flex: none; }
  .kv b { font-weight: 600; text-align: right; word-break: break-all; }
  .head { display: flex; justify-content: space-between; font-weight: 700; }
  .item { margin: 1mm 0; }
  .item .name { font-weight: 600; word-break: break-word; }
  .item .calc { display: flex; justify-content: space-between; }
  table.vat { width: 100%; border-collapse: collapse; font-size: 10px; }
  table.vat th { text-align: right; font-weight: 700; border-bottom: 1px solid #000; }
  table.vat td { text-align: right; }
  table.vat th:first-child, table.vat td:first-child { text-align: left; }
  .total { display: flex; justify-content: space-between; font-size: 15px; font-weight: 700; margin-top: 2mm; }
  .center { text-align: center; }
  .small { font-size: 10px; }
  .link { word-break: break-all; }
  .code { text-align: center; font-weight: 700; font-size: 14px; letter-spacing: .06em; margin: 1mm 0; }
  .qr { display: block; width: 34mm; height: 34mm; margin: 2mm auto 0; image-rendering: pixelated; }
`;

/** A full printable document. */
export function slipDocumentHtml(
  sale: SlipSale,
  branch: SlipBranch,
  opts: { qrDataUrl?: string; duplicate?: boolean; test?: boolean } = {}
): string {
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(
    sale.invoiceNumber ?? sale.provisionalNumber ?? "Receipt"
  )}</title><style>${SLIP_CSS}</style></head><body>${slipBodyHtml(sale, branch, opts)}</body></html>`;
}
