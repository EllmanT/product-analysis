/**
 * Build the evidence folder (PDF slip + PDF A4 invoice per receipt, QR decoded and compared, ZIMRA lookup) from the
 * receipts a REAL-gateway run already saved. Understands:
 *   - fiscal-service/scripts/real-stress.ts output  (<run>/receipts/*.json with {request,result})
 *   - fiscal-service/scripts/e2e-live.ts and credit-live.ts output (<run>/run.json)
 *
 *   npx tsx scripts/evidence/from-real-runs.ts <run folder> --certs=<certificates folder> [--limit=40] [--no-lookup]
 *
 * --certs is only used to read each device's taxpayer details with GetConfig (read-only) so the invoices carry the
 * real company name, TIN, VAT number and address. Output: test-evidence/<run>-<time>/ (gitignored).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { FdmsClient } from "../../fiscal-service/src/core/transport";
import { NodeTransport } from "../../fiscal-service/src/node/transport";
import type { SlipBranch, SlipLine, SlipSale } from "../../lib/pos/slip";
import { EvidenceRenderer, buildReceiptEvidence, parseQrUrl, type ReceiptEvidenceResult } from "./receipt-evidence";

interface Item {
  invoiceNo: string;
  credit: boolean;
  currency: string;
  lines: { name: string; unitPriceIncl: number; quantity: number; taxPercent: number | null }[];
  paymentMethod: "CASH" | "CARD";
  qrUrl: string;
  deviceId: number;
  serial?: string;
  globalNo: number;
  counter?: number;
  fiscalDayNo?: number;
  receiptDate?: string;
  verificationCode?: string;
  originalInvoiceNo?: string;
  notes?: string;
}

const argv = process.argv.slice(2);
const runDir = argv.find((a) => !a.startsWith("--"));
const flag = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const certsDir = flag("certs");
const limit = Number(flag("limit") ?? 0);
const doLookup = !argv.includes("--no-lookup");
if (!runDir || !certsDir) {
  console.error('Usage: npx tsx scripts/evidence/from-real-runs.ts <run folder> --certs=<certificates folder> [--limit=40] [--no-lookup]');
  process.exit(2);
}

const amount = (v: unknown): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  if (v && typeof v === "object" && "cents" in v) return Number((v as { cents: number }).cents) / 100;
  return NaN;
};
const hex16 = (qr: string) => parseQrUrl(qr)?.codeHex ?? "";
const fmtCode = (h: string) => h.match(/.{4}/g)?.join("-") ?? h;

function loadItems(dir: string): Item[] {
  const items: Item[] = [];
  if (existsSync(join(dir, "receipts"))) {
    for (const f of readdirSync(join(dir, "receipts")).filter((x) => x.endsWith(".json")).sort()) {
      const j = JSON.parse(readFileSync(join(dir, "receipts", f), "utf8")) as { request: any; result: any };
      const r = j.result;
      if (r?.status !== "fiscalised" || !r.qrData) continue;
      items.push({
        invoiceNo: j.request.invoiceNo,
        credit: j.request.receiptType === "CreditNote",
        currency: j.request.currency,
        lines: (j.request.lines as any[]).map((l) => ({ name: l.name, unitPriceIncl: amount(l.unitPrice), quantity: Number(l.quantity), taxPercent: l.taxPercent ?? null })),
        paymentMethod: String(j.request.payments?.[0]?.moneyType).toLowerCase() === "card" ? "CARD" : "CASH",
        qrUrl: r.qrData,
        deviceId: r.deviceId,
        serial: r.deviceSerialNumber,
        globalNo: r.receiptGlobalNo,
        counter: r.receiptCounter,
        fiscalDayNo: r.fiscalDayNo,
        receiptDate: r.receiptDate,
        verificationCode: r.verificationCode,
        originalInvoiceNo: j.request.original?.invoiceNo,
        notes: j.request.notes,
      });
    }
  }
  if (existsSync(join(dir, "run.json"))) {
    const log = JSON.parse(readFileSync(join(dir, "run.json"), "utf8")) as { step: string; data: any }[];
    const m = /e2e-(\d+)-|credit-(\d+)-/.exec(basename(dir));
    const deviceId = Number(m?.[1] ?? m?.[2]);
    for (const e of log) {
      const d = e.data;
      if (!d?.input || !d.qrData) continue; // run.json holds qrData only for e2e; credit-live keeps state instead
      pushRun(items, d.input, d.qrData, d.state, deviceId);
    }
  }
  return items;
}

function pushRun(items: Item[], input: any, qr: string, state: any, deviceId: number) {
  const parts = parseQrUrl(qr);
  items.push({
    invoiceNo: input.invoiceNo,
    credit: input.receiptType === "CreditNote",
    currency: input.currency,
    lines: (input.lines as any[]).map((l) => ({ name: l.name, unitPriceIncl: amount(l.price), quantity: Number(l.quantity), taxPercent: l.taxPercent ?? null })),
    paymentMethod: String(input.payments?.[0]?.moneyType).toLowerCase() === "card" ? "CARD" : "CASH",
    qrUrl: qr,
    deviceId: parts?.deviceId ?? deviceId,
    globalNo: parts?.globalNo ?? state?.receiptGlobalNo,
    counter: state?.receiptCounter,
    fiscalDayNo: state?.fiscalDayNo,
    receiptDate: parts ? `${parts.receiptDate}T00:00:00` : undefined,
    verificationCode: fmtCode(hex16(qr)),
    notes: input.notes,
  });
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function toSale(it: Item, original?: string): SlipSale {
  const lines: SlipLine[] = it.lines.map((l) => {
    const incl = r2(l.unitPriceIncl * l.quantity);
    const p = l.taxPercent ?? 0;
    const vat = r2(incl - incl / (1 + p / 100));
    return {
      taxCode: l.taxPercent == null ? "E" : l.taxPercent === 0 ? "B" : "A",
      description: l.name,
      quantity: l.quantity,
      unitPrice: l.unitPriceIncl,
      taxPercent: l.taxPercent ?? 0,
      vatAmount: vat,
      lineTotalExcl: r2(incl - vat),
      lineTotalIncl: incl,
    } as SlipLine;
  });
  const totalAmount = r2(lines.reduce((t, l) => t + l.lineTotalIncl, 0));
  const totalVat = r2(lines.reduce((t, l) => t + l.vatAmount, 0));
  return {
    kind: it.credit ? "CREDIT_NOTE" : "SALE",
    originalNumber: original ?? it.originalInvoiceNo,
    creditReason: it.credit ? it.notes ?? "Customer return" : undefined,
    status: "FISCALISED",
    currency: it.currency,
    paymentMethod: it.paymentMethod,
    lines,
    subtotalExclTax: r2(totalAmount - totalVat),
    totalVat,
    totalAmount,
    buyer: { registerName: "Walk-in customer (test)", tin: "2000999888", email: "test@example.com" },
    invoiceNumber: it.invoiceNo,
    soldAt: it.receiptDate ? new Date(it.receiptDate) : new Date(),
    fiscal: {
      verificationCode: it.verificationCode ?? fmtCode(hex16(it.qrUrl)),
      verificationLink: it.qrUrl,
      qrCodeUrl: it.qrUrl,
      fiscalDayNo: it.fiscalDayNo ?? null,
      receiptGlobalNo: String(it.globalNo),
      receiptCounter: it.counter ?? null,
      deviceId: String(it.deviceId),
      deviceSerialNumber: it.serial,
      receiptDate: it.receiptDate,
    },
  };
}

async function branchFor(deviceId: number): Promise<SlipBranch> {
  const dir = join(certsDir!, `certificates_${deviceId}`);
  const alt = join(certsDir!, `certificates_${deviceId}_renewed`);
  const use = existsSync(join(alt, "cert.crt")) ? alt : dir; // a renewed bundle replaces the original (the old pair is revoked)
  const certificatePem = readFileSync(join(use, "cert.crt"), "utf8");
  const privateKeyPem = readFileSync(join(use, "key.key"), "utf8");
  const http = new FdmsClient({ deviceId, serialNumber: "", modelName: "Server", modelVersion: "v1" }, new NodeTransport({ certificatePem, privateKeyPem }), { environment: "test" });
  const cfg = await http.request<any>("GET", `/Device/v1/${deviceId}/GetConfig`);
  const a = cfg.deviceBranchAddress ?? {};
  return {
    companyName: cfg.taxPayerName,
    branchName: cfg.deviceBranchName,
    address: [a.houseNo, a.street, a.city].filter(Boolean).join(", "),
    phone: cfg.deviceBranchContacts?.phoneNo,
    email: cfg.deviceBranchContacts?.email,
    tin: cfg.taxPayerTIN,
    vatNumber: cfg.vatNumber,
    footerLines: ["Test environment receipt"],
  };
}

async function main() {
  let items = loadItems(runDir!);
  if (!items.length) {
    console.error(`No fiscalised receipts found in ${runDir}`);
    process.exit(1);
  }
  if (limit > 0) items = items.slice(0, limit);
  const stamp = new Date().toISOString().replace(/T/, "_").replace(/[:.]/g, "-").slice(0, 19);
  const out = join("test-evidence", `${basename(runDir!)}-evidence-${stamp}`);
  mkdirSync(out, { recursive: true });

  const branches = new Map<number, SlipBranch>();
  for (const id of new Set(items.map((i) => i.deviceId))) branches.set(id, await branchFor(id));

  const byInvoice = new Map(items.map((i) => [i.invoiceNo, i]));
  const renderer = new EvidenceRenderer();
  const rows: string[] = ["n,invoiceNo,device,kind,currency,total,globalNo,qrDecoded,zimra,result,failedChecks"];
  const failures: string[] = [];
  const unconfirmed: string[] = [];
  let n = 0;
  const t0 = Date.now();
  try {
    for (const it of items) {
      n++;
      const original = it.originalInvoiceNo && byInvoice.get(it.originalInvoiceNo) ? it.originalInvoiceNo : undefined;
      const sale = toSale(it, original);
      const dir = join(out, `device-${it.deviceId}`, `${String(n).padStart(3, "0")}_${it.invoiceNo}_${it.credit ? "credit-note" : "invoice"}`);
      let res: ReceiptEvidenceResult;
      try {
        res = await buildReceiptEvidence(renderer, {
          dir,
          sale,
          branch: branches.get(it.deviceId)!,
          gatewayQrUrl: it.qrUrl,
          expectTotal: sale.totalAmount,
          expectCurrency: it.currency,
          lookup: doLookup,
          lookupTries: 8,
          lookupWaitMs: 5000,
          mustContain: [it.credit ? "" : ""].filter(Boolean),
        });
      } catch (e) {
        failures.push(`${it.invoiceNo}: could not build evidence: ${e instanceof Error ? e.message : String(e)}`);
        rows.push(`${n},${it.invoiceNo},${it.deviceId},${it.credit ? "credit" : "invoice"},${it.currency},,${it.globalNo},,,ERROR,`);
        continue;
      }
      writeFileSync(join(dir, "receipt.json"), JSON.stringify({ item: it, sale, checks: res.checks, lookup: res.lookup }, null, 2));
      const failed = res.checks.filter((c) => !c.ok && c.level !== "warn");
      const warned = res.checks.filter((c) => !c.ok && c.level === "warn");
      if (failed.length) failures.push(`${it.invoiceNo} (device ${it.deviceId}): ${failed.map((c) => `${c.name}${c.detail ? ` [${c.detail}]` : ""}`).join("; ")}`);
      if (warned.length) unconfirmed.push(`${it.invoiceNo} (device ${it.deviceId}): ${warned.map((c) => c.detail ?? c.name).join("; ")}`);
      rows.push([n, it.invoiceNo, it.deviceId, it.credit ? "credit" : "invoice", it.currency, sale.totalAmount.toFixed(2), it.globalNo, res.qr?.decoded ? "yes" : "NO", res.lookup?.state ?? "skipped", failed.length ? "FAIL" : warned.length ? "UNCONFIRMED" : "PASS", failed.map((c) => c.name.replace(/,/g, ";")).join("|")].join(","));
      process.stdout.write(`\r${n}/${items.length} receipts checked`);
    }
  } finally {
    await renderer.stop();
  }
  console.log("");
  writeFileSync(join(out, "index.csv"), rows.join("\n"));
  const pass = rows.filter((r) => r.includes(",PASS,")).length;
  const summary = [
    `# Receipt evidence: ${basename(runDir!)}`,
    ``,
    `Built ${new Date().toISOString()} from \`${runDir}\`. ${items.length} fiscalised receipt(s) on ${branches.size} device(s). ${doLookup ? "ZIMRA verification page queried for each." : "ZIMRA lookup skipped."}`,
    ``,
    `- Passed every check: **${pass}**`,
    `- Unconfirmed at ZIMRA (page said not received yet): **${unconfirmed.length}**`,
    `- Failed: **${failures.length}**`,
    ``,
    ...(failures.length ? [`## Failures`, ...failures.map((f) => `- ${f}`), ``] : []),
    ...(unconfirmed.length ? [`## Unconfirmed`, ...unconfirmed.map((f) => `- ${f}`), ``] : []),
    `Each receipt has \`slip-80mm.pdf\`, \`a4-invoice.pdf\`, \`qr.png\` (as decoded from the PDF) and \`receipt.json\` in \`device-<id>/<n>_<invoice>_<kind>/\`.`,
    `Took ${((Date.now() - t0) / 1000).toFixed(0)} s.`,
  ].join("\n");
  writeFileSync(join(out, "summary.md"), summary);
  console.log(summary);
  console.log(`\nOutput: ${out}`);
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
