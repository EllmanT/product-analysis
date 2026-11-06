/**
 * Regression test for the wrong-QR bug, against the ZIMRA TEST device only.
 *   npx tsx scripts/pos-qr-collision.ts
 * Reproduces a database reset: the device already holds invoice number X for receipt A, then a
 * different sale B is allocated the same X. B must end up with ITS OWN receipt and QR.
 */
import * as dotenv from "dotenv";
import path from "node:path";
import { Types } from "mongoose";
import { randomUUID } from "node:crypto";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

async function main() {
  const { default: dbConnect } = await import("@/lib/mongoose");
  const { default: Branch } = await import("@/database/branch.model");
  const { default: Store } = await import("@/database/store.model");
  const { default: PosSale } = await import("@/database/posSale.model");
  const { default: InvoiceCounter } = await import("@/database/invoiceCounter.model");
  const { createPosSale } = await import("@/lib/services/posSale.service");
  const { getPosDeviceStatus, getDeviceInvoice } = await import("@/lib/services/zimraPosDevice.service");
  const { getZimraContext } = await import("@/lib/services/zimraFiscal.service");
  const { checkFiscalMatchesSale } = await import("@/lib/pos/fiscalMatch");

  await dbConnect();
  const host = new URL((await getZimraContext()).base).host;
  if (host !== "140.82.25.196:10005") throw new Error(`Refusing to run against ${host}`);
  const st = await getPosDeviceStatus();
  if (!st.reachable || !st.dayOpen) throw new Error("Test device must be reachable with the day open");

  let failures = 0;
  const check = (ok: boolean, label: string, extra?: unknown) => {
    if (!ok) failures++;
    console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${!ok && extra !== undefined ? ` -> ${JSON.stringify(extra)}` : ""}`);
  };

  const run = Date.now().toString(36).toUpperCase().slice(-2);
  let store = await Store.findOne();
  if (!store) store = await Store.create({ name: "SIM Store", location: "SIM" } as never);
  const branch = await Branch.create({
    name: `QRTEST ${run}`, location: "SIM", storeId: store._id,
    pos: { enabled: true, invoicePrefix: `Q${run}`, taxPercent: 15.5, taxCode: "A", taxInclusive: true, defaultCurrency: "USD", receipt: { companyName: "SIM" } },
  } as never);
  const mk = (amount: number, lines = 1) =>
    createPosSale({
      branchId: String(branch._id), cashierId: String(new Types.ObjectId()), idempotencyKey: randomUUID(), currency: "USD",
      lines: Array.from({ length: lines }, (_, i) => ({ description: `QR item ${i}`, quantity: 1, unitPrice: amount })), isTest: true,
    });
  const ids: unknown[] = [];
  try {
    const a = await mk(7.77); ids.push(a._id);
    check(a.status === "FISCALISED", "sale A fiscalised", [a.status, a.lastError]);
    // simulate a database reset: sale A and the counters vanish, the device keeps receipt A
    await PosSale.deleteOne({ _id: a._id });
    await InvoiceCounter.deleteMany({ branchId: branch._id });

    const b = await mk(88.88, 2); ids.push(b._id);
    check(b.status === "FISCALISED", "sale B fiscalised", [b.status, b.lastError]);
    check(b.invoiceNumber !== a.invoiceNumber, `B skipped the used number (${a.invoiceNumber} -> ${b.invoiceNumber})`);
    check(b.fiscal?.qrCodeUrl !== a.fiscal?.qrCodeUrl, "B's QR differs from A's");
    const m = b.fiscal ? checkFiscalMatchesSale(b, b.fiscal) : { ok: false };
    check(m.ok, "B's stored receipt matches B (total, lines, number, QR)", m);
    const dev = await getDeviceInvoice(b.invoiceNumber!);
    check(dev.found && dev.fiscal.qrCodeUrl === b.fiscal?.qrCodeUrl, "device GetInvoice agrees with B's QR");
    check(Math.abs(b.totalAmount - 177.76) < 0.01, "B total is 177.76", b.totalAmount);
  } finally {
    await PosSale.deleteMany({ branchId: branch._id });
    await InvoiceCounter.deleteMany({ branchId: branch._id });
    await Branch.deleteOne({ _id: branch._id });
  }
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
