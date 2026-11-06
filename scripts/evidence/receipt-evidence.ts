/**
 * Receipt evidence: turn a fiscalised receipt into the two printed documents (80 mm slip and A4 invoice) as PDFs,
 * then PROVE them: read the text and the QR code back out of the PDF files themselves, compare with what the
 * gateway returned, and (optionally) ask ZIMRA's public verification page whether it knows the invoice.
 *
 * Test tooling only (not shipped). Uses Chromium (Playwright) for the slip, pdf-lib for the A4 invoice,
 * pdfjs-dist to read PDFs back and jsQR to decode the QR.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { chromium, type Browser } from "playwright";

import { renderA4Pdf } from "../../lib/pos/a4Pdf";
import { slipDocumentHtml, type SlipBranch, type SlipSale } from "../../lib/pos/slip";

// ---------------------------------------------------------------------------
// QR URL structure: <base>/<deviceId 10><ddMMyyyy 8><globalNo 10><code 16 hex>
// ---------------------------------------------------------------------------

export interface QrParts {
  base: string;
  deviceId: number;
  receiptDate: string; // yyyy-MM-dd
  globalNo: number;
  codeHex: string; // 16 upper-case hex, no dashes
}

export function parseQrUrl(url: string): QrParts | null {
  const m = /^(https?:\/\/[^/]+)\/(\d{10})(\d{2})(\d{2})(\d{4})(\d{10})([0-9a-fA-F]{16})$/.exec(url.trim());
  if (!m) return null;
  return {
    base: m[1]!,
    deviceId: Number(m[2]),
    receiptDate: `${m[5]}-${m[4]}-${m[3]}`,
    globalNo: Number(m[6]),
    codeHex: m[7]!.toUpperCase(),
  };
}

/** The verification code as printed ("575B-1A59-009E-EFB6") equals the 16 hex digits of the QR, ignoring dashes. */
export const sameVerificationCode = (printed: string | undefined, codeHex: string) =>
  (printed ?? "").replace(/[^0-9a-fA-F]/g, "").toUpperCase() === codeHex.toUpperCase();

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export class EvidenceRenderer {
  private browser: Browser | null = null;

  async start(): Promise<void> {
    if (!this.browser) this.browser = await chromium.launch();
  }

  async stop(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
  }

  /** The 80 mm till slip, one page as tall as the slip. */
  async slipPdf(sale: SlipSale, branch: SlipBranch, opts: { qrUrl?: string; duplicate?: boolean } = {}): Promise<Uint8Array> {
    await this.start();
    const qrDataUrl = opts.qrUrl ? await QRCode.toDataURL(opts.qrUrl, { margin: 0, width: 300, errorCorrectionLevel: "M" }) : undefined;
    const page = await this.browser!.newPage({ viewport: { width: 320, height: 800 } });
    try {
      await page.setContent(slipDocumentHtml(sale, branch, { qrDataUrl, duplicate: opts.duplicate }), { waitUntil: "load" });
      const heightPx = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
      return await page.pdf({ width: "80mm", height: `${heightPx + 8}px`, printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
    } finally {
      await page.close();
    }
  }

  /** The A4 tax invoice. */
  async a4Pdf(sale: SlipSale, branch: SlipBranch, opts: { qrUrl?: string; duplicate?: boolean } = {}): Promise<Uint8Array> {
    const qrPng = opts.qrUrl ? await QRCode.toBuffer(opts.qrUrl, { margin: 1, width: 320, errorCorrectionLevel: "M" }) : undefined;
    return renderA4Pdf(sale, branch, { qrPng, duplicate: opts.duplicate });
  }
}

// ---------------------------------------------------------------------------
// Reading a PDF back
// ---------------------------------------------------------------------------

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjsPromise: Promise<PdfJs> | null = null;
const pdfjs = () => (pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs") as Promise<PdfJs>);

async function openPdf(bytes: Uint8Array) {
  const lib = await pdfjs();
  return lib.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, isEvalSupported: false, verbosity: 0 }).promise;
}

export async function pdfPageCount(bytes: Uint8Array): Promise<number> {
  return (await openPdf(bytes)).numPages;
}

/** All text in the PDF, whitespace collapsed. */
export async function pdfText(bytes: Uint8Array): Promise<string> {
  const doc = await openPdf(bytes);
  const parts: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    for (const item of content.items) if ("str" in item) parts.push(item.str);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

interface RawImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
  kind?: number;
}

/** Decode every QR code found among the images painted in the PDF. Returns the decoded texts (usually one). */
export async function qrCodesInPdf(bytes: Uint8Array): Promise<{ texts: string[]; images: number; png?: Buffer }> {
  const lib = await pdfjs();
  const doc = await openPdf(bytes);
  const texts: string[] = [];
  let images = 0;
  let firstPng: Buffer | undefined;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const ops = await page.getOperatorList();
    const OPS = lib.OPS;
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      let img: RawImage | undefined;
      if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
        const arg = ops.argsArray[i];
        if (fn === OPS.paintInlineImageXObject) img = arg[0] as RawImage;
        else {
          const name = arg[0] as string;
          img = await new Promise<RawImage | undefined>((resolve) => {
            const get = (page.objs as unknown as { get: (n: string, cb?: (v: RawImage) => void) => RawImage | undefined }).get.bind(page.objs);
            try {
              get(name, (v) => resolve(v));
            } catch {
              resolve(undefined);
            }
            setTimeout(() => resolve(undefined), 4000);
          });
        }
      }
      if (!img?.data || !img.width || !img.height) continue;
      images++;
      const rgba = toRgba(img);
      const found = decodeQr(rgba, img.width, img.height);
      if (found) {
        texts.push(found);
        if (!firstPng) firstPng = await rgbaToPng(rgba, img.width, img.height);
      }
    }
  }
  return { texts, images, png: firstPng };
}

function toRgba(img: RawImage): Uint8ClampedArray {
  const { width: w, height: h, data } = img;
  const n = w * h;
  if (data.length === n * 4) return new Uint8ClampedArray(data);
  const out = new Uint8ClampedArray(n * 4);
  if (data.length === n * 3) {
    for (let i = 0, j = 0; i < n; i++, j += 3) {
      out[i * 4] = data[j]!;
      out[i * 4 + 1] = data[j + 1]!;
      out[i * 4 + 2] = data[j + 2]!;
      out[i * 4 + 3] = 255;
    }
  } else if (data.length === n) {
    for (let i = 0; i < n; i++) {
      out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = data[i]!;
      out[i * 4 + 3] = 255;
    }
  } else {
    // 1 bit per pixel, rows padded to bytes (pdf.js kind 1)
    const rowBytes = Math.ceil(w / 8);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const bit = (data[y * rowBytes + (x >> 3)]! >> (7 - (x & 7))) & 1;
        const v = bit ? 255 : 0;
        const o = (y * w + x) * 4;
        out[o] = out[o + 1] = out[o + 2] = v;
        out[o + 3] = 255;
      }
  }
  return out;
}

/** jsQR needs a quiet zone and a decent size: try the image as is, padded, and enlarged. */
function decodeQr(rgba: Uint8ClampedArray, w: number, h: number): string | null {
  const direct = jsQR(rgba, w, h, { inversionAttempts: "attemptBoth" });
  if (direct) return direct.data;
  for (const scale of [2, 3, 4]) {
    const pad = 12 * scale;
    const W = w * scale + pad * 2;
    const H = h * scale + pad * 2;
    const big = new Uint8ClampedArray(W * H * 4).fill(255);
    for (let y = 0; y < h * scale; y++)
      for (let x = 0; x < w * scale; x++) {
        const s = (Math.floor(y / scale) * w + Math.floor(x / scale)) * 4;
        const d = ((y + pad) * W + (x + pad)) * 4;
        big[d] = rgba[s]!;
        big[d + 1] = rgba[s + 1]!;
        big[d + 2] = rgba[s + 2]!;
        big[d + 3] = 255;
      }
    const r = jsQR(big, W, H, { inversionAttempts: "attemptBoth" });
    if (r) return r.data;
  }
  return null;
}

async function rgbaToPng(rgba: Uint8ClampedArray, w: number, h: number): Promise<Buffer> {
  // pngjs ships no type declarations
  // @ts-expect-error no declarations for pngjs
  const { PNG } = (await import("pngjs")) as { PNG: any };
  const png = new PNG({ width: w, height: h });
  png.data = Buffer.from(rgba);
  return PNG.sync.write(png);
}

// ---------------------------------------------------------------------------
// ZIMRA's public verification page
// ---------------------------------------------------------------------------

export interface ZimraLookup {
  state: "valid" | "not-yet-received" | "not-found" | "unreachable" | "unknown-page";
  invoiceNo?: string;
  total?: number;
  currency?: string;
  dateTime?: string;
  creditNotes?: string;
  attempts: number;
  detail?: string;
}

const strip = (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, "|").replace(/(\s*\|\s*)+/g, "|");
const field = (t: string, label: string) => new RegExp(`\\|${label}\\|([^|]*)`, "i").exec(t)?.[1]?.trim();

/** GET the QR URL (it redirects to the result page). Retries while the device has not uploaded the receipt yet. */
export async function lookupZimra(qrUrl: string, opts: { tries?: number; waitMs?: number } = {}): Promise<ZimraLookup> {
  const tries = opts.tries ?? 6;
  const waitMs = opts.waitMs ?? 5000;
  let last: ZimraLookup = { state: "unreachable", attempts: 0 };
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(qrUrl, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
      const t = strip(await res.text());
      if (/Invoice is valid/i.test(t)) {
        const total = Number((field(t, "INVOICE TOTAL AMOUNT") ?? "").replace(/,/g, ""));
        return {
          state: "valid",
          invoiceNo: field(t, "INVOICE NUMBER"),
          total: Number.isFinite(total) ? total : undefined,
          currency: field(t, "CURRENCY"),
          dateTime: field(t, "INVOICE DATE AND TIME"),
          creditNotes: field(t, "RELATED DOCUMENTS"),
          attempts: attempt,
        };
      }
      last = /not yet received/i.test(t) ? { state: "not-yet-received", attempts: attempt, detail: "ZIMRA has not received the upload from the device yet" }
        : /Invoice is not found/i.test(t) ? { state: "not-found", attempts: attempt } : { state: "unknown-page", attempts: attempt, detail: t.slice(0, 200) };
    } catch (e) {
      last = { state: "unreachable", attempts: attempt, detail: e instanceof Error ? e.message : String(e) };
    }
    if (attempt < tries) await new Promise((r) => setTimeout(r, waitMs));
  }
  return last;
}

// ---------------------------------------------------------------------------
// Checking one receipt
// ---------------------------------------------------------------------------

export interface Check {
  name: string;
  ok: boolean;
  /** "unconfirmed" is reported but does not fail the receipt (ZIMRA's page can lag the device's upload). */
  level?: "fail" | "warn";
  detail?: string;
}

export interface ReceiptEvidenceInput {
  /** Folder for this receipt's files. */
  dir: string;
  sale: SlipSale;
  branch: SlipBranch;
  /** The QR URL exactly as the gateway returned it. Absent for a provisional slip. */
  gatewayQrUrl?: string;
  /** Expected figures for the ZIMRA lookup. */
  expectTotal?: number;
  expectCurrency?: string;
  lookup?: boolean;
  lookupTries?: number;
  lookupWaitMs?: number;
  /** Extra text the PDFs must contain (for example the buyer name). */
  mustContain?: string[];
}

export interface ReceiptEvidenceResult {
  checks: Check[];
  ok: boolean;
  files: string[];
  qr?: { decoded: string | null; parts: QrParts | null };
  lookup?: ZimraLookup;
}

export async function buildReceiptEvidence(r: EvidenceRenderer, input: ReceiptEvidenceInput): Promise<ReceiptEvidenceResult> {
  const { sale, branch } = input;
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail?: string, level: "fail" | "warn" = "fail") => checks.push({ name, ok, detail, level });
  mkdirSync(input.dir, { recursive: true });
  const files: string[] = [];
  const fiscal = !!input.gatewayQrUrl;

  const slip = await r.slipPdf(sale, branch, { qrUrl: input.gatewayQrUrl });
  const a4 = await r.a4Pdf(sale, branch, { qrUrl: input.gatewayQrUrl });
  writeFileSync(join(input.dir, "slip-80mm.pdf"), slip);
  writeFileSync(join(input.dir, "a4-invoice.pdf"), a4);
  files.push("slip-80mm.pdf", "a4-invoice.pdf");

  const [slipPages, a4Pages] = [await pdfPageCount(slip), await pdfPageCount(a4)];
  add("slip PDF has one page", slipPages === 1, `${slipPages} pages`);
  add("A4 PDF opens", a4Pages >= 1, `${a4Pages} pages`);

  const [slipText, a4Text] = [await pdfText(slip), await pdfText(a4)];
  const number = sale.invoiceNumber ?? sale.provisionalNumber ?? "";
  for (const [label, text] of [["slip", slipText], ["A4", a4Text]] as const) {
    if (number) add(`${label} PDF shows the number ${number}`, text.includes(number));
    for (const needle of input.mustContain ?? []) add(`${label} PDF contains "${needle}"`, text.includes(needle));
    if (fiscal) {
      const code = sale.fiscal?.verificationCode;
      if (code) add(`${label} PDF shows the verification code`, text.includes(code));
      if (sale.fiscal?.deviceId) add(`${label} PDF shows the device id`, text.includes(String(sale.fiscal.deviceId)));
    }
  }

  let qrInfo: ReceiptEvidenceResult["qr"];
  let lookup: ZimraLookup | undefined;
  if (!fiscal) {
    const slipQr = await qrCodesInPdf(slip);
    add("provisional slip carries NO QR code", slipQr.texts.length === 0);
    add("provisional slip says it is not a fiscal tax invoice", /not a fiscal tax invoice|provisional/i.test(slipText));
  } else {
    const [sq, aq] = [await qrCodesInPdf(slip), await qrCodesInPdf(a4)];
    const slipDecoded = sq.texts[0] ?? null;
    const a4Decoded = aq.texts[0] ?? null;
    add("QR decoded from the slip PDF", !!slipDecoded, `${sq.images} images in the PDF`);
    add("QR decoded from the A4 PDF", !!a4Decoded, `${aq.images} images in the PDF`);
    add("slip QR equals the gateway QR", slipDecoded === input.gatewayQrUrl, `${slipDecoded} vs ${input.gatewayQrUrl}`);
    add("A4 QR equals the gateway QR", a4Decoded === input.gatewayQrUrl, `${a4Decoded} vs ${input.gatewayQrUrl}`);
    if (sq.png) {
      writeFileSync(join(input.dir, "qr.png"), sq.png);
      files.push("qr.png");
    }
    const parts = parseQrUrl(slipDecoded ?? input.gatewayQrUrl!);
    qrInfo = { decoded: slipDecoded, parts };
    add("QR has the expected structure", !!parts);
    if (parts) {
      if (sale.fiscal?.deviceId) add("QR device id equals the receipt's device", parts.deviceId === Number(sale.fiscal.deviceId), `${parts.deviceId} vs ${sale.fiscal.deviceId}`);
      if (sale.fiscal?.receiptGlobalNo && /^\d+$/.test(String(sale.fiscal.receiptGlobalNo))) add("QR receipt number equals the receipt's global number", parts.globalNo === Number(sale.fiscal.receiptGlobalNo), `${parts.globalNo} vs ${sale.fiscal.receiptGlobalNo}`);
      if (sale.fiscal?.receiptDate) add("QR date equals the receipt date", sale.fiscal.receiptDate.slice(0, 10) === parts.receiptDate, `${parts.receiptDate} vs ${sale.fiscal.receiptDate}`);
      add("printed verification code equals the QR's code", sameVerificationCode(sale.fiscal?.verificationCode, parts.codeHex), `${sale.fiscal?.verificationCode} vs ${parts.codeHex}`);
    }
    if (input.lookup !== false) {
      lookup = await lookupZimra(input.gatewayQrUrl!, { tries: input.lookupTries, waitMs: input.lookupWaitMs });
      add("ZIMRA's verification page says the invoice is valid", lookup.state === "valid", `${lookup.state} after ${lookup.attempts} attempt(s)${lookup.detail ? `: ${lookup.detail}` : ""}`, lookup.state === "valid" ? "fail" : lookup.state === "not-found" || lookup.state === "not-yet-received" ? "warn" : "fail");
      if (lookup.state === "valid") {
        if (input.expectTotal !== undefined && lookup.total !== undefined) add("ZIMRA's total equals the receipt total", Math.abs(lookup.total - Math.abs(input.expectTotal)) < 0.005 || Math.abs(lookup.total - input.expectTotal) < 0.005, `${lookup.total} vs ${input.expectTotal}`);
        if (input.expectCurrency && lookup.currency) add("ZIMRA's currency equals the receipt currency", lookup.currency.toUpperCase() === input.expectCurrency.toUpperCase(), `${lookup.currency} vs ${input.expectCurrency}`);
      }
    }
  }

  const ok = checks.every((c) => c.ok || c.level === "warn");
  return { checks, ok, files, qr: qrInfo, lookup };
}
