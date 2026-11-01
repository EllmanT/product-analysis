/**
 * Make test despatch slips in many layouts, with the true contents saved beside them, so the reader can
 * be scored (scripts/eval-despatch-extract.ts). The slips are synthetic: invented company, items and prices.
 *
 *   npx tsx scripts/generate-despatch-fixtures.ts [outDir]     (default scripts/despatch-fixtures)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

type Item = { code: string; description: string; uom: string; price: number };
const CATALOGUE: Item[] = [
  { code: "LB09W", description: "LED Bulb 9W B22 Warm White", uom: "EA", price: 2.35 },
  { code: "LB12C", description: "LED Bulb 12W E27 Cool White", uom: "EA", price: 3.1 },
  { code: "PNL40", description: "LED Panel 600x600 40W", uom: "EA", price: 24.5 },
  { code: "CP20", description: "Conduit Pipe 20mm x 3m", uom: "LGTH", price: 1.8 },
  { code: "CP25", description: "Conduit Pipe 25mm x 3m", uom: "LGTH", price: 2.6 },
  { code: "CBL15", description: "Twin & Earth Cable 1.5mm", uom: "M", price: 0.95 },
  { code: "CBL25", description: "Twin & Earth Cable 2.5mm", uom: "M", price: 1.4 },
  { code: "SW1G", description: "1 Gang 1 Way Switch White", uom: "EA", price: 1.75 },
  { code: "SO2G", description: "2 Gang Socket Outlet 13A", uom: "EA", price: 4.2 },
  { code: "MCB32", description: "MCB 32A Single Pole", uom: "EA", price: 6.8 },
  { code: "DB8W", description: "Distribution Board 8 Way", uom: "EA", price: 38.0 },
  { code: "FL36", description: "Fluorescent Tube T8 36W 1.2m", uom: "EA", price: 3.9 },
  { code: "FL18", description: "Fluorescent Tube T8 18W 0.6m", uom: "EA", price: 2.9 },
  { code: "JB4", description: "Junction Box 4 Terminal", uom: "EA", price: 0.65 },
  { code: "TAPE", description: "PVC Insulation Tape Black", uom: "ROLL", price: 0.8 },
  { code: "FLD50", description: "LED Floodlight 50W IP65", uom: "EA", price: 17.25 },
  { code: "FLD30", description: "LED Floodlight 30W IP65", uom: "EA", price: 11.5 },
  { code: "CLP15", description: "Cable Clips 15mm (pack of 100)", uom: "PKT", price: 2.1 },
  { code: "ES20", description: "Energy Saver 20W Spiral E27", uom: "EA", price: 2.75 },
  { code: "TRK1", description: "Track Light Spot GU10 Black", uom: "EA", price: 9.9 },
  { code: "DLM", description: "Dimmer Switch 400W", uom: "EA", price: 8.4 },
  { code: "ERT16", description: "Earth Rod 16mm x 1.5m Copper", uom: "EA", price: 14.0 },
  { code: "GLND", description: "Cable Gland 20mm Brass", uom: "EA", price: 0.55 },
  { code: "BTN", description: "Bell Push Button White", uom: "EA", price: 1.2 },
];

// Small seeded generator so the fixtures are identical every run.
let seed = 20261101;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = (n: number) => {
  const pool = [...CATALOGUE].sort(() => rnd() - 0.5).slice(0, n);
  return pool.map((it) => ({ ...it, qty: [1, 2, 3, 4, 5, 6, 8, 10, 12, 20, 24, 50][Math.floor(rnd() * 12)] }));
};
const round2 = (n: number) => Math.round(n * 100) / 100;

type Line = Item & { qty: number; total: number };
const withTotals = (rows: ReturnType<typeof pick>): Line[] => rows.map((r) => ({ ...r, total: round2(r.qty * r.price) }));

type Col = { key: "code" | "description" | "uom" | "qty" | "ordered" | "disc" | "price" | "total"; label: string; w: number; align?: "l" | "r" };
type Style = {
  file: string;
  title: string;
  font: string;
  size: number;
  rowH: number;
  width: number;
  cols: Col[];
  n: number;
  vat: "none" | "added" | "included";
  money: (n: number) => string;
  slipNo: string;
  customer: string;
  tin?: string;
  currencyNote?: string;
  hand?: boolean;
  ink?: string;
  paper?: string;
  photo?: { angle: number; blur: number; shadow: number; contrast: number };
  grid?: boolean;
};

const fmtUS = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtEU = (n: number) => fmtUS(n).replace(/,/g, " ").replace(".", ",");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const STYLES: Style[] = [
  {
    file: "01-classic-table", title: "STORES DESPATCH SLIP", font: "Arial", size: 16, rowH: 30, width: 1100, n: 8, vat: "added", money: fmtUS,
    slipNo: "DS-004127", customer: "Zambezi Electrical (Pvt) Ltd", tin: "2001234567", currencyNote: "USD",
    cols: [{ key: "code", label: "Item Code", w: 130 }, { key: "description", label: "Description", w: 430 }, { key: "qty", label: "Qty", w: 80, align: "r" }, { key: "price", label: "Unit Price", w: 130, align: "r" }, { key: "total", label: "Total", w: 130, align: "r" }],
  },
  {
    file: "02-description-first-no-code", title: "Delivery Note", font: "Verdana", size: 15, rowH: 34, width: 1000, n: 6, vat: "none", money: fmtUS,
    slipNo: "DN 88213", customer: "Hillside Builders", currencyNote: "US$",
    cols: [{ key: "qty", label: "Quantity", w: 90, align: "r" }, { key: "description", label: "Goods", w: 470 }, { key: "price", label: "Rate", w: 120, align: "r" }, { key: "total", label: "Amount", w: 140, align: "r" }],
  },
  {
    file: "03-quantities-only", title: "STORES DESPATCH SLIP", font: "Courier New", size: 15, rowH: 28, width: 1000, n: 9, vat: "none", money: fmtUS,
    slipNo: "SDS/2026/1893", customer: "Bulawayo Branch Transfer",
    cols: [{ key: "code", label: "STOCK NO", w: 130 }, { key: "description", label: "DESCRIPTION", w: 440 }, { key: "uom", label: "UOM", w: 80 }, { key: "ordered", label: "ORDERED", w: 110, align: "r" }, { key: "qty", label: "DESPATCHED", w: 130, align: "r" }],
  },
  {
    file: "04-reordered-columns-eu-format", title: "DISPATCH NOTE / PACKING LIST", font: "Tahoma", size: 14, rowH: 30, width: 1250, n: 7, vat: "included", money: fmtEU,
    slipNo: "PL-2026-0457", customer: "Mutare Wholesalers", tin: "2009876543", currencyNote: "ZWG",
    cols: [{ key: "qty", label: "Qty", w: 70, align: "r" }, { key: "uom", label: "Unit", w: 70 }, { key: "code", label: "Item No.", w: 110 }, { key: "description", label: "Item Description", w: 420 }, { key: "disc", label: "Disc %", w: 80, align: "r" }, { key: "price", label: "Net Price", w: 140, align: "r" }, { key: "total", label: "Line Total", w: 150, align: "r" }],
  },
  {
    file: "05-handwritten", title: "Despatch Slip", font: "Ink Free", size: 22, rowH: 40, width: 1000, n: 6, vat: "none", money: fmtUS, hand: true,
    slipNo: "0412", customer: "Mr Moyo", ink: "#1b3a8a", paper: "#fbfaf4", grid: true,
    photo: { angle: 2.5, blur: 0.5, shadow: 0.18, contrast: 0.95 },
    cols: [{ key: "qty", label: "Qty", w: 80, align: "r" }, { key: "description", label: "Item", w: 520 }, { key: "price", label: "Price", w: 150, align: "r" }, { key: "total", label: "Total", w: 150, align: "r" }],
  },
  {
    file: "06-dot-matrix-dense", title: "STORES DESPATCH", font: "Courier New", size: 12, rowH: 22, width: 1000, n: 22, vat: "added", money: fmtUS,
    slipNo: "SD017731", customer: "KWEKWE ELECTRICAL SUPPLIES", ink: "#333", paper: "#f1f1ee",
    cols: [{ key: "code", label: "CODE", w: 110 }, { key: "description", label: "DESCRIPTION", w: 420 }, { key: "qty", label: "QTY", w: 70, align: "r" }, { key: "price", label: "PRICE", w: 110, align: "r" }, { key: "total", label: "VALUE", w: 130, align: "r" }],
  },
  {
    file: "07-photographed-angled-dim", title: "STORES DESPATCH SLIP", font: "Arial", size: 17, rowH: 32, width: 1100, n: 8, vat: "added", money: fmtUS,
    slipNo: "DS-004392", customer: "Chitungwiza Hardware", currencyNote: "USD",
    photo: { angle: -6, blur: 0.8, shadow: 0.45, contrast: 0.8 },
    cols: [{ key: "code", label: "Code", w: 120 }, { key: "description", label: "Product", w: 440 }, { key: "qty", label: "Qty", w: 80, align: "r" }, { key: "price", label: "Price", w: 130, align: "r" }, { key: "total", label: "Total", w: 130, align: "r" }],
  },
  {
    file: "08-gridded-with-uom-and-discount", title: "TAX INVOICE / DESPATCH", font: "Georgia", size: 15, rowH: 36, width: 1200, n: 7, vat: "included", money: fmtUS, grid: true,
    slipNo: "INV-77421", customer: "Gweru Contractors CC", tin: "2005550123", currencyNote: "USD",
    cols: [{ key: "code", label: "Part", w: 110 }, { key: "description", label: "Description", w: 380 }, { key: "uom", label: "UoM", w: 70 }, { key: "qty", label: "Qty", w: 70, align: "r" }, { key: "price", label: "Unit", w: 120, align: "r" }, { key: "disc", label: "Disc", w: 80, align: "r" }, { key: "total", label: "Ext. Price", w: 140, align: "r" }],
  },
];

function render(style: Style, lines: Line[]): { svg: string; height: number; truth: object } {
  const pad = 40;
  const colX: number[] = [];
  let x = pad;
  for (const c of style.cols) {
    colX.push(x);
    x += c.w;
  }
  const W = Math.max(style.width, x + pad);
  const ink = style.ink ?? "#111";
  const paper = style.paper ?? "#ffffff";
  const sub = round2(lines.reduce((s, l) => s + l.total, 0));
  const hasPrices = style.cols.some((c) => c.key === "price");
  const vat = style.vat === "added" ? round2(sub * 0.155) : 0;
  const grand = style.vat === "added" ? round2(sub + vat) : sub;
  const money = style.money;
  const ff = `font-family="${style.font}, Arial, sans-serif"`;

  let y = pad + 10;
  const out: string[] = [];
  out.push(`<text x="${pad}" y="${y}" ${ff} font-size="${style.size + 12}" font-weight="${style.hand ? 400 : 700}" fill="${ink}">${esc(style.title)}</text>`);
  out.push(`<text x="${W - pad}" y="${y}" ${ff} font-size="${style.size + 2}" text-anchor="end" fill="${ink}">${style.hand ? "No. " : "Slip No: "}${esc(style.slipNo)}</text>`);
  y += style.size + 12;
  out.push(`<text x="${pad}" y="${y}" ${ff} font-size="${style.size}" fill="${ink}">${style.hand ? "" : "Kwayedza Lighting &amp; Electrical Supplies, 14 Samora Machel Ave, Harare"}</text>`);
  out.push(`<text x="${W - pad}" y="${y}" ${ff} font-size="${style.size}" text-anchor="end" fill="${ink}">Date: 0${1 + Math.floor(rnd() * 8)}/11/2026</text>`);
  y += style.size + 8;
  out.push(`<text x="${pad}" y="${y}" ${ff} font-size="${style.size}" fill="${ink}">${style.hand ? "For: " : "Customer: "}${esc(style.customer)}${style.tin ? `   TIN: ${style.tin}` : ""}</text>`);
  if (style.currencyNote) out.push(`<text x="${W - pad}" y="${y}" ${ff} font-size="${style.size}" text-anchor="end" fill="${ink}">Currency: ${style.currencyNote}</text>`);
  y += 26;

  const headY = y;
  out.push(`<rect x="${pad - 6}" y="${headY - style.rowH + 8}" width="${W - pad * 2 + 12}" height="${style.rowH}" fill="${style.hand ? "none" : "#e8e8e8"}" stroke="${style.hand ? ink : "none"}" stroke-width="1"/>`);
  style.cols.forEach((c, i) => {
    const tx = c.align === "r" ? colX[i] + c.w - 8 : colX[i];
    out.push(`<text x="${tx}" y="${headY}" ${ff} font-size="${style.size - 1}" font-weight="${style.hand ? 400 : 700}" text-anchor="${c.align === "r" ? "end" : "start"}" fill="${ink}">${esc(c.label)}</text>`);
  });
  y = headY + style.rowH;

  lines.forEach((l, r) => {
    const cell: Record<string, string> = {
      code: l.code,
      description: l.description,
      uom: l.uom,
      qty: String(l.qty),
      ordered: String(l.qty + (r % 3 === 0 ? 2 : 0)),
      disc: r % 2 === 0 ? "0.00" : "5.00",
      price: money(l.price),
      total: money(l.total),
    };
    if (style.cols.some((c) => c.key === "disc")) {
      // With a discount column the printed net price is the discounted one, so the truth must match.
      const d = r % 2 === 0 ? 0 : 0.05;
      cell.price = money(round2(l.price * (1 - d)));
      cell.total = money(round2(l.qty * round2(l.price * (1 - d))));
    }
    if (style.hand) {
      cell.price = String(l.price);
      cell.total = String(l.total);
    }
    style.cols.forEach((c, i) => {
      const tx = c.align === "r" ? colX[i] + c.w - 8 : colX[i];
      const jitter = style.hand ? `transform="rotate(${(rnd() * 2 - 1).toFixed(2)} ${tx} ${y})"` : "";
      out.push(`<text x="${tx}" y="${y}" ${ff} font-size="${style.size}" text-anchor="${c.align === "r" ? "end" : "start"}" fill="${ink}" ${jitter}>${esc(cell[c.key])}</text>`);
    });
    if (style.grid || style.hand) out.push(`<line x1="${pad - 6}" y1="${y + 10}" x2="${W - pad + 6}" y2="${y + 10}" stroke="${style.hand ? "#9bb0d8" : "#bbb"}" stroke-width="1"/>`);
    y += style.rowH;
  });

  y += 14;
  if (hasPrices) {
    const label = (t: string, v: string, bold = false) => {
      out.push(`<text x="${W - pad - 220}" y="${y}" ${ff} font-size="${style.size}" font-weight="${bold ? 700 : 400}" fill="${ink}">${esc(t)}</text>`);
      out.push(`<text x="${W - pad - 8}" y="${y}" ${ff} font-size="${style.size}" font-weight="${bold ? 700 : 400}" text-anchor="end" fill="${ink}">${esc(v)}</text>`);
      y += style.size + 10;
    };
    if (style.vat === "added") {
      label("Sub Total", money(sub));
      label("VAT 15.5%", money(vat));
      label("TOTAL DUE", money(grand), true);
    } else if (style.vat === "included") {
      label("TOTAL (VAT inclusive)", money(grand), true);
    } else {
      label(style.hand ? "Total" : "TOTAL", money(grand), true);
    }
  }
  y += 24;
  if (!style.hand) {
    out.push(`<text x="${pad}" y="${y}" ${ff} font-size="${style.size - 2}" fill="#555">Goods received in good order: ______________________   Date: ____________</text>`);
    y += 30;
  }
  const H = y + 20;
  const lined = style.hand
    ? Array.from({ length: Math.floor(H / 40) }, (_, i) => `<line x1="0" y1="${i * 40 + 20}" x2="${W}" y2="${i * 40 + 20}" stroke="#d9e2f3" stroke-width="1"/>`).join("")
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${paper}"/>${lined}${out.join("")}</svg>`;

  const discounted = style.cols.some((c) => c.key === "disc");
  const truth = {
    slipNumber: style.slipNo,
    customer: style.customer,
    currency: style.currencyNote === "ZWG" ? "ZWG" : style.currencyNote === "USD" || style.currencyNote === "US$" ? "USD" : null,
    pricesIncludeVat: style.vat === "included" ? true : style.vat === "added" ? false : null,
    grandTotal: hasPrices ? (discounted ? null : grand) : null,
    items: lines.map((l, r) => {
      const d = discounted && r % 2 !== 0 ? 0.05 : 0;
      const price = style.hand ? l.price : round2(l.price * (1 - d));
      return {
        code: style.cols.some((c) => c.key === "code") ? l.code : null,
        description: l.description,
        qty: l.qty,
        unit_price: hasPrices ? price : null,
        total: hasPrices ? (style.hand ? l.total : round2(l.qty * price)) : null,
      };
    }),
  };
  return { svg, height: H, truth };
}

async function main() {
  const outDir = process.argv[2] ?? path.join("scripts", "despatch-fixtures");
  mkdirSync(path.join(outDir, "img"), { recursive: true });
  const truths: Record<string, unknown> = {};
  for (const style of STYLES) {
    const lines = withTotals(pick(style.n));
    const { svg, truth } = render(style, lines);
    let img = sharp(Buffer.from(svg), { density: 110 });
    if (style.photo) {
      const p = style.photo;
      img = sharp(await img.png().toBuffer())
        .rotate(p.angle, { background: "#6b6358" })
        .blur(p.blur)
        .linear(p.contrast, 255 * (1 - p.contrast) * 0.5);
      const meta = await sharp(await img.resize({ width: 1500, withoutEnlargement: true }).png().toBuffer()).metadata();
      const shade = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0.4"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${p.shadow}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`
      );
      const base = await img.resize({ width: 1500, withoutEnlargement: true }).png().toBuffer();
      const bm = await sharp(base).metadata();
      const shadePng = await sharp(shade, { density: 72 }).resize(bm.width, bm.height, { fit: "fill" }).png().toBuffer();
      img = sharp(base).composite([{ input: shadePng }]);
    }
    const file = path.join(outDir, "img", `${style.file}.jpg`);
    await (style.photo ? img : img.resize({ width: 1500, withoutEnlargement: true })).jpeg({ quality: style.photo ? 68 : 82 }).toFile(file);
    truths[`${style.file}.jpg`] = truth;
    console.log("wrote", file);
  }
  writeFileSync(path.join(outDir, "truth.json"), JSON.stringify(truths, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
