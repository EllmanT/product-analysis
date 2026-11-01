/**
 * The A4 tax invoice as a real PDF, drawn with pdf-lib (no browser needed, so it runs on Vercel).
 * It carries the same content as the HTML in a4.ts: seller and buyer details, the lines, VAT by rate and
 * by tax code, and the ZIMRA verification block (device ID, verification code, link and QR).
 */
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

import { a4Title } from "@/lib/pos/a4";
import { formatDate, formatDeviceDate, isFiscalSlip, money, qty, type SlipBranch, type SlipSale } from "@/lib/pos/slip";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM = 56;

const INK = rgb(0.094, 0.094, 0.106);
const MUTED = rgb(0.443, 0.443, 0.478);
const RULE = rgb(0.894, 0.894, 0.906);

/** Fiscal elements an invoice must show before it may be emailed as a tax invoice. Empty = complete. */
export function a4MissingElements(sale: SlipSale, branch: SlipBranch): string[] {
  const missing: string[] = [];
  if (!branch.companyName?.trim()) missing.push("company name");
  if (!branch.tin?.trim()) missing.push("seller TIN");
  if (sale.totalVat > 0 && !branch.vatNumber?.trim()) missing.push("seller VAT number");
  if (!sale.buyer?.registerName?.trim()) missing.push("buyer name");
  const f = sale.fiscal ?? {};
  if (!f.deviceId) missing.push("fiscal device ID");
  if (!f.verificationCode) missing.push("verification code");
  if (!f.qrCodeUrl) missing.push("QR code");
  return missing;
}

/** Fetch the branch logo for the PDF. Any problem just means the invoice goes out without a logo. */
async function loadLogo(doc: PDFDocument, url?: string): Promise<PDFImage | null> {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    const res = await fetch(u, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 1_000_000) return null;
    const type = res.headers.get("content-type") ?? "";
    if (type.includes("png")) return await doc.embedPng(bytes);
    if (type.includes("jpeg") || type.includes("jpg")) return await doc.embedJpg(bytes);
    return null;
  } catch {
    return null;
  }
}

export async function renderA4Pdf(
  sale: SlipSale,
  branch: SlipBranch,
  opts: { qrPng?: Uint8Array; duplicate?: boolean } = {}
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const glyphs = new Set(regular.getCharacterSet());

  const fiscal = isFiscalSlip(sale);
  const credit = sale.kind === "CREDIT_NOTE";
  const f = sale.fiscal ?? {};
  const b = sale.buyer ?? {};
  const number = fiscal ? (f.receiptGlobalNo ?? "") : (sale.provisionalNumber ?? "");
  const date = fiscal && f.receiptDate ? formatDeviceDate(f.receiptDate) : formatDate(sale.soldAt);

  // Standard fonts only cover WinAnsi: anything else prints as "?" rather than failing the whole PDF.
  const safe = (s: unknown) =>
    Array.from(String(s ?? ""))
      .map((ch) => (glyphs.has(ch.codePointAt(0)!) ? ch : ch === "\n" || ch === "\t" ? " " : "?"))
      .join("");

  const width = (s: string, size: number, font: PDFFont) => font.widthOfTextAtSize(s, size);

  /** Word-wrap to a width; a single word longer than the width (a URL) is broken wherever it fits. */
  const wrap = (raw: string, maxW: number, size: number, font: PDFFont): string[] => {
    const out: string[] = [];
    let line = "";
    for (const word of safe(raw).split(/\s+/).filter(Boolean)) {
      const trial = line ? `${line} ${word}` : word;
      if (width(trial, size, font) <= maxW) {
        line = trial;
        continue;
      }
      if (line) out.push(line);
      line = "";
      let rest = word;
      while (width(rest, size, font) > maxW) {
        let n = rest.length;
        while (n > 1 && width(rest.slice(0, n), size, font) > maxW) n--;
        out.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      line = rest;
    }
    if (line) out.push(line);
    return out.length ? out : [""];
  };

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const draw = (s: string, x: number, size: number, o: { font?: PDFFont; color?: ReturnType<typeof rgb>; align?: "left" | "right"; right?: number } = {}) => {
    const font = o.font ?? regular;
    const t = safe(s);
    const px = o.align === "right" ? (o.right ?? PAGE_W - MARGIN) - width(t, size, font) : x;
    page.drawText(t, { x: px, y, size, font, color: o.color ?? INK });
  };
  const rule = (yy: number, color = RULE, thickness = 0.6) =>
    page.drawLine({ start: { x: MARGIN, y: yy }, end: { x: PAGE_W - MARGIN, y: yy }, thickness, color });
  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };
  const ensure = (needed: number, redraw?: () => void) => {
    if (y - needed < BOTTOM) {
      newPage();
      redraw?.();
    }
  };

  // ---- header ---------------------------------------------------------------
  const logo = await loadLogo(doc, branch.logoUrl);
  const headTop = y;
  if (opts.duplicate) {
    draw("DUPLICATE COPY", 0, 8, { color: MUTED, align: "right" });
    y -= 14;
  }
  const leftTop = y;
  if (logo) {
    const scale = Math.min(150 / logo.width, 46 / logo.height, 1);
    const w = logo.width * scale;
    const h = logo.height * scale;
    page.drawImage(logo, { x: MARGIN, y: y - h, width: w, height: h });
    y -= h + 8;
  }
  y -= 12;
  draw(branch.companyName || "", MARGIN, 14, { font: bold });
  const companyLines = [
    branch.branchName,
    ...(branch.address ? wrap(branch.address, 250, 9, regular) : []),
    branch.phone ? `Tel: ${branch.phone}` : "",
    branch.email,
    branch.tin ? `TIN ${branch.tin}${branch.vatNumber ? `   VAT ${branch.vatNumber}` : ""}` : branch.vatNumber ? `VAT ${branch.vatNumber}` : "",
  ].filter(Boolean) as string[];
  for (const l of companyLines) {
    y -= 12;
    draw(l, MARGIN, 9, { color: l === branch.branchName ? INK : MUTED });
  }
  const leftBottom = y;

  y = opts.duplicate ? headTop - 14 : headTop;
  y -= 20;
  draw(a4Title(sale), 0, 20, { font: bold, align: "right" });
  if (number) {
    y -= 18;
    draw(`${credit ? "Credit note" : "Invoice"} No `, 0, 10, { align: "right", right: PAGE_W - MARGIN - width(safe(number), 10, bold) });
    draw(number, 0, 10, { font: bold, align: "right" });
  }
  y -= 14;
  draw(date, 0, 9, { color: MUTED, align: "right" });
  void leftTop;

  y = Math.min(y, leftBottom) - 22;

  if (!fiscal) {
    page.drawRectangle({ x: MARGIN, y: y - 22, width: CONTENT_W, height: 24, borderColor: INK, borderWidth: 0.8 });
    y -= 15;
    draw("NOT A FISCAL TAX INVOICE. A fiscal invoice will follow.", MARGIN + 12, 9.5, { font: bold });
    y -= 26;
  }

  // ---- billed to / details --------------------------------------------------
  const colRight = MARGIN + CONTENT_W / 2 + 10;
  const blockTop = y;
  draw("BILLED TO", MARGIN, 7.5, { color: MUTED });
  y -= 15;
  draw(b.registerName || "Cash sale", MARGIN, 11, { font: bold });
  const buyerLines = [
    b.tradeName && b.tradeName !== b.registerName ? `t/a ${b.tradeName}` : "",
    ...[b.address, b.city].filter(Boolean).flatMap((x) => wrap(x as string, 240, 9, regular)),
    b.phone ? `Tel: ${b.phone}` : "",
    b.email,
    b.tin ? `TIN ${b.tin}` : "",
    b.vatNumber ? `VAT ${b.vatNumber}` : "",
  ].filter(Boolean) as string[];
  for (const l of buyerLines) {
    y -= 12;
    draw(l, MARGIN, 9, { color: MUTED });
  }
  const buyerBottom = y;

  y = blockTop;
  draw("DETAILS", colRight, 7.5, { color: MUTED });
  const details: [string, string][] = [
    ["Customer reference", (fiscal ? sale.invoiceNumber : sale.provisionalNumber) ?? ""],
    ...(credit ? ([["Original invoice", sale.originalNumber ?? ""], ["Reason", sale.creditReason ?? ""]] as [string, string][]) : []),
    ["Currency", sale.currency],
    ["Payment", sale.paymentMethod],
    ...(fiscal
      ? ([
          ["Fiscal day", f.fiscalDayNo != null ? String(f.fiscalDayNo) : ""],
          ["Receipt counter", f.receiptCounter != null ? String(f.receiptCounter) : ""],
          ["Device ID", f.deviceId ?? ""],
          ["Device serial", f.deviceSerialNumber ?? ""],
        ] as [string, string][])
      : []),
  ].filter(([, v]) => v) as [string, string][];
  for (const [k, v] of details) {
    y -= 13;
    draw(k, colRight, 9, { color: MUTED });
    draw(v, colRight + 98, 9, { font: bold });
  }
  y = Math.min(y, buyerBottom) - 26;

  // ---- lines ----------------------------------------------------------------
  const cols = { n: MARGIN, desc: MARGIN + 22, qty: PAGE_W - MARGIN - 205, price: PAGE_W - MARGIN - 130, vat: PAGE_W - MARGIN - 78, amt: PAGE_W - MARGIN };
  const descW = cols.qty - cols.desc - 38;
  const lineHeader = () => {
    draw("#", cols.n, 7.5, { color: MUTED, font: bold });
    draw("DESCRIPTION", cols.desc, 7.5, { color: MUTED, font: bold });
    draw("QTY", 0, 7.5, { color: MUTED, font: bold, align: "right", right: cols.qty + 30 });
    draw("UNIT PRICE", 0, 7.5, { color: MUTED, font: bold, align: "right", right: cols.price + 52 });
    draw("VAT", 0, 7.5, { color: MUTED, font: bold, align: "right", right: cols.vat + 34 });
    draw("AMOUNT", 0, 7.5, { color: MUTED, font: bold, align: "right", right: cols.amt });
    y -= 6;
    rule(y, INK, 0.8);
    y -= 4;
  };
  lineHeader();
  sale.lines.forEach((l, i) => {
    const desc = wrap(l.description, descW, 9, regular);
    ensure(desc.length * 11 + 12, lineHeader);
    y -= 11;
    draw(String(i + 1), cols.n, 9);
    desc.forEach((d, di) => {
      if (di > 0) y -= 11;
      draw(d, cols.desc, 9);
    });
    const rowTop = y + (desc.length - 1) * 11;
    const keep = y;
    y = rowTop;
    draw(qty(l.quantity), 0, 9, { align: "right", right: cols.qty + 30 });
    draw(money(l.unitPrice), 0, 9, { align: "right", right: cols.price + 52 });
    draw(`${l.taxPercent.toFixed(2)}%`, 0, 9, { align: "right", right: cols.vat + 34 });
    draw(money(l.lineTotalIncl), 0, 9, { font: bold, align: "right", right: cols.amt });
    y = keep - 6;
    rule(y);
    y -= 3;
  });

  // ---- tax breakdown and totals ---------------------------------------------
  const taxGroups = new Map<string, { code: string; pct: number; net: number; vat: number; gross: number }>();
  for (const l of sale.lines) {
    const key = `${l.taxCode ?? ""}|${l.taxPercent}`;
    const g = taxGroups.get(key) ?? { code: l.taxCode ?? "", pct: l.taxPercent, net: 0, vat: 0, gross: 0 };
    g.net += l.lineTotalExcl;
    g.vat += l.vatAmount;
    g.gross += l.lineTotalIncl;
    taxGroups.set(key, g);
  }
  const groups = [...taxGroups.values()];

  ensure(40 + groups.length * 13 + 60 + groups.length * 13);
  y -= 22;
  draw("AMOUNT BY TAX", MARGIN, 7.5, { color: MUTED, font: bold });
  const tcols = { code: MARGIN, rate: MARGIN + 150, net: MARGIN + 270, vat: MARGIN + 390, gross: PAGE_W - MARGIN };
  y -= 11;
  draw("Tax code", tcols.code, 8, { color: MUTED });
  draw("Rate", 0, 8, { color: MUTED, align: "right", right: tcols.rate });
  draw("Net", 0, 8, { color: MUTED, align: "right", right: tcols.net });
  draw("VAT", 0, 8, { color: MUTED, align: "right", right: tcols.vat });
  draw("Gross", 0, 8, { color: MUTED, align: "right", right: tcols.gross });
  y -= 4;
  rule(y);
  for (const g of groups) {
    y -= 12;
    draw(g.code || "-", tcols.code, 9);
    draw(`${g.pct.toFixed(2)}%`, 0, 9, { align: "right", right: tcols.rate });
    draw(money(g.net), 0, 9, { align: "right", right: tcols.net });
    draw(money(g.vat), 0, 9, { align: "right", right: tcols.vat });
    draw(money(g.gross), 0, 9, { align: "right", right: tcols.gross });
  }

  y -= 20;
  const labelX = PAGE_W - MARGIN - 230;
  const totalLine = (k: string, v: string) => {
    y -= 14;
    draw(k, labelX, 9, { color: MUTED });
    draw(v, 0, 9, { align: "right" });
  };
  totalLine("Subtotal (excl. VAT)", money(sale.subtotalExclTax));
  for (const g of groups) totalLine(`VAT ${g.pct.toFixed(2)}% on ${money(g.net)}`, money(g.vat));
  y -= 6;
  rule(y, INK, 1.2);
  y -= 15;
  draw(`${credit ? "Total credit" : "Total"} ${sale.currency}`, labelX, 11, { font: bold });
  draw(money(sale.totalAmount), 0, 11, { font: bold, align: "right" });

  // ---- ZIMRA verification ---------------------------------------------------
  if (fiscal) {
    const linkLines = f.verificationLink ? wrap(f.verificationLink, CONTENT_W - 120, 8, regular) : [];
    ensure(40 + Math.max(104, 60 + linkLines.length * 10));
    y -= 26;
    rule(y);
    y -= 14;
    const qrTop = y;
    if (opts.qrPng) {
      const qr = await doc.embedPng(opts.qrPng);
      page.drawImage(qr, { x: MARGIN, y: qrTop - 92, width: 92, height: 92 });
    }
    const tx = MARGIN + 108;
    y = qrTop - 8;
    draw("ZIMRA FISCAL VERIFICATION", tx, 7.5, { color: MUTED, font: bold });
    y -= 18;
    draw(f.verificationCode ?? "", tx, 14, { font: bold });
    y -= 15;
    draw("Scan the QR code, or verify at", tx, 8.5, { color: MUTED });
    for (const l of linkLines) {
      y -= 10;
      draw(l, tx, 8);
    }
    y = Math.min(y, qrTop - 92);
  }

  // ---- footer ---------------------------------------------------------------
  const footer = branch.footerLines?.length ? branch.footerLines : ["Thank you for your business"];
  ensure(footer.length * 11 + 24);
  y -= 22;
  rule(y);
  for (const l of footer) {
    y -= 12;
    draw(l, 0, 8.5, { color: MUTED, align: "right", right: PAGE_W / 2 + width(safe(l), 8.5, regular) / 2 });
  }

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const t = safe(`Page ${i + 1} of ${pages.length}`);
    p.drawText(t, { x: PAGE_W - MARGIN - width(t, 7.5, regular), y: 28, size: 7.5, font: regular, color: MUTED });
  });

  doc.setTitle(`${a4Title(sale)} ${number}`.trim());
  doc.setProducer("StockFlow POS");
  return doc.save();
}
