/**
 * The per-device engine: the ONLY thing that numbers, signs and sends receipts for one ZIMRA device.
 *
 * Why it is shaped this way (each point is a close-day error we have seen or been warned about):
 *  - One writer. Numbers are assigned inside one lock, in arrival order, so counters, global numbers and the
 *    hash chain can never interleave or skip, however many tills call at once.
 *  - Saved before sent. A receipt is numbered, signed and written to the database BEFORE any request. A crash,
 *    a timeout or a lost reply leaves enough on disk to send the identical receipt again (ZIMRA answers a repeat
 *    of the same global number and hash with the original receipt), never a gap and never a duplicate.
 *  - Strict order. Receipts go out in number order, one at a time. A receipt that fails to arrive blocks the ones
 *    after it (they would be flagged Gray) and is retried with back-off.
 *  - Checked first. Every rule we know ZIMRA flags Red is checked before a number is used (validate.ts).
 *  - The offline answer is already valid. As soon as a receipt is numbered its QR text is known, so a till can
 *    print a real fiscal receipt while ZIMRA is unreachable; delivery follows when it is back.
 *  - A guarded close. See closeDay().
 */
import type { Collection, Db } from "mongodb";

import { FiscalDevice, accumulateCounters, type FiscalDayState, type PreparedReceipt, type ReceiptInput } from "../core/device.js";
import { cents } from "../core/money.js";
import { receiptQrData } from "../core/qr.js";
import { fdmsDateTime } from "../core/signing.js";
import type { Storage } from "../core/storage.js";
import { FdmsApiError, type GetStatusResponse, type SubmitReceiptResponse } from "../core/types.js";
import type { Transport } from "../core/transport.js";
import { createHash, randomBytes } from "node:crypto";
import { parseFdmsDateTime } from "../core/time.js";
import { KeySigner } from "../node/key-signer.js";
import { MongoStorage } from "./mongo-storage.js";
import type { Colour, ReceiptRecord, ReceiptResult, SubmitRequest, ValidationProblem } from "./types.js";
import { normalizeBuyer, resolveTaxIds, validateRequest, type DeviceRules } from "./validate.js";

export interface EngineOptions {
  /** How long submit() waits for ZIMRA before answering "queued" (with a valid QR). */
  waitMs: number;
  retryBaseMs: number;
  retryMaxMs: number;
  /** What to do after ZIMRA flags a receipt Red: keep selling (the day is lost anyway) or stop. */
  onRed: "continue" | "pause";
  /** Open the fiscal day when a receipt arrives and none is open. Off by default: the schedule opens it. */
  autoOpenDay: boolean;
  /** Pause after opening a day before the first receipt: ZIMRA stamps the open time itself (RCPT014). */
  openGapMs: number;
  drainTimeoutMs: number;
  maxCloseAttempts: number;
  closePollMs: number;
  closePollTimeoutMs: number;
  /** How long a writer lease lasts without renewal. Another instance can take over after this. */
  leaseMs: number;
  /**
   * ZIMRA needs each receipt dated strictly after the previous one, to the second, so one device can number at
   * most one receipt a second without its dates running ahead of the clock. A burst may run ahead by this much
   * (ZIMRA flags dates more than 5 minutes ahead); beyond it new sales wait, then are told the device is busy.
   */
  maxDateDriftMs: number;
  /** How long a sale waits for the date drift to ease before it is told the device is busy. */
  busyWaitMs: number;
}

export const DEFAULT_ENGINE_OPTIONS: EngineOptions = {
  waitMs: 8_000,
  retryBaseMs: 2_000,
  retryMaxMs: 60_000,
  onRed: "continue",
  autoOpenDay: false,
  openGapMs: 2_500,
  drainTimeoutMs: 60_000,
  maxCloseAttempts: 3,
  closePollMs: 500,
  closePollTimeoutMs: 60_000,
  leaseMs: 15_000,
  maxDateDriftMs: 120_000,
  busyWaitMs: 20_000,
};

export interface Alert {
  deviceKey: string;
  kind: string;
  message: string;
  details?: Record<string, unknown>;
  at: Date;
}

export interface EngineDeps {
  db: Db;
  deviceKey: string;
  identity: { deviceId: number; serialNumber: string; privateKeyPem: string };
  transport: Transport;
  /** Overrides the ZIMRA host (tests). */
  baseUrl?: string;
  environment?: "test" | "production";
  /** Used for the QR and the rules until GetConfig has been read. */
  configSnapshot?: { qrUrl?: string; vatPayer?: boolean; taxes?: DeviceRules["taxes"] };
  options?: Partial<EngineOptions>;
  alert?: (a: Alert) => void;
}

class EngineDevice extends FiscalDevice {
  /** Replace the day state (in memory and in storage), e.g. after rebuilding it from the stored receipts. */
  async replaceState(state: FiscalDayState): Promise<void> {
    this.state = JSON.parse(JSON.stringify(state)) as FiscalDayState;
    await this.persistState();
  }

  /** Send an already numbered, signed receipt. Touches no state: the engine owns persistence. */
  send(prepared: PreparedReceipt): Promise<SubmitReceiptResponse> {
    return this.http.request<SubmitReceiptResponse>("POST", this.http.devicePath("SubmitReceipt"), { receipt: prepared.receipt });
  }
}

class Mutex {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const r = this.tail.then(fn, fn);
    this.tail = r.then(
      () => undefined,
      () => undefined
    );
    return r;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function colourOf(errors: { colour: string }[]): Colour {
  const has = (c: string) => errors.some((e) => e.colour.toLowerCase() === c);
  return has("red") ? "red" : has("gray") || has("grey") ? "gray" : has("yellow") ? "yellow" : "none";
}

function hashRequest(r: SubmitRequest): string {
  // Everything that decides what is fiscalised; `meta` is for tracing only.
  const { meta: _meta, ...rest } = r;
  return createHash("sha256").update(JSON.stringify(rest)).digest("hex");
}

export type CloseOutcome =
  | { ok: true; fiscalDayNo: number; attempts: number; totals: Record<string, { sales: string; credits: string; count: number }> }
  | { ok: false; reason: string; message: string; permanent: boolean; errorCode?: string; attempts: number };

export interface EngineStatus {
  deviceKey: string;
  deviceId: number;
  dayOpen: boolean;
  fiscalDayNo?: number;
  lastGlobalNo?: number;
  unsent: number;
  accepted: number;
  red: number;
  gray: number;
  paused?: string;
  closing: boolean;
  /** When this service opened the current fiscal day (ms since epoch). */
  dayOpenedAt?: number;
  lastError?: string;
}

export class DeviceEngine {
  readonly deviceKey: string;
  private readonly dev: EngineDevice;
  private readonly receipts: Collection<ReceiptRecord>;
  private readonly days: Collection<{ deviceKey: string; fiscalDayNo: number; openedAt: Date; closedAt?: Date; status: string; attempts?: unknown[] }>;
  private readonly alerts: Collection<Alert>;
  private readonly control: Collection<{ _id: string; paused?: string; dayOpenedAt?: number; rules?: DeviceRules & { qrUrl: string } }>;
  private readonly opts: EngineOptions;
  private rules: DeviceRules & { qrUrl: string };
  private readonly numberLock = new Mutex();
  private sendingNow?: Promise<void>;
  private sendAgain = false;
  private closing = false;
  private paused?: string;
  private dayOpenedAt = 0;
  private lastError?: string;
  private seq = 0;
  private wake?: ReturnType<typeof setTimeout>;
  private readonly leases: Collection<{ _id: string; owner: string; expiresAt: Date }>;
  private readonly owner = randomBytes(8).toString("hex");
  private leaseTimer?: ReturnType<typeof setInterval>;
  private haveLease = false;
  private stopped = false;

  constructor(private readonly deps: EngineDeps) {
    this.deviceKey = deps.deviceKey;
    this.opts = { ...DEFAULT_ENGINE_OPTIONS, ...deps.options };
    const storage: Storage = new MongoStorage(deps.db.collection("kv"), deps.deviceKey);
    this.dev = new EngineDevice(
      { deviceId: deps.identity.deviceId, serialNumber: deps.identity.serialNumber, modelName: "Server", modelVersion: "v1" },
      { signer: new KeySigner(deps.identity.privateKeyPem), transport: deps.transport, storage },
      { baseUrl: deps.baseUrl, environment: deps.environment ?? "test", retries: 1 }
    );
    this.receipts = deps.db.collection<ReceiptRecord>("receipts");
    this.days = deps.db.collection("days");
    this.alerts = deps.db.collection<Alert>("alerts");
    this.control = deps.db.collection("engine_state");
    this.leases = deps.db.collection("leases");
    const c = deps.configSnapshot ?? {};
    this.rules = { vatPayer: c.vatPayer ?? true, taxes: c.taxes ?? [], qrUrl: c.qrUrl ?? "https://fdmstest.zimra.co.zw" };
  }

  // ---------------------------------------------------------------------------------------------------------
  // Start-up and repair
  // ---------------------------------------------------------------------------------------------------------

  async init(): Promise<void> {
    if (!(await this.takeLease())) {
      throw new Error(`Another instance is already running device ${this.deps.identity.deviceId}. Only one writer per device is allowed.`);
    }
    await this.receipts.createIndex({ deviceKey: 1, seq: 1 }, { unique: true });
    await this.receipts.createIndex({ tenantId: 1, invoiceNo: 1 }, { unique: true });
    await this.receipts.createIndex({ deviceKey: 1, status: 1, seq: 1 });
    await this.receipts.createIndex({ deviceKey: 1, fiscalDayNo: 1, receiptGlobalNo: 1 });
    await this.days.createIndex({ deviceKey: 1, fiscalDayNo: 1 }, { unique: true });

    const ctl = await this.control.findOne({ _id: this.deviceKey });
    this.paused = ctl?.paused;
    this.dayOpenedAt = ctl?.dayOpenedAt ?? 0;
    // The last configuration ZIMRA gave us, so a restart while ZIMRA is unreachable can still check and QR receipts.
    if (ctl?.rules) this.rules = ctl.rules;
    const last = await this.receipts.find({ deviceKey: this.deviceKey }).sort({ seq: -1 }).limit(1).next();
    this.seq = last?.seq ?? 0;

    await this.refreshConfig().catch((e) => this.note(e)); // offline at start-up is fine: the snapshot is used
    await this.dev.reconcile().catch(() => undefined); // loads the persisted day state

    // Repair: a crash between "receipt saved" and "day state advanced" leaves the state one receipt behind.
    const newest = await this.receipts
      .find({ deviceKey: this.deviceKey, prepared: { $exists: true }, status: { $ne: "REJECTED" } })
      .sort({ receiptGlobalNo: -1 })
      .limit(1)
      .next();
    const st = this.dev.getState();
    if (newest?.prepared && (!st || (st.fiscalDayNo === newest.prepared.stateAfter.fiscalDayNo && st.receiptGlobalNo < newest.prepared.stateAfter.receiptGlobalNo))) {
      const dayNo = newest.prepared.stateAfter.fiscalDayNo;
      const day = await this.days.findOne({ deviceKey: this.deviceKey, fiscalDayNo: dayNo });
      if (!day?.closedAt) this.dev.restoreState(newest.prepared.stateAfter);
    }
  }

  /**
   * The writer lease: one engine per device, across all processes. The holder renews it on a timer; if it cannot
   * (database unreachable for longer than the lease), it stops numbering and sending rather than risk a second
   * writer. Another instance can only take over after the lease has expired.
   */
  private async takeLease(): Promise<boolean> {
    if (this.stopped) return false;
    const now = new Date();
    try {
      await this.leases.updateOne({ _id: this.deviceKey }, { $setOnInsert: { owner: "", expiresAt: new Date(0) } }, { upsert: true });
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e;
    }
    const got = await this.leases.findOneAndUpdate(
      { _id: this.deviceKey, $or: [{ owner: this.owner }, { expiresAt: { $lt: now } }] },
      { $set: { owner: this.owner, expiresAt: new Date(now.getTime() + this.opts.leaseMs) } },
      { returnDocument: "after" }
    );
    // shutdown() may have run while the update was in flight: give the lease straight back.
    if (got && this.stopped) {
      await this.leases.updateOne({ _id: this.deviceKey, owner: this.owner }, { $set: { expiresAt: new Date(0) } });
      this.haveLease = false;
      return false;
    }
    this.haveLease = !!got;
    if (this.haveLease && !this.leaseTimer) {
      this.leaseTimer = setInterval(() => void this.renewLease(), Math.max(50, this.opts.leaseMs / 3));
      this.leaseTimer.unref();
    }
    return this.haveLease;
  }

  private async renewLease(): Promise<void> {
    try {
      this.haveLease = await this.takeLease();
    } catch {
      // Cannot reach the database: keep the lease only until it would have expired.
      this.leaseLostAt ??= Date.now();
      if (Date.now() - this.leaseLostAt > this.opts.leaseMs) this.haveLease = false;
      return;
    }
    this.leaseLostAt = undefined;
    if (!this.haveLease) await this.raise("LEASE_LOST", "Another instance took over this device. This one has stopped sending.");
  }
  private leaseLostAt?: number;

  /** Give the lease up (clean shutdown) so another instance can start at once. */
  async shutdown(): Promise<void> {
    this.stopped = true;
    if (this.leaseTimer) clearInterval(this.leaseTimer);
    this.leaseTimer = undefined;
    if (this.wake) clearTimeout(this.wake);
    await this.idle();
    if (this.haveLease) await this.leases.updateOne({ _id: this.deviceKey, owner: this.owner }, { $set: { expiresAt: new Date(0) } });
    this.haveLease = false;
  }

  private note(e: unknown): void {
    this.lastError = e instanceof Error ? e.message : String(e);
  }

  private async refreshConfig(): Promise<void> {
    const cfg = await this.dev.getConfig();
    this.rules = {
      vatPayer: !!cfg.vatNumber,
      taxes: cfg.applicableTaxes.map((t) => ({ taxID: t.taxID, taxPercent: t.taxPercent ?? null })),
      qrUrl: cfg.qrUrl,
    };
    await this.control.updateOne({ _id: this.deviceKey }, { $set: { rules: this.rules } }, { upsert: true });
  }

  private async raise(kind: string, message: string, details?: Record<string, unknown>): Promise<void> {
    const a: Alert = { deviceKey: this.deviceKey, kind, message, details, at: new Date() };
    try {
      await this.alerts.insertOne({ ...a });
    } catch {
      /* an alert must never break fiscalisation */
    }
    try {
      this.deps.alert?.(a);
    } catch {
      /* ditto */
    }
  }

  private async setPaused(reason: string | undefined): Promise<void> {
    this.paused = reason;
    await this.control.updateOne({ _id: this.deviceKey }, reason ? { $set: { paused: reason } } : { $unset: { paused: "" } }, { upsert: true });
  }

  /** Let an operator resume a paused device after dealing with the cause. */
  async resume(): Promise<void> {
    await this.setPaused(undefined);
    this.kick();
  }

  // ---------------------------------------------------------------------------------------------------------
  // Submitting a receipt
  // ---------------------------------------------------------------------------------------------------------

  async submit(input: SubmitRequest): Promise<ReceiptResult> {
    const req = resolveTaxIds({ ...input, buyer: normalizeBuyer(input.buyer) }, this.rules);
    const requestHash = hashRequest(req);
    const existing = await this.receipts.findOne({ tenantId: req.tenantId, invoiceNo: req.invoiceNo });
    if (existing) return this.existingResult(existing, requestHash);

    const problems = validateRequest(req, this.rules);
    if (problems.length) return { invoiceNo: req.invoiceNo, status: "rejected", problems };
    if (!this.haveLease) return this.reject(req, "NOT_LEADER", "This instance no longer owns the device.");
    if (this.closing) return this.reject(req, "DAY_CLOSING", "The fiscal day is being closed. Try again in a moment, or issue a provisional receipt.");
    if (this.paused) return this.reject(req, "DEVICE_PAUSED", `This device is paused: ${this.paused}`);

    const made = await this.numberLock.run(() => this.numberAndStore(req, requestHash));
    if ("result" in made) return made.result;
    this.kick();

    // Give ZIMRA a moment to answer; otherwise hand back the (already valid) queued receipt.
    const deadline = Date.now() + this.opts.waitMs;
    for (;;) {
      const rec = await this.receipts.findOne({ tenantId: req.tenantId, invoiceNo: req.invoiceNo });
      if (rec && (rec.status === "ACCEPTED" || rec.status === "REJECTED")) return this.toResult(rec);
      if (Date.now() >= deadline) return this.toResult(rec ?? made.record);
      await sleep(20);
    }
  }

  private reject(req: SubmitRequest, code: string, message: string): ReceiptResult {
    return { invoiceNo: req.invoiceNo, status: "rejected", problems: [{ code, message }] };
  }

  private async existingResult(rec: ReceiptRecord, requestHash: string): Promise<ReceiptResult> {
    if (rec.requestHash !== requestHash) {
      return { invoiceNo: rec.invoiceNo, status: "rejected", problems: [{ code: "INVOICE_NO_REUSED", message: "This invoice number was already used for a different receipt (RCPT013)." }] };
    }
    if (rec.status !== "ACCEPTED" && rec.status !== "REJECTED") this.kick();
    return this.toResult(rec);
  }

  /** Under the number lock: check, number, sign, save, advance state. The only place numbers are assigned. */
  private async numberAndStore(req: SubmitRequest, requestHash: string): Promise<{ record: ReceiptRecord } | { result: ReceiptResult }> {
    // Another caller may have stored the same invoice while we waited for the lock.
    const dup = await this.receipts.findOne({ tenantId: req.tenantId, invoiceNo: req.invoiceNo });
    if (dup) return { result: await this.existingResult(dup, requestHash) };

    let st = this.dev.getState();
    if (!st) {
      if (!this.opts.autoOpenDay) return { result: this.reject(req, "DAY_NOT_OPEN", "No fiscal day is open on this device.") };
      await this.openDayLocked();
      st = this.dev.getState();
      if (!st) return { result: this.reject(req, "DAY_NOT_OPEN", "Could not open the fiscal day.") };
    }
    const wait = this.dayOpenedAt + this.opts.openGapMs - Date.now();
    if (wait > 0) await sleep(wait);

    // Never let receipt dates run too far ahead of the clock (see maxDateDriftMs).
    const busyUntil = Date.now() + this.opts.busyWaitMs;
    for (;;) {
      const prev = this.dev.getState()?.previousReceiptDate;
      const next = Math.max(Date.now(), prev ? parseFdmsDateTime(prev).getTime() + 1000 : 0);
      if (next - Date.now() <= this.opts.maxDateDriftMs) break;
      if (Date.now() >= busyUntil) {
        return { result: this.reject(req, "DEVICE_BUSY", "This device is numbering receipts as fast as ZIMRA allows (one a second). Try again in a moment, or issue a provisional receipt.") };
      }
      await sleep(Math.min(250, Math.max(20, next - Date.now() - this.opts.maxDateDriftMs)));
    }

    const built = await this.buildInput(req);
    if ("problems" in built) return { result: { invoiceNo: req.invoiceNo, status: "rejected", problems: built.problems } };

    let prepared: PreparedReceipt;
    try {
      prepared = await this.dev.signReceipt(built.input);
    } catch (e) {
      return { result: this.reject(req, "SIGN_FAILED", e instanceof Error ? e.message : String(e)) };
    }

    const now = new Date();
    const record: ReceiptRecord = {
      deviceKey: this.deviceKey,
      tenantId: req.tenantId,
      invoiceNo: req.invoiceNo,
      requestHash,
      request: req,
      status: "SIGNED",
      seq: ++this.seq,
      fiscalDayNo: prepared.stateAfter.fiscalDayNo,
      receiptGlobalNo: prepared.receipt.receiptGlobalNo,
      receiptCounter: prepared.receipt.receiptCounter,
      prepared,
      colour: "none",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await this.receipts.insertOne({ ...record });
    } catch (e) {
      this.seq--;
      if ((e as { code?: number }).code === 11000) {
        const again = await this.receipts.findOne({ tenantId: req.tenantId, invoiceNo: req.invoiceNo });
        if (again) return { result: await this.existingResult(again, requestHash) };
      }
      throw e;
    }
    // Saved first, state second: a crash between the two is repaired from the record in init().
    await this.dev.applyPrepared(prepared);
    return { record };
  }

  private async buildInput(req: SubmitRequest): Promise<{ input: ReceiptInput } | { problems: ValidationProblem[] }> {
    let creditDebitNote: ReceiptInput["creditDebitNote"];
    if (req.original) {
      const orig = await this.receipts.findOne({ deviceKey: this.deviceKey, tenantId: req.tenantId, invoiceNo: req.original.invoiceNo });
      if (!orig) return { problems: [{ code: "ORIGINAL_NOT_FOUND", message: `Invoice ${req.original.invoiceNo} was not fiscalised on this device. A credit note must go to the device that signed the original.` }] };
      if (orig.status !== "ACCEPTED") return { problems: [{ code: "ORIGINAL_NOT_DELIVERED", message: `Invoice ${req.original.invoiceNo} has not reached ZIMRA yet. Send the credit note once it has (RCPT032).` }] };
      if (orig.request.currency.toUpperCase() !== req.currency.toUpperCase()) return { problems: [{ code: "CURRENCY_MISMATCH", message: "A credit note must be in the currency of the original (RCPT043)." }] };
      if (Date.now() - orig.createdAt.getTime() > 365 * 86_400_000) return { problems: [{ code: "ORIGINAL_TOO_OLD", message: "The original is more than 12 months old (RCPT033)." }] };
      // Over-crediting (RCPT035): what has been credited already plus this note must not exceed the original.
      const origTotal = orig.prepared ? Math.round(orig.prepared.receipt.receiptTotal * 100) : 0;
      const credited = await this.receipts
        .find({ deviceKey: this.deviceKey, "request.original.invoiceNo": req.original.invoiceNo, status: { $ne: "REJECTED" } })
        .toArray();
      const already = credited.reduce((s, r) => s + Math.abs(Math.round((r.prepared?.receipt.receiptTotal ?? 0) * 100)), 0);
      const thisNote = req.payments.reduce((s, p) => s + Math.abs(Math.round(Number(p.amount) * 100)), 0);
      if ((req.receiptType ?? "FiscalInvoice") === "CreditNote" && already + thisNote > origTotal) {
        return { problems: [{ code: "OVER_CREDIT", message: `Credits would exceed the original (${(origTotal / 100).toFixed(2)}) (RCPT035).` }] };
      }
      creditDebitNote = { deviceID: this.deps.identity.deviceId, receiptGlobalNo: orig.receiptGlobalNo!, fiscalDayNo: orig.fiscalDayNo! };
    }
    return {
      input: {
        receiptType: req.receiptType ?? "FiscalInvoice",
        currency: req.currency,
        invoiceNo: req.invoiceNo,
        linesTaxInclusive: req.taxInclusive ?? true,
        lines: req.lines.map((l) => ({
          name: l.name,
          price: cents(l.unitPrice),
          quantity: Number(l.quantity),
          taxId: l.taxId as number,
          taxPercent: l.taxPercent ?? null,
          taxCode: l.taxCode,
          hsCode: l.hsCode,
        })),
        payments: req.payments.map((p) => ({ moneyType: p.moneyType, amount: cents(p.amount) })),
        buyer: req.buyer as ReceiptInput["buyer"],
        notes: req.notes,
        creditDebitNote,
      },
    };
  }

  // ---------------------------------------------------------------------------------------------------------
  // Results
  // ---------------------------------------------------------------------------------------------------------

  private qrFor(p: PreparedReceipt): { qrData: string; verificationCode: string } {
    const qrData = receiptQrData({
      qrUrl: this.rules.qrUrl,
      deviceId: this.deps.identity.deviceId,
      receiptDate: new Date(p.date),
      receiptGlobalNo: p.receipt.receiptGlobalNo,
      deviceSignatureBase64: p.receipt.receiptDeviceSignature.signature,
    });
    return { qrData, verificationCode: qrData.slice(-16).replace(/(.{4})(?=.)/g, "$1-") };
  }

  toResult(rec: ReceiptRecord): ReceiptResult {
    if (rec.status === "REJECTED") return { invoiceNo: rec.invoiceNo, status: "rejected", problems: rec.problems };
    const p = rec.prepared!;
    const base: ReceiptResult = {
      invoiceNo: rec.invoiceNo,
      status: rec.status === "ACCEPTED" ? "fiscalised" : "queued",
      receiptGlobalNo: p.receipt.receiptGlobalNo,
      receiptCounter: p.receipt.receiptCounter,
      fiscalDayNo: rec.fiscalDayNo,
      deviceId: this.deps.identity.deviceId,
      deviceSerialNumber: this.deps.identity.serialNumber,
      receiptDate: p.receipt.receiptDate,
      ...this.qrFor(p),
    };
    if (rec.status === "ACCEPTED") {
      return { ...base, receiptId: rec.response?.receiptID, colour: rec.colour, validationErrors: rec.response?.validationErrors };
    }
    return { ...base, reason: rec.lastError ?? "Waiting to be sent to ZIMRA" };
  }

  async getReceipt(tenantId: string, invoiceNo: string): Promise<ReceiptResult | null> {
    const rec = await this.receipts.findOne({ tenantId, invoiceNo });
    return rec ? this.toResult(rec) : null;
  }

  // ---------------------------------------------------------------------------------------------------------
  // Sending (one at a time, in number order)
  // ---------------------------------------------------------------------------------------------------------

  /** Ask the sender to run. Never overlaps itself. */
  kick(): void {
    if (this.sendingNow) {
      this.sendAgain = true;
      return;
    }
    this.sendingNow = this.sendLoop()
      .catch((e) => this.note(e))
      .finally(() => {
        this.sendingNow = undefined;
        if (this.sendAgain) {
          this.sendAgain = false;
          this.kick();
        }
      });
  }

  /** Resolves when the sender has nothing left it is allowed to send right now. */
  async idle(): Promise<void> {
    while (this.sendingNow) await this.sendingNow;
  }

  /** Run the sender again at `at` (replacing any earlier wake-up that is later). */
  private wakeAt(at: number): void {
    if (this.wake) clearTimeout(this.wake);
    this.wake = setTimeout(() => {
      this.wake = undefined;
      this.kick();
    }, Math.max(0, at - Date.now()) + 5);
    this.wake.unref();
  }

  /** Send everything due, in order. Returns when the queue is empty, blocked or backing off. */
  private async sendLoop(): Promise<void> {
    for (;;) {
      if (this.paused || !this.haveLease) return;
      const rec = await this.receipts
        .find({ deviceKey: this.deviceKey, status: { $in: ["SIGNED", "SENT"] } })
        .sort({ seq: 1 })
        .limit(1)
        .next();
      if (!rec) return;
      if (rec.nextAttemptAt && rec.nextAttemptAt.getTime() > Date.now()) {
        this.wakeAt(rec.nextAttemptAt.getTime()); // strict order: wait for the head, then try again by ourselves
        return;
      }
      if (!(await this.sendOne(rec))) return;
    }
  }

  /** Returns true when the loop may carry on with the next receipt. */
  private async sendOne(rec: ReceiptRecord): Promise<boolean> {
    const id = (rec as unknown as { _id: unknown })._id;
    const where = { _id: id } as never;
    await this.receipts.updateOne(where, { $set: { status: "SENT", updatedAt: new Date() }, $inc: { attempts: 1 } });
    const attempts = rec.attempts + 1;
    try {
      const res = await this.dev.send(rec.prepared!);
      const errors = (res.validationErrors ?? []).map((e) => ({ code: e.validationErrorCode ?? "?", colour: e.validationErrorColor ?? "?", description: e.validationErrorDescription }));
      const colour = colourOf(errors);
      await this.receipts.updateOne(where, {
        $set: { status: "ACCEPTED", colour, response: { receiptID: res.receiptID, serverDate: res.serverDate, validationErrors: errors }, updatedAt: new Date() },
        $unset: { nextAttemptAt: "", lastError: "" },
      });
      this.lastError = undefined;
      if (colour === "red" || colour === "gray") {
        await this.raise(colour === "red" ? "RED_RECEIPT" : "GRAY_RECEIPT", `ZIMRA flagged invoice ${rec.invoiceNo} ${colour.toUpperCase()}: ${errors.map((e) => e.code).join(", ")}. The fiscal day can no longer be closed by this service.`, {
          invoiceNo: rec.invoiceNo,
          errors,
        });
        if (colour === "gray") {
          await this.setPaused(`Receipt ${rec.invoiceNo} broke the receipt chain (${errors.map((e) => e.code).join(", ")}). Sending is stopped so it does not get worse.`);
          return false;
        }
        if (this.opts.onRed === "pause") {
          await this.setPaused(`Receipt ${rec.invoiceNo} was flagged Red (${errors.map((e) => e.code).join(", ")}).`);
          return false;
        }
      }
      return true;
    } catch (e) {
      return this.afterFailure(rec, attempts, e);
    }
  }

  private async afterFailure(rec: ReceiptRecord, attempts: number, e: unknown): Promise<boolean> {
    const where = { _id: (rec as unknown as { _id: unknown })._id } as never;
    const message = e instanceof Error ? e.message : String(e);
    this.note(e);
    const backoff = () => new Date(Date.now() + Math.min(this.opts.retryBaseMs * 2 ** (attempts - 1), this.opts.retryMaxMs));

    if (e instanceof FdmsApiError) {
      const code = e.problem?.errorCode ?? e.problem?.title ?? "";
      if (e.status === 401 || e.status === 403) {
        await this.receipts.updateOne(where, { $set: { status: "SIGNED", lastError: message, updatedAt: new Date() } });
        await this.setPaused("ZIMRA rejected this device's certificate (HTTP " + e.status + "). Upload a valid certificate and resume.");
        await this.raise("CERT_REJECTED", `ZIMRA refused the certificate for device ${this.deps.identity.deviceId}.`, { status: e.status });
        return false;
      }
      if (/^RCPT0[12]$/.test(code) || /day.*(closed|not open)/i.test(message)) {
        // The day is closed or closing: the receipt is fine, it just cannot go in yet.
        await this.receipts.updateOne(where, { $set: { status: "SIGNED", lastError: message, nextAttemptAt: backoff(), updatedAt: new Date() } });
        return false;
      }
      if (e.status >= 500 || e.status === 429 || e.status === 408) {
        await this.receipts.updateOne(where, { $set: { status: "SENT", lastError: message, nextAttemptAt: backoff(), updatedAt: new Date() } });
        return false;
      }
      // ZIMRA refused it before storing it. It holds no number there, so ours must be given up and the unsent
      // receipts behind it renumbered, otherwise they would all be flagged Gray.
      await this.dropAndRenumber(rec, [{ code: code || `HTTP${e.status}`, message }]);
      return true;
    }
    // Network failure or timeout: the receipt may or may not have arrived. It stays as it is and goes again,
    // identical; ZIMRA answers a repeat of the same number and hash with the original receipt.
    await this.receipts.updateOne(where, { $set: { status: "SENT", lastError: message, nextAttemptAt: backoff(), updatedAt: new Date() } });
    return false;
  }

  /** Give up a receipt ZIMRA refused, and renumber the unsent ones after it. Runs under the number lock. */
  private async dropAndRenumber(rec: ReceiptRecord, problems: ValidationProblem[]): Promise<void> {
    await this.numberLock.run(async () => {
      const where = { _id: (rec as unknown as { _id: unknown })._id } as never;
      await this.receipts.updateOne(where, { $set: { status: "REJECTED", problems, updatedAt: new Date() }, $unset: { nextAttemptAt: "" } });
      await this.raise("RECEIPT_REFUSED", `ZIMRA refused invoice ${rec.invoiceNo} (${problems[0]?.code}). It was not fiscalised.`, { invoiceNo: rec.invoiceNo, problems });

      const dayNo = rec.fiscalDayNo!;
      const later = await this.receipts
        .find({ deviceKey: this.deviceKey, fiscalDayNo: dayNo, seq: { $gt: rec.seq }, status: "SIGNED" })
        .sort({ seq: 1 })
        .toArray();
      // Only the receipts BEFORE the refused one count: the later ones are about to be numbered again.
      const rebuilt = await this.rebuildState(dayNo, rec.prepared!.stateAfter, rec.receiptGlobalNo! - rec.receiptCounter!, rec.seq);
      await this.dev.replaceState(rebuilt);
      for (const l of later) {
        const built = await this.buildInput(l.request);
        if ("problems" in built) {
          await this.receipts.updateOne({ _id: (l as unknown as { _id: unknown })._id } as never, { $set: { status: "REJECTED", problems: built.problems, updatedAt: new Date() } });
          continue;
        }
        // Keep each receipt's own date so the order stays strictly increasing.
        built.input.receiptDate = new Date(l.prepared!.date);
        const prepared = await this.dev.signReceipt(built.input);
        await this.receipts.updateOne({ _id: (l as unknown as { _id: unknown })._id } as never, {
          $set: { prepared, receiptGlobalNo: prepared.receipt.receiptGlobalNo, receiptCounter: prepared.receipt.receiptCounter, updatedAt: new Date() },
        });
        await this.dev.applyPrepared(prepared);
      }
    });
  }

  /**
   * The day state implied by the stored receipts of one fiscal day (not REJECTED ones), in global number order.
   * `fallback` supplies the day number/date when no receipt remains; `baseGlobal` is the global number before
   * the day's first receipt.
   */
  async rebuildState(fiscalDayNo: number, fallback: FiscalDayState, baseGlobal: number, beforeSeq?: number): Promise<FiscalDayState> {
    const recs = await this.receipts
      .find({ deviceKey: this.deviceKey, fiscalDayNo, status: { $ne: "REJECTED" }, prepared: { $exists: true }, ...(beforeSeq !== undefined ? { seq: { $lt: beforeSeq } } : {}) })
      .sort({ receiptGlobalNo: 1 })
      .toArray();
    const counters: FiscalDayState["counters"] = [];
    for (const r of recs) accumulateCounters(counters, r.prepared!.receipt);
    const last = recs[recs.length - 1];
    return {
      fiscalDayNo,
      fiscalDayDate: fallback.fiscalDayDate,
      receiptCounter: recs.length,
      receiptGlobalNo: last ? last.prepared!.receipt.receiptGlobalNo : baseGlobal,
      previousReceiptHash: last?.prepared!.receipt.receiptDeviceSignature.hash,
      previousReceiptDate: last?.prepared!.receipt.receiptDate,
      counters,
    };
  }

  /** Check the day's records against ZIMRA's own count; returns problems, empty when consistent. */
  async verifyAgainstServer(): Promise<string[]> {
    const st = this.dev.getState();
    if (!st) return ["No fiscal day is open locally"];
    const status = await this.dev.getStatus();
    const problems: string[] = [];
    const accepted = await this.receipts.find({ deviceKey: this.deviceKey, fiscalDayNo: st.fiscalDayNo, status: "ACCEPTED" }).sort({ receiptGlobalNo: -1 }).limit(1).next();
    const ours = accepted?.receiptGlobalNo ?? 0;
    if ((status.lastReceiptGlobalNo ?? 0) !== ours && !(ours === 0 && (status.lastReceiptGlobalNo ?? 0) === st.receiptGlobalNo)) {
      problems.push(`ZIMRA's last receipt number is ${status.lastReceiptGlobalNo ?? 0}, ours is ${ours}`);
    }
    return problems;
  }

  // ---------------------------------------------------------------------------------------------------------
  // Fiscal day
  // ---------------------------------------------------------------------------------------------------------

  async openDay(): Promise<{ fiscalDayNo: number; adopted: boolean }> {
    return this.numberLock.run(() => this.openDayLocked());
  }

  private async openDayLocked(): Promise<{ fiscalDayNo: number; adopted: boolean }> {
    await this.refreshConfig();
    const status = await this.dev.getStatus();
    if (status.fiscalDayStatus !== "FiscalDayClosed") {
      // Already open on ZIMRA's side. Adopt it only if we hold its full history, otherwise our counters are unknowable.
      const st = this.dev.getState();
      if (st && st.fiscalDayNo === status.lastFiscalDayNo) return { fiscalDayNo: st.fiscalDayNo, adopted: true };
      await this.raise("DAY_STATE_UNKNOWN", `Device ${this.deps.identity.deviceId} has a fiscal day (${status.fiscalDayStatus}) this service did not open, so its receipt counters are unknown.`, { status: status.fiscalDayStatus, code: status.fiscalDayClosingErrorCode });
      throw new Error(`The device's fiscal day is ${status.fiscalDayStatus}${status.fiscalDayClosingErrorCode ? ` (${status.fiscalDayClosingErrorCode})` : ""} and was not opened by this service; it cannot be used safely.`);
    }
    const res = await this.dev.openDay();
    this.dayOpenedAt = Date.now();
    await this.control.updateOne({ _id: this.deviceKey }, { $set: { dayOpenedAt: this.dayOpenedAt } }, { upsert: true });
    await this.days.updateOne({ deviceKey: this.deviceKey, fiscalDayNo: res.fiscalDayNo }, { $setOnInsert: { deviceKey: this.deviceKey, fiscalDayNo: res.fiscalDayNo, openedAt: new Date(), status: "open" } }, { upsert: true });
    return { fiscalDayNo: res.fiscalDayNo, adopted: false };
  }

  /**
   * Close the fiscal day safely. Never closes while anything could still change the counters:
   *  1. stop accepting receipts (new ones are told the day is closing), wait for the one being numbered;
   *  2. deliver every queued receipt, in order; if any cannot be delivered, do not close;
   *  3. refuse when ZIMRA flagged any receipt Red or Gray (it would refuse the close, and retrying cannot help);
   *  4. check ZIMRA's last receipt number equals ours;
   *  5. send CloseDay and WAIT for the answer. On a failure act on the code: CountersMismatch (rebuild the
   *     counters from our own records and compare), BadCertificateSignature, MissingReceipts (resend), and give up
   *     on anything that retrying cannot fix.
   */
  /** Never throws: a flaky ZIMRA during a close is a "try again" answer, not a crash. The day is left as it was. */
  async closeDay(): Promise<CloseOutcome> {
    try {
      return await this.closeDayGuarded();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, reason: "GATEWAY_ERROR", message: `ZIMRA could not be reached or answered badly during the close: ${message}`, permanent: false, attempts: 0 };
    }
  }

  private async closeDayGuarded(): Promise<CloseOutcome> {
    if (this.closing) return { ok: false, reason: "ALREADY_CLOSING", message: "A close is already running for this device.", permanent: false, attempts: 0 };
    this.closing = true;
    let attempts = 0;
    let closedOk = false;
    try {
      await this.numberLock.run(async () => undefined); // let a receipt being numbered finish
      const st0 = this.dev.getState();
      if (!st0) return { ok: false, reason: "NO_OPEN_DAY", message: "No fiscal day is open locally.", permanent: false, attempts };
      const dayNo = st0.fiscalDayNo;

      // 2. deliver everything
      const deadline = Date.now() + this.opts.drainTimeoutMs;
      for (;;) {
        this.kick();
        await this.idle();
        const left = await this.receipts.countDocuments({ deviceKey: this.deviceKey, fiscalDayNo: dayNo, status: { $in: ["SIGNED", "SENT"] } });
        if (left === 0) break;
        if (Date.now() > deadline) return { ok: false, reason: "UNSENT", message: `${left} receipt(s) could not be delivered to ZIMRA. The day was not closed.`, permanent: false, attempts };
        if (this.paused) return { ok: false, reason: "PAUSED", message: `Sending is paused: ${this.paused}`, permanent: true, attempts };
        await sleep(100);
      }

      // 3. flagged receipts
      const bad = await this.receipts.countDocuments({ deviceKey: this.deviceKey, fiscalDayNo: dayNo, colour: { $in: ["red", "gray"] } });
      if (bad > 0) {
        await this.raise("CLOSE_BLOCKED", `Day ${dayNo} holds ${bad} receipt(s) ZIMRA flagged Red or Gray. It cannot be closed by this service; ZIMRA must close it.`, { dayNo, bad });
        return { ok: false, reason: "RED_RECEIPTS", message: `${bad} receipt(s) were flagged by ZIMRA. Only ZIMRA can close this day.`, permanent: true, attempts };
      }

      // 4. agree with ZIMRA
      const mismatch = await this.verifyAgainstServer();
      if (mismatch.length) return { ok: false, reason: "SERVER_MISMATCH", message: mismatch.join("; "), permanent: false, attempts };

      // 5. close, wait, and act on the answer
      let lastCode: string | undefined;
      for (attempts = 1; attempts <= this.opts.maxCloseAttempts; attempts++) {
        // The core forgets the day in memory once a close is sent, but keeps the saved copy for a retry.
        await this.restoreSavedDay();
        try {
          await this.dev.closeDay({ force: true });
        } catch (e) {
          if (e instanceof FdmsApiError) {
            const msg = e.message;
            await this.raise("CLOSE_REFUSED", `ZIMRA refused the close request for day ${dayNo}: ${msg}`, { dayNo });
            return { ok: false, reason: "CLOSE_REFUSED", message: msg, permanent: /validation/i.test(msg), attempts };
          }
          return { ok: false, reason: "CLOSE_UNREACHABLE", message: e instanceof Error ? e.message : String(e), permanent: false, attempts };
        }
        const settled = await this.waitForClose();
        if (settled.fiscalDayStatus === "FiscalDayClosed") {
          const totals = await this.finishDay(dayNo, attempts);
          closedOk = true;
          return { ok: true, fiscalDayNo: dayNo, attempts, totals };
        }
        if (settled.fiscalDayStatus === "FiscalDayCloseInitiated") {
          return { ok: false, reason: "STILL_CLOSING", message: "ZIMRA is still processing the close. Check again shortly; it will not be sent twice.", permanent: false, attempts };
        }
        lastCode = settled.fiscalDayClosingErrorCode ?? undefined;
        await this.raise("CLOSE_FAILED", `ZIMRA could not close day ${dayNo}: ${lastCode ?? "unknown reason"} (attempt ${attempts}).`, { dayNo, lastCode, attempts });
        if (lastCode === "ReceiptsWithValidationErrors") return { ok: false, reason: "RED_RECEIPTS", message: "ZIMRA reports receipts with validation errors.", permanent: true, errorCode: lastCode, attempts };
        await this.recoverClose(dayNo, lastCode);
      }
      return { ok: false, reason: "CLOSE_FAILED", message: `ZIMRA still refuses to close the day (${lastCode ?? "unknown"}).`, permanent: false, errorCode: lastCode, attempts: attempts - 1 };
    } finally {
      // A close that did not complete leaves the day open on ZIMRA's side: selling must carry on.
      if (!closedOk) await this.restoreSavedDay().catch(() => undefined);
      this.closing = false;
      this.kick();
    }
  }

  /** Bring the saved day state back into memory (after a close attempt dropped it). */
  private async restoreSavedDay(): Promise<void> {
    if (this.dev.getState()) return;
    const saved = await this.persistedState();
    if (saved) this.dev.restoreState(saved);
  }

  private async waitForClose(): Promise<GetStatusResponse> {
    const deadline = Date.now() + this.opts.closePollTimeoutMs;
    for (;;) {
      await sleep(this.opts.closePollMs);
      const s = await this.dev.getStatus();
      if (s.fiscalDayStatus !== "FiscalDayCloseInitiated" || Date.now() > deadline) return s;
    }
  }

  /** Put right what the failure code says can be put right, before the next close attempt. */
  private async recoverClose(dayNo: number, code: string | undefined): Promise<void> {
    if (code === "CountersMismatch") {
      // Rebuild the day's counters from the receipts ZIMRA accepted and compare with the counters we signed.
      const cur = this.dev.getState() ?? ((await this.persistedState()) as FiscalDayState | undefined);
      const fallback = cur ?? { fiscalDayNo: dayNo, fiscalDayDate: fdmsDateTime(new Date()).slice(0, 10), receiptCounter: 0, receiptGlobalNo: 0, counters: [] };
      const first = await this.receipts.find({ deviceKey: this.deviceKey, fiscalDayNo: dayNo, status: "ACCEPTED" }).sort({ receiptGlobalNo: 1 }).limit(1).next();
      const base = first ? first.receiptGlobalNo! - 1 : fallback.receiptGlobalNo;
      const rebuilt = await this.rebuildState(dayNo, fallback, base);
      if (JSON.stringify(rebuilt.counters) !== JSON.stringify(fallback.counters) || rebuilt.receiptCounter !== fallback.receiptCounter) {
        await this.raise("COUNTERS_REBUILT", `Day ${dayNo}: the saved counters differed from the receipts; rebuilt from the receipts.`, { dayNo });
        await this.dev.replaceState(rebuilt);
      }
    } else if (code === "MissingReceipts") {
      // Send every receipt of the day again, identical; ZIMRA ignores those it already has.
      const recs = await this.receipts.find({ deviceKey: this.deviceKey, fiscalDayNo: dayNo, status: "ACCEPTED", prepared: { $exists: true } }).sort({ receiptGlobalNo: 1 }).toArray();
      for (const r of recs) await this.dev.send(r.prepared!).catch(() => undefined);
    } else if (code === "BadCertificateSignature") {
      await sleep(this.opts.closePollMs); // nothing of ours to correct; the next attempt signs again
    }
  }

  private async persistedState(): Promise<FiscalDayState | undefined> {
    const raw = await new MongoStorage(this.deps.db.collection("kv"), this.deviceKey).get("day-state");
    return raw ? (JSON.parse(raw) as { state: FiscalDayState }).state : undefined;
  }

  /** The day is closed: write its summary and drop the saved day state. */
  private async finishDay(dayNo: number, attempts: number): Promise<Record<string, { sales: string; credits: string; count: number }>> {
    const recs = await this.receipts.find({ deviceKey: this.deviceKey, fiscalDayNo: dayNo, status: "ACCEPTED" }).toArray();
    const totals: Record<string, { sales: number; credits: number; count: number }> = {};
    for (const r of recs) {
      const cur = r.prepared!.receipt.receiptCurrency;
      const t = (totals[cur] ??= { sales: 0, credits: 0, count: 0 });
      const c = Math.round(r.prepared!.receipt.receiptTotal * 100);
      if (r.prepared!.receipt.receiptType === "CreditNote") t.credits += c;
      else t.sales += c;
      t.count++;
    }
    const out: Record<string, { sales: string; credits: string; count: number }> = {};
    for (const [cur, t] of Object.entries(totals)) out[cur] = { sales: (t.sales / 100).toFixed(2), credits: (t.credits / 100).toFixed(2), count: t.count };
    await this.days.updateOne({ deviceKey: this.deviceKey, fiscalDayNo: dayNo }, { $set: { status: "closed", closedAt: new Date(), totals: out, closeAttempts: attempts } });
    await this.dev.clearPersistedState();
    this.dayOpenedAt = 0;
    await this.control.updateOne({ _id: this.deviceKey }, { $unset: { dayOpenedAt: "" } }, { upsert: true });
    return out;
  }

  // ---------------------------------------------------------------------------------------------------------

  /** The running counters of the open day, as they will be signed at close. Null when no day is open. */
  dayCounters(): { fiscalDayNo: number; fiscalDayDate: string; receiptCounter: number; receiptGlobalNo: number; counters: FiscalDayState["counters"] } | null {
    const st = this.dev.getState();
    if (!st) return null;
    return { fiscalDayNo: st.fiscalDayNo, fiscalDayDate: st.fiscalDayDate, receiptCounter: st.receiptCounter, receiptGlobalNo: st.receiptGlobalNo, counters: JSON.parse(JSON.stringify(st.counters)) };
  }

  async status(): Promise<EngineStatus> {
    const st = this.dev.getState();
    const count = (q: object) => this.receipts.countDocuments({ deviceKey: this.deviceKey, ...q });
    return {
      deviceKey: this.deviceKey,
      deviceId: this.deps.identity.deviceId,
      dayOpen: !!st,
      fiscalDayNo: st?.fiscalDayNo,
      lastGlobalNo: st?.receiptGlobalNo,
      unsent: await count({ status: { $in: ["SIGNED", "SENT"] } }),
      accepted: await count({ status: "ACCEPTED" }),
      red: await count({ colour: "red" }),
      gray: await count({ colour: "gray" }),
      paused: this.paused,
      closing: this.closing,
      dayOpenedAt: st && this.dayOpenedAt ? this.dayOpenedAt : undefined,
      lastError: this.lastError,
    };
  }

  /** Start the background sender: retries due receipts every `everyMs`. Returns a stop function. */
  startBackground(everyMs = 2_000): () => void {
    const t = setInterval(() => this.kick(), everyMs);
    t.unref();
    return () => clearInterval(t);
  }
}
