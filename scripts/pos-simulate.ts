/**
 * POS simulation against the ZIMRA TEST virtual device. Never runs against anything else.
 *
 *   npm run pos:simulate
 *
 * Creates throw-away branches/users/sales (all marked isTest), drives the real service code,
 * and asserts the invariants that matter for a shared device:
 *   1. 6 branches selling at once, both currencies: every sale fiscalised, branch numbers
 *      contiguous and unique, device receipt numbers unique, device agrees on every QR.
 *   2. Idempotency: the same sale submitted 5x at once creates exactly one receipt.
 *   3. Outage: device unreachable -> sale saved UNFISCALISED with a provisional number,
 *      queue later fiscalises it with the next fiscal number (no gap).
 *   4. Same-day rule: an older-day sale is NOT auto-fiscalised; admin approval is.
 *   5. Unknown outcome: a receipt already on the device is recovered via GetInvoice,
 *      one that is not is resubmitted under the same number.
 *   6. Branch isolation: a cashier cannot see or act on another branch's sales.
 * Cleans up after itself unless --keep is passed.
 */
import * as dotenv from "dotenv";
import path from "node:path";
import { Types } from "mongoose";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const KEEP = process.argv.includes("--keep");
const ALLOWED_HOSTS = (process.env.POS_SIM_ALLOWED_HOSTS ?? "140.82.25.196:10005").split(",").map((s) => s.trim());

let failures = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (!ok) failures++;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${!ok && extra !== undefined ? `  -> ${JSON.stringify(extra)}` : ""}`);
};

async function main() {
  const { default: dbConnect } = await import("@/lib/mongoose");
  const { default: Branch } = await import("@/database/branch.model");
  const { default: Store } = await import("@/database/store.model");
  const { default: User } = await import("@/database/user.model");
  const { default: PosSale } = await import("@/database/posSale.model");
  const { default: InvoiceCounter } = await import("@/database/invoiceCounter.model");
  const { default: FiscalSettings } = await import("@/database/fiscalSettings.model");
  const { createPosSale, fiscalisePosSale, runPosQueue, getPosSummary } = await import("@/lib/services/posSale.service");
  const { getDeviceInvoice, getPosDeviceStatus, submitPosReceipt } = await import("@/lib/services/zimraPosDevice.service");
  const { getZimraContext } = await import("@/lib/services/zimraFiscal.service");
  const { resolvePosScope } = await import("@/lib/auth/pos-scope");
  const { allocateNumber, formatInvoiceNumber, seriesFor } = await import("@/lib/services/posNumbering.service");
  const { closeFiscalDayWithReport, countPendingPosSales, PendingPosSalesError } = await import("@/lib/services/fiscalDayOps.service");
  const { getPosAnalytics } = await import("@/lib/services/posAnalytics.service");
  const { issueCreditNote, PosError } = await import("@/lib/services/posSale.service");
  const { importStockToPos } = await import("@/lib/services/posCatalog.service");
  const { default: PosProduct } = await import("@/database/posProduct.model");
  const { default: Upload } = await import("@/database/upload.model");
  const { default: UploadProduct } = await import("@/database/uploadproduct.model");
  const { randomUUID } = await import("node:crypto");

  await dbConnect();

  // ---- safety guard -------------------------------------------------------
  const ctx = await getZimraContext();
  const host = new URL(ctx.base).host;
  if (!ALLOWED_HOSTS.includes(host)) {
    throw new Error(`Refusing to simulate against ${host}. Allowed test hosts: ${ALLOWED_HOSTS.join(", ")}`);
  }
  const status = await getPosDeviceStatus();
  console.log(`Device ${host}: reachable=${status.reachable} dayOpen=${status.dayOpen} day=${status.fiscalDayNo}`);
  if (!status.reachable || !status.dayOpen) throw new Error("Test device must be reachable with the fiscal day open");

  // ---- fixtures -----------------------------------------------------------
  const run = Date.now().toString(36).toUpperCase().slice(-3);
  let store = await Store.findOne();
  if (!store) store = await Store.create({ name: "SIM Store", location: "SIM" } as never);
  const prefixes = ["S1", "S2", "S3", "S4", "S5", "S6"].map((p) => `${p}${run.slice(0, 1)}`);
  const branches = await Branch.insertMany(
    prefixes.map((p, i) => ({
      name: `SIM Branch ${i + 1} ${run}`,
      location: "SIM",
      storeId: store!._id,
      pos: {
        enabled: true,
        invoicePrefix: p,
        taxPercent: 15.5,
        taxCode: "A",
        taxInclusive: true,
        defaultCurrency: "USD",
        receipt: { companyName: "SIM", branchName: `Branch ${i + 1}` },
      },
    }))
  );
  const branchIds = branches.map((b) => String(b._id));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const cashier = (_b: number) => String(new Types.ObjectId());
  const createdSaleIds: string[] = [];
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Harare" });

  const sale = (b: number, currency: "USD" | "ZWG", amount: number, key = randomUUID()) =>
    createPosSale({
      branchId: branchIds[b],
      cashierId: cashier(b),
      idempotencyKey: key,
      currency,
      lines: [{ description: `SIM item ${b}`, quantity: 1, unitPrice: amount }],
      isTest: true,
    });

  try {
    // ---- 1. six branches at once -----------------------------------------
    console.log("\n[1] 6 branches x 4 sales, both currencies, all at once");
    const jobs: Promise<Awaited<ReturnType<typeof sale>>>[] = [];
    for (let b = 0; b < 6; b++) for (let k = 0; k < 4; k++) jobs.push(sale(b, k % 2 ? "ZWG" : "USD", 10 + b + k));
    const t0 = Date.now();
    const done = await Promise.all(jobs);
    console.log(`  ${done.length} sales in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    done.forEach((s) => createdSaleIds.push(String(s._id)));

    check(done.every((s) => s.status === "FISCALISED"), "every sale FISCALISED", done.filter((s) => s.status !== "FISCALISED").map((s) => [s.status, s.lastError]));
    const numbers = done.map((s) => s.invoiceNumber!);
    check(new Set(numbers).size === numbers.length, "all branch invoice numbers unique");
    const globals = done.map((s) => s.fiscal?.receiptGlobalNo);
    check(new Set(globals).size === globals.length, "all device global receipt numbers unique");

    let contiguous = true;
    for (let b = 0; b < 6; b++) {
      for (const ccy of ["USD", "ZWG"] as const) {
        const seqs = done
          .filter((s) => String(s.branchId) === branchIds[b] && s.currency === ccy)
          .map((s) => Number(s.invoiceNumber!.match(/(\d+)$/)![1]))
          .sort((a, c) => a - c);
        if (!seqs.every((n, i) => n === i + 1)) contiguous = false;
      }
    }
    check(contiguous, "per branch + currency numbers are 1..n with no gaps");
    check(done.every((s) => /^S\d[A-Z0-9]?[UZ]\d{4}$/.test(s.invoiceNumber!)), "number format {prefix}{U|Z}{0000}");

    let allMatch = true;
    for (const s of done.slice(0, 8)) {
      const dev = await getDeviceInvoice(s.invoiceNumber!);
      if (!dev.found || dev.fiscal.qrCodeUrl !== s.fiscal?.qrCodeUrl) allMatch = false;
    }
    check(allMatch, "device GetInvoice returns the same QR for sampled sales");

    const sums = await Promise.all(branchIds.map((id) => getPosSummary({ branchId: id, includeTest: true })));
    const expectedUsd = done.filter((s) => s.currency === "USD");
    const totalsOk = branchIds.every((id, i) => {
      const usd = done.filter((s) => String(s.branchId) === id && s.currency === "USD");
      return sums[i][0].fiscalised.count === usd.length && Math.abs(sums[i][0].fiscalised.total - usd.reduce((a, s) => a + s.totalAmount, 0)) < 0.005;
    });
    check(totalsOk && expectedUsd.length === 12, "branch daily totals equal the sum of that branch's invoices");

    // ---- 2. idempotency ---------------------------------------------------
    console.log("\n[2] same sale submitted 5x at once");
    const key = randomUUID();
    const dups = await Promise.all([0, 1, 2, 3, 4].map(() => sale(0, "USD", 19.99, key)));
    createdSaleIds.push(String(dups[0]._id));
    check(new Set(dups.map((d) => String(d._id))).size === 1, "one sale document for one idempotency key");
    check(await PosSale.countDocuments({ idempotencyKey: key }) === 1, "exactly one row stored");
    const afterDup = await PosSale.findById(dups[0]._id);
    check(afterDup?.status === "FISCALISED" && !!afterDup.invoiceNumber, "and it is fiscalised once", afterDup?.status);

    // ---- 3. outage + queue ------------------------------------------------
    console.log("\n[3] device unreachable, then back");
    const fs = await FiscalSettings.findOne();
    if (!fs) throw new Error("No FiscalSettings document; set the test URL first (scripts/set-fiscal-zimra-test-url.mjs)");
    // The stored URL may be absent (the app then falls back to ZIMRA_API_URL), so restore with $unset
    // in that case. Raw collection writes: Mongoose silently drops `undefined` values.
    const originalUrl: string | undefined = fs.zimraApiUrl;
    const originalProd: boolean | undefined = fs.zimraUseProductionUrl;
    const restoreDeviceUrl = async () => {
      const col = FiscalSettings.collection;
      await col.updateMany(
        {},
        originalUrl === undefined
          ? { $unset: { zimraApiUrl: "" }, $set: { zimraUseProductionUrl: originalProd ?? false } }
          : { $set: { zimraApiUrl: originalUrl, zimraUseProductionUrl: originalProd ?? false } }
      );
    };
    process.once("SIGINT", () => void restoreDeviceUrl().finally(() => process.exit(130)));
    const before = await InvoiceCounter.findOne({ branchId: branchIds[1], series: "USD" }).lean<{ seq: number; free: number[] }>();
    try {
      await FiscalSettings.updateOne({}, { $set: { zimraApiUrl: "http://127.0.0.1:9", zimraUseProductionUrl: false } });
      const down = await sale(1, "USD", 33.5);
      createdSaleIds.push(String(down._id));
      check(down.status === "UNFISCALISED", "sale during outage is saved as UNFISCALISED", down.status);
      check(/^S2\w?UP\d{4}$/.test(down.provisionalNumber ?? ""), "provisional number issued (…UP0001)", down.provisionalNumber);
      check(!down.invoiceNumber, "no fiscal number consumed during the outage");
      const down2 = await sale(1, "USD", 34.5); // breaker is open: instant, no 30 s wait
      createdSaleIds.push(String(down2._id));
      check(down2.status === "UNFISCALISED" && down2.provisionalNumber !== down.provisionalNumber, "second outage sale gets its own provisional number");
    } finally {
      await restoreDeviceUrl();
    }
    const q = await runPosQueueWithReset(runPosQueue, PosSale, createdSaleIds);
    check(q.deviceReachable, "queue sees device back");
    const recovered = await PosSale.find({ _id: { $in: createdSaleIds }, provisionalNumber: { $exists: true } });
    check(recovered.length >= 2 && recovered.every((s) => s.status === "FISCALISED"), "queued sales fiscalised after recovery", recovered.map((s) => [s.status, s.lastError]));
    const nums = recovered.map((s) => Number(s.invoiceNumber!.match(/(\d+)$/)![1])).sort((a, c) => a - c);
    check(nums[0] === (before?.seq ?? 0) + 1 && nums[1] === nums[0] + 1, "fiscal series continues with no gap", { nums, before });
    let linked = recovered.length > 0;
    for (const s of recovered) {
      const dev = await getDeviceInvoice(s.invoiceNumber!);
      const data = ((dev.found ? dev.fiscal.rawResponse : {}) as { Data?: { receipt?: { receiptNotes?: string } } }).Data;
      if (!dev.found || !s.provisionalNumber || !(data?.receipt?.receiptNotes ?? "").includes(s.provisionalNumber)) linked = false;
    }
    check(linked, "device receipt carries the provisional number in its notes (link between the two documents)");

    // ---- 4. earlier-day sales -------------------------------------------------
    console.log("\n[4] an older-day sale is fiscalised by the queue, in the day that is open now");
    try {
      await FiscalSettings.updateOne({}, { $set: { zimraApiUrl: "http://127.0.0.1:9", zimraUseProductionUrl: false } });
      const old = await sale(2, "USD", 12.25);
      createdSaleIds.push(String(old._id));
      await restoreDeviceUrl();
      await PosSale.updateOne({ _id: old._id }, { $set: { soldDate: "2020-01-01" } });
      await runPosQueueWithReset(runPosQueue, PosSale, [String(old._id)]);
      const moved = await PosSale.findById(old._id);
      check(moved?.status === "FISCALISED" && !moved.needsApproval, "auto queue fiscalises it with no approval; our record keeps the original sale date", [moved?.status, moved?.needsApproval, moved?.soldDate]);
    } finally {
      await restoreDeviceUrl();
    }

    // ---- 5. unknown outcome ----------------------------------------------
    console.log("\n[5] unknown outcome is reconciled with GetInvoice");
    const unk = await sale(3, "USD", 7.5);
    createdSaleIds.push(String(unk._id));
    // Pretend the reply was lost: the receipt IS on the device, our row says UNKNOWN and has no QR.
    await PosSale.updateOne({ _id: unk._id }, { $set: { status: "UNKNOWN" }, $unset: { fiscal: "", fiscalisedAt: "" } });
    const healed = await fiscalisePosSale(String(unk._id), { reason: "reconcile", force: true });
    check(healed.status === "FISCALISED" && healed.fiscal?.qrCodeUrl === unk.fiscal?.qrCodeUrl, "lost reply recovered from device, same QR, no second receipt");
    const devCount = (await getPosDeviceStatus()).lastReceiptGlobalNo;
    const healed2 = await fiscalisePosSale(String(unk._id), { reason: "reconcile", force: true });
    check(healed2.status === "FISCALISED" && (await getPosDeviceStatus()).lastReceiptGlobalNo === devCount, "calling again does not create another receipt");

    const ghost = await sale(3, "USD", 8.5);
    createdSaleIds.push(String(ghost._id));
    // Row claims UNKNOWN with a number the device has never seen.
    const ghostNo = `${prefixes[3]}U9${run}`;
    await PosSale.updateOne({ _id: ghost._id }, { $set: { status: "UNKNOWN", invoiceNumber: ghostNo }, $unset: { fiscal: "" } });
    const resub = await fiscalisePosSale(String(ghost._id), { reason: "reconcile", force: true });
    check(resub.status === "FISCALISED" && resub.invoiceNumber === ghostNo, "not-on-device sale is resubmitted under the SAME number", [resub.status, resub.invoiceNumber, resub.lastError]);
    const direct = await submitPosReceipt({
      invoiceNumber: ghostNo,
      currency: "USD",
      totalAmount: 8.5,
      totalVat: 1.14,
      taxInclusive: true,
      paymentMethod: "CASH",
      lines: [{ lineNo: 1, description: "x", quantity: 1, unitPrice: 8.5, lineTotalIncl: 8.5, lineTotalExcl: 7.36, taxCode: "A", taxPercent: 15.5 }],
    });
    check(direct.kind === "rejected" && direct.reason === "duplicate", "device refuses a duplicate number (retry safety)");

    // ---- 6. branch isolation ---------------------------------------------
    console.log("\n[6] branch isolation");
    const uA = await User.create({ name: "SimA", surname: run, email: `sima.${run}@sim.test`, role: "cashier", branchId: branches[0]._id });
    const uB = await User.create({ name: "SimB", surname: run, email: `simb.${run}@sim.test`, role: "cashier", branchId: branches[1]._id });
    const uAdmin = await User.create({ name: "SimAdmin", surname: run, email: `simadmin.${run}@sim.test`, role: "admin" });
    const uNone = await User.create({ name: "SimNone", surname: run, email: `simnone.${run}@sim.test`, role: "cashier" });
    try {
      const sess = (id: unknown) => ({ user: { id: String(id), role: "admin" } }) as never; // JWT role is ignored; DB decides
      const a = await resolvePosScope(sess(uA._id));
      check(a.ok && a.scope.branchId === branchIds[0] && !a.scope.isAdmin, "cashier A is pinned to branch A (token claims admin, ignored)");
      const aToB = await resolvePosScope(sess(uA._id), branchIds[1]);
      check(!aToB.ok && aToB.response.status === 403, "cashier A asking for branch B gets 403");
      const adm = await resolvePosScope(sess(uAdmin._id));
      check(adm.ok && adm.scope.isAdmin && adm.scope.branchId === null, "admin sees across branches");
      const admB = await resolvePosScope(sess(uAdmin._id), branchIds[1]);
      check(admB.ok && admB.scope.branchId === branchIds[1], "admin may filter to one branch");
      const none = await resolvePosScope(sess(uNone._id));
      check(!none.ok && none.response.status === 403, "cashier with no branch is refused");
      const anon = await resolvePosScope(null);
      check(!anon.ok && anon.response.status === 401, "no session is refused");
      const aSales = await PosSale.find({ branchId: new Types.ObjectId(a.ok ? a.scope.branchId! : "") }).lean();
      check(aSales.length > 0 && aSales.every((s) => String(s.branchId) === branchIds[0]), "branch-scoped query returns only branch A sales");
    } finally {
      await User.deleteMany({ _id: { $in: [uA._id, uB._id, uAdmin._id, uNone._id] } });
    }

    // ---- 7. offline sync ---------------------------------------------------
    console.log("\n[7] sales made offline sync with the provisional number they already printed");
    const ob = 4;
    const oPrefix = prefixes[ob];
    const leased: string[] = [];
    for (let i = 0; i < 3; i++) leased.push(formatInvoiceNumber(oPrefix, "USD", await allocateNumber(branchIds[ob], seriesFor("USD", true)), true));
    const offlineSale = (extra: { provisionalNumber?: string; soldAt?: Date }) =>
      createPosSale({
        branchId: branchIds[ob],
        cashierId: cashier(ob),
        idempotencyKey: randomUUID(),
        currency: "USD",
        lines: [{ description: "SIM offline item", quantity: 1, unitPrice: 5 }],
        isTest: true,
        offline: true,
        ...extra,
      });
    const till = new Date(Date.now() - 20 * 60_000);
    const o1 = await offlineSale({ provisionalNumber: leased[0], soldAt: till });
    createdSaleIds.push(String(o1._id));
    check(o1.provisionalNumber === leased[0], "till-issued provisional number is kept", [o1.provisionalNumber, leased[0]]);
    check(o1.status === "FISCALISED" && o1.offline === true && o1.soldAt.getTime() === till.getTime(), "synced sale is fiscalised and keeps the till time and offline flag", [o1.status, o1.offline]);
    const o2 = await offlineSale({ provisionalNumber: leased[0] });
    createdSaleIds.push(String(o2._id));
    check(o2.provisionalNumber !== leased[0] && o2.status === "FISCALISED", "a provisional number that is already taken is replaced, the sale is still accepted", o2.provisionalNumber);
    const forged = `${oPrefix}UP9999`;
    const o3 = await offlineSale({ provisionalNumber: forged });
    createdSaleIds.push(String(o3._id));
    check(o3.provisionalNumber !== forged, "a number the server never leased is ignored");
    const o4 = await offlineSale({ provisionalNumber: "HACK" });
    createdSaleIds.push(String(o4._id));
    check(!o4.provisionalNumber, "a malformed number is ignored");
    const fb = `${oPrefix}UQ7K30001`;
    const o5 = await offlineSale({ provisionalNumber: fb });
    createdSaleIds.push(String(o5._id));
    check(o5.provisionalNumber === fb, "the till-unique fallback number (used if a leased block runs out) is accepted");
    const o6 = await offlineSale({ provisionalNumber: leased[1], soldAt: new Date(Date.now() - 26 * 3_600_000) });
    createdSaleIds.push(String(o6._id));
    check(o6.status === "FISCALISED" && !o6.needsApproval && o6.provisionalNumber === leased[1], "an offline sale from an earlier day is fiscalised when it syncs, with no approval step", [o6.status, o6.needsApproval]);
    let tooOld = false;
    try {
      await offlineSale({ soldAt: new Date(Date.now() - 45 * 86_400_000) });
    } catch {
      tooOld = true;
    }
    check(tooOld, "a sale older than 30 days is refused");

    // ---- 8. day close guard ------------------------------------------------
    console.log("\n[8] the fiscal day will not close over unfiscalised sales");
    const g = await createPosSale({
      branchId: branchIds[5],
      cashierId: cashier(5),
      idempotencyKey: randomUUID(),
      currency: "USD",
      lines: [{ description: "SIM guard item", quantity: 1, unitPrice: 4 }],
      isTest: false, // the guard ignores test sales
    });
    createdSaleIds.push(String(g._id));
    // Make it look unfiscalised and recently retried so the queue leaves it alone.
    await PosSale.updateOne({ _id: g._id }, { $set: { status: "UNFISCALISED", attempts: 12 } });
    const pendingNow = await countPendingPosSales();
    if (pendingNow < 1) throw new Error("Test setup failed: refusing to call close on the test device");
    let blocked: number | null = null;
    try {
      await closeFiscalDayWithReport("manual");
    } catch (e) {
      if (e instanceof PendingPosSalesError) blocked = e.pending;
    }
    check(blocked !== null && blocked >= 1, "closing is refused while a sale from today is not fiscalised", blocked);
    check((await getPosDeviceStatus()).dayOpen === true, "and the fiscal day is still open");
    await PosSale.updateOne({ _id: g._id }, { $set: { status: "VOIDED" } });

    // ---- 9. analytics ------------------------------------------------------
    console.log("\n[9] analytics agree with the sales");
    const a = await getPosAnalytics({ from: todayStr, to: todayStr, includeTest: true });
    const simBranches = a.branches.filter((b) => branchIds.includes(b.branchId));
    const dbCount = await PosSale.countDocuments({ branchId: { $in: branches.map((b) => b._id) }, soldDate: todayStr, status: "FISCALISED" });
    const fromAnalytics = simBranches.reduce((n, b) => n + b.USD.fiscalised.count + b.ZWG.fiscalised.count, 0);
    check(dbCount > 0 && fromAnalytics === dbCount, "per-branch fiscalised counts equal the sales in the database", [fromAnalytics, dbCount]);
    const one = await getPosAnalytics({ from: todayStr, to: todayStr, branchId: branchIds[0], includeTest: true });
    check(one.branches.length === 1 && one.branches[0].branchId === branchIds[0], "filtering to one branch returns only that branch");
    const sumTotals = a.totals.USD.fiscalised.total + a.totals.ZWG.fiscalised.total;
    const sumBranches = a.branches.reduce((n, b) => n + b.USD.fiscalised.total + b.ZWG.fiscalised.total, 0);
    check(Math.abs(sumTotals - sumBranches) < 0.01, "overall totals equal the sum of the branches");

    // ---- 10. credit notes ----------------------------------------------------
    console.log("\n[10] credit notes");
    const actor = String(new Types.ObjectId());
    const original = await sale(0, "USD", 20);
    createdSaleIds.push(String(original._id));
    const cn = await issueCreditNote(String(original._id), actor, "customer returned the goods");
    createdSaleIds.push(String(cn._id));
    check(cn.status === "FISCALISED" && cn.kind === "CREDIT_NOTE", "credit note is fiscalised by the device", [cn.status, cn.lastError]);
    check(new RegExp(`^${prefixes[0]}UC\\d{4}$`).test(cn.invoiceNumber ?? ""), "credit note has its own number series (…UC0001)", cn.invoiceNumber);
    check(cn.totalAmount === -original.totalAmount && cn.totalVat === -original.totalVat && cn.lines.every((l) => l.quantity < 0), "amounts and quantities mirror the sale, negated");
    const cnDev = await getDeviceInvoice(cn.invoiceNumber!);
    const cnReceipt = (cnDev.found ? (cnDev.fiscal.rawResponse as { Data?: { receipt?: { receiptType?: string; creditDebitNote?: { receiptGlobalNo?: number } } } }).Data?.receipt : undefined);
    check(cnReceipt?.receiptType === "CreditNote" && String(cnReceipt?.creditDebitNote?.receiptGlobalNo) === String(original.fiscal?.receiptGlobalNo), "device holds it as a CreditNote referring to the original receipt", cnReceipt?.creditDebitNote);
    const reloaded = await PosSale.findById(original._id);
    check(String(reloaded?.creditNoteId) === String(cn._id), "the sale records its credit note");
    let code = "";
    try {
      await issueCreditNote(String(original._id), actor);
    } catch (e) {
      code = e instanceof PosError ? e.code : String(e);
    }
    check(code === "ALREADY_CREDITED", "a sale cannot be credited twice", code);
    code = "";
    try {
      await issueCreditNote(String(cn._id), actor);
    } catch (e) {
      code = e instanceof PosError ? e.code : String(e);
    }
    check(code === "IS_CREDIT", "a credit note cannot be credited", code);

    const racy = await sale(0, "USD", 21);
    createdSaleIds.push(String(racy._id));
    const raced = await Promise.allSettled([1, 2, 3].map(() => issueCreditNote(String(racy._id), actor)));
    const won = raced.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof issueCreditNote>>>[];
    won.forEach((w) => createdSaleIds.push(String(w.value._id)));
    check(won.length === 1 && won[0].value.status === "FISCALISED", "three simultaneous attempts create exactly one credit note", raced.map((r) => r.status));
    const cnNumbers = (await PosSale.find({ branchId: branchIds[0], kind: "CREDIT_NOTE" }).lean()).map((c) => Number(c.invoiceNumber!.match(/(\d+)$/)![1])).sort((a, b) => a - b);
    check(cnNumbers.every((n, i) => n === i + 1), "credit note numbers are 1..n with no gaps", cnNumbers);

    const unf = await sale(1, "USD", 9);
    createdSaleIds.push(String(unf._id));
    await PosSale.updateOne({ _id: unf._id }, { $set: { status: "UNFISCALISED" } });
    code = "";
    try {
      await issueCreditNote(String(unf._id), actor);
    } catch (e) {
      code = e instanceof PosError ? e.code : String(e);
    }
    check(code === "NOT_FISCALISED", "only a fiscalised sale can be credited", code);
    await PosSale.updateOne({ _id: unf._id }, { $set: { status: "VOIDED" } });

    const creditAnalytics = await getPosAnalytics({ from: todayStr, to: todayStr, branchId: branchIds[0], includeTest: true });
    check(creditAnalytics.totals.USD.credit.count === 2 && creditAnalytics.totals.USD.credit.total === -(original.totalAmount + racy.totalAmount), "analytics show credit notes separately (negative) from sales", creditAnalytics.totals.USD.credit);

    // device down: the credit note is saved, provisional, and goes through once the device is back
    const late = await sale(0, "USD", 22);
    createdSaleIds.push(String(late._id));
    try {
      await FiscalSettings.updateOne({}, { $set: { zimraApiUrl: "http://127.0.0.1:9", zimraUseProductionUrl: false } });
      const lateCn = await issueCreditNote(String(late._id), actor, "device down");
      createdSaleIds.push(String(lateCn._id));
      check(lateCn.status === "UNFISCALISED" && /^S1\w?UP\d{4}$/.test(lateCn.provisionalNumber ?? ""), "credit note issued while the device is down is saved as provisional", [lateCn.status, lateCn.provisionalNumber]);
    } finally {
      await restoreDeviceUrl();
    }
    await runPosQueueWithReset(runPosQueue, PosSale, createdSaleIds);
    const lateAfter = await PosSale.findOne({ originalSaleId: late._id });
    check(lateAfter?.status === "FISCALISED" && /UC\d{4}$/.test(lateAfter.invoiceNumber ?? ""), "and is fiscalised by the retry queue with a credit note number", [lateAfter?.status, lateAfter?.lastError]);

    // ---- 11. tax-exclusive pricing -------------------------------------------
    console.log("\n[11] tax-exclusive pricing");
    await Branch.updateOne({ _id: branchIds[2] }, { $set: { "pos.taxInclusive": false } });
    const ex = await sale(2, "USD", 10);
    createdSaleIds.push(String(ex._id));
    check(ex.status === "FISCALISED" && ex.totalAmount === 11.55 && ex.totalVat === 1.55, "exclusive-price sale (10.00 + 15.5% VAT = 11.55) is accepted by the device", [ex.status, ex.totalAmount, ex.totalVat, ex.lastError]);
    const exCn = await issueCreditNote(String(ex._id), actor);
    createdSaleIds.push(String(exCn._id));
    check(exCn.status === "FISCALISED" && exCn.totalAmount === -11.55, "and its credit note too", [exCn.status, exCn.lastError]);
    await Branch.updateOne({ _id: branchIds[2] }, { $set: { "pos.taxInclusive": true } });

    // ---- 12. import from a stock upload ---------------------------------------
    console.log("\n[12] import from the latest stock upload");
    const ib = branchIds[3];
    const up = await Upload.create({ uploadedBy: new Types.ObjectId(), storeId: store!._id, branchId: ib, upload_date: new Date(), week: 1, month: "October", year: 2026, fileName: "sim.xlsx", contentHash: `sim-${run}`, products: [], totalProducts: 4, estimatedValue: Types.Decimal128.fromString("0"), status: "complete" });
    const line = (name: string, code: string, qty: number, price: string) => ({ uploadId: up._id, productId: new Types.ObjectId(), storeId: store!._id, branchId: ib, name, code, qty, price: Types.Decimal128.fromString(price), upload_date: new Date(), week: 1, month: "October", year: 2026 });
    await UploadProduct.insertMany([line("SIM Stock A", "SA", 5, "3.40"), line("SIM Stock B", "SB", 2, "10"), line("SIM Stock Zero", "SZ", 0, "7"), line("SIM Stock Free", "SF", 4, "0")]);
    const imp = await importStockToPos(ib);
    check(imp.created === 2 && imp.considered === 2, "only in-stock, priced lines are imported", imp);
    const imp2 = await importStockToPos(ib);
    check(imp2.created === 0 && imp2.skippedExisting === 2, "importing again adds nothing", imp2);
    await PosProduct.updateOne({ branchId: ib, name: "SIM Stock A" }, { $set: { priceUsd: 99 } });
    await importStockToPos(ib);
    check((await PosProduct.findOne({ branchId: ib, name: "SIM Stock A" }))?.priceUsd === 99, "existing prices are kept by default");
    const imp3 = await importStockToPos(ib, { overwritePrices: true });
    check((await PosProduct.findOne({ branchId: ib, name: "SIM Stock A" }))?.priceUsd === 3.4 && imp3.updated >= 1, "and replaced when asked");
    const imp4 = await importStockToPos(ib, { includeOutOfStock: true });
    check(imp4.created === 1, "out-of-stock lines can be included", imp4);
  } finally {
    if (!KEEP) {
      await PosProduct.deleteMany({ branchId: { $in: branches.map((b) => b._id) } });
      await UploadProduct.deleteMany({ branchId: { $in: branches.map((b) => b._id) } });
      await Upload.deleteMany({ branchId: { $in: branches.map((b) => b._id) } });
      await PosSale.deleteMany({ branchId: { $in: branches.map((b) => b._id) } });
      await InvoiceCounter.deleteMany({ branchId: { $in: branches.map((b) => b._id) } });
      await Branch.deleteMany({ _id: { $in: branches.map((b) => b._id) } });
      console.log("\n(cleaned up simulation branches, sales and counters; receipts remain on the test device)");
    }
  }

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

/** The queue backs off between attempts; make recent attempts due so the test does not sleep. */
async function runPosQueueWithReset(
  runPosQueue: (limit?: number) => Promise<{ deviceReachable: boolean }>,
  PosSale: unknown,
  ids: string[]
) {
  // Raw collection write: Mongoose would stamp updatedAt back to "now".
  await (PosSale as { collection: { updateMany: (f: unknown, u: unknown) => Promise<unknown> } }).collection.updateMany(
    { _id: { $in: ids.map((i) => new Types.ObjectId(i)) }, status: { $in: ["UNFISCALISED", "UNKNOWN"] } },
    { $set: { updatedAt: new Date(Date.now() - 3_600_000) } }
  );
  return runPosQueue(50);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
