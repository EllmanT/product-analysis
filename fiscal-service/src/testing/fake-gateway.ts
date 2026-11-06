/**
 * A fake ZIMRA Gateway for tests. Plain HTTP on a local port (the engine is pointed at it with `baseUrl`),
 * one instance serving any number of devices.
 *
 * It enforces what we have seen the real test gateway do, not what we hope it does:
 *  - the receipt device signature is verified against the device's own certificate (RSA or ECDSA);
 *  - receipts are always ACCEPTED and stored, and flagged with a colour: Red blocks closing, Gray (a broken
 *    chain) blocks closing, Yellow does not (RCPT010 signature, RCPT011 counter, RCPT012 global number,
 *    RCPT013 duplicate invoice number, RCPT014 dated before the gateway's own day-open time, RCPT020-021 totals,
 *    RCPT022 sign of credit note lines, RCPT030 date order, RCPT031 future date, RCPT032 credit note original,
 *    RCPT035 over-crediting, RCPT043 currency, RCPT047/048 HS code on a VAT payer);
 *  - the same receipt (device, global number, hash) sent twice returns the original receiptID;
 *  - CloseDay is refused up front while Red or Gray receipts exist, otherwise it settles asynchronously into
 *    FiscalDayClosed or FiscalDayCloseFailed (CountersMismatch, BadCertificateSignature, MissingReceipts);
 *  - GetStatus carries no counters (the real one does not).
 *
 * Fault knobs (outages, latency, lost replies, 5xx bursts) are on `faults` and can be changed while it runs.
 */
import { createPublicKey, createHash, verify as cryptoVerify, X509Certificate, type KeyObject } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { accumulateCounters } from "../core/device.js";
import { fromBase64, utf8Bytes } from "../core/bytes.js";
import { sha256Base64 } from "../core/sha256.js";
import { fdmsDateTime, fiscalDaySigningString, receiptSigningString, toCents } from "../core/signing.js";
import type { FiscalDayCounter, Receipt, ValidationError } from "../core/types.js";

type Colour = "Red" | "Gray" | "Yellow";

export interface FakeTax {
  taxID: number;
  taxName: string;
  taxPercent: number | null;
}

export interface FakeReceipt {
  receipt: Receipt;
  receiptID: number;
  hash: string;
  validationErrors: ValidationError[];
  serverDate: string;
  arrivedAt: number;
}

export interface FakeDay {
  fiscalDayNo: number;
  /** The gateway's own clock when OpenDay was processed (not what the device sent). */
  openedServer: string;
  receipts: FakeReceipt[];
  counters: FiscalDayCounter[];
  closed?: string;
}

export interface FakeDevice {
  deviceId: number;
  serialNumber: string;
  publicKey: KeyObject;
  vatPayer: boolean;
  status: "FiscalDayClosed" | "FiscalDayOpened" | "FiscalDayCloseInitiated" | "FiscalDayCloseFailed";
  closingErrorCode?: string;
  days: FakeDay[];
  nextReceiptId: number;
  /** Every request this device made, for assertions. */
  requests: { method: string; endpoint: string; at: number; outcome: string }[];
}

export interface FakeFaults {
  /** Refuse all connections (destroy the socket) while true: a full ZIMRA/network outage. */
  down: boolean;
  /** Per-device outage: only this device's requests fail (its tills' network). */
  downDevices: Set<number>;
  /** Fixed delay added to every response. */
  delayMs: number;
  /** Random extra delay, 0..jitterMs. */
  jitterMs: number;
  /** Answer the next N requests with HTTP 503. */
  serverErrors: number;
  /** Probability (0..1) that a SubmitReceipt is stored and then the reply is lost. */
  dropReplyRate: number;
  /** Deterministic version of the above: the next N submits are stored and their replies lost. */
  dropRepliesNext: number;
  /** Probability (0..1) that a request is dropped before reaching the gateway (nothing stored). */
  dropRequestRate: number;
  /** Make the next CloseDay settle as this failure, whatever the data says. */
  forceCloseFailure?: "CountersMismatch" | "BadCertificateSignature" | "MissingReceipts";
  /** How many consecutive CloseDay attempts fail that way (default 1). */
  forceCloseFailureTimes: number;
  /** Flag the next N accepted receipts with these errors, as if a rule we do not know about fired. */
  flagNext: { code: string; colour: Colour }[];
  /** Refuse (HTTP 422, nothing stored) any receipt with one of these invoice numbers. */
  rejectInvoiceNos: Set<string>;
  /** Devices whose certificate is "revoked": every request gets HTTP 401. */
  unauthorisedDevices: Set<number>;
  /** Milliseconds a CloseDay takes to settle. */
  closeDelayMs: number;
}

export interface FakeOptions {
  taxes?: FakeTax[];
  qrUrl?: string;
  taxPayerName?: string;
  /** Seeded random source so a failing chaos run can be replayed. */
  random?: () => number;
}

export class FakeGateway {
  readonly devices = new Map<number, FakeDevice>();
  readonly faults: FakeFaults = {
    down: false,
    downDevices: new Set(),
    delayMs: 0,
    jitterMs: 0,
    serverErrors: 0,
    dropReplyRate: 0,
    dropRepliesNext: 0,
    dropRequestRate: 0,
    closeDelayMs: 150,
    forceCloseFailureTimes: 1,
    flagNext: [],
    rejectInvoiceNos: new Set<string>(),
    unauthorisedDevices: new Set<number>(),
  };
  /** Highest number of requests in flight at once, per device: shows whether callers serialised. */
  readonly maxConcurrent = new Map<number, number>();
  private readonly inFlight = new Map<number, number>();
  private server?: Server;
  private readonly taxes: FakeTax[];
  private readonly random: () => number;
  private op = 0;
  url = "";

  constructor(private readonly options: FakeOptions = {}) {
    this.taxes = options.taxes ?? [
      { taxID: 1, taxName: "Exempt", taxPercent: null },
      { taxID: 2, taxName: "Zero rated 0%", taxPercent: 0 },
      { taxID: 514, taxName: "Non-VAT Withholding Tax 5%", taxPercent: 5 },
      { taxID: 517, taxName: "Standard rated 15.5%", taxPercent: 15.5 },
    ];
    this.random = options.random ?? Math.random;
  }

  async start(): Promise<string> {
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((r) => this.server!.listen(0, "127.0.0.1", r));
    const port = (this.server.address() as { port: number }).port;
    this.url = `http://127.0.0.1:${port}`;
    return this.url;
  }

  async stop(): Promise<void> {
    this.server?.closeAllConnections?.();
    await new Promise<void>((r) => (this.server ? this.server.close(() => r()) : r()));
  }

  /** Register a device by its certificate (the public key is what receipts are verified against). */
  addDevice(deviceId: number, serialNumber: string, certificatePem: string, opts: { vatPayer?: boolean } = {}): FakeDevice {
    const d: FakeDevice = {
      deviceId,
      serialNumber,
      publicKey: createPublicKey(new X509Certificate(certificatePem).publicKey.export({ type: "spki", format: "pem" })),
      vatPayer: opts.vatPayer ?? true,
      status: "FiscalDayClosed",
      days: [],
      nextReceiptId: 1,
      requests: [],
    };
    this.devices.set(deviceId, d);
    return d;
  }

  /** All receipts the gateway stored for a device, oldest first. */
  receipts(deviceId: number): FakeReceipt[] {
    return this.devices.get(deviceId)?.days.flatMap((d) => d.receipts) ?? [];
  }

  // ---------------------------------------------------------------------------------------------------------

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://x");
    const parts = url.pathname.split("/").filter(Boolean);
    const deviceId = Number(parts[2]);
    const endpoint = parts[3] ?? "";
    const device = this.devices.get(deviceId);
    const log = (outcome: string) => device?.requests.push({ method: req.method ?? "", endpoint, at: Date.now(), outcome });

    const cur = (this.inFlight.get(deviceId) ?? 0) + 1;
    this.inFlight.set(deviceId, cur);
    this.maxConcurrent.set(deviceId, Math.max(this.maxConcurrent.get(deviceId) ?? 0, cur));
    try {
      let raw = "";
      for await (const c of req) raw += c;

      if (this.faults.down || this.faults.downDevices.has(deviceId) || this.random() < this.faults.dropRequestRate) {
        log("dropped");
        req.socket.destroy();
        return;
      }
      const wait = this.faults.delayMs + this.random() * this.faults.jitterMs;
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));

      const send = (status: number, body: unknown) => {
        log(`${status}`);
        res.writeHead(status, { "Content-Type": "application/json", Date: new Date().toUTCString(), operationID: `FAKE${++this.op}` });
        res.end(body === undefined ? "" : JSON.stringify(body));
      };
      if (this.faults.serverErrors > 0) {
        this.faults.serverErrors--;
        return send(503, { title: "Service Unavailable", status: 503 });
      }
      if (!device || this.faults.unauthorisedDevices.has(deviceId)) return send(401, { title: "Unauthorized", status: 401 });

      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      switch (`${req.method} ${endpoint}`) {
        case "GET GetConfig":
          return send(200, this.getConfig(device));
        case "GET GetStatus":
          return send(200, this.getStatus(device));
        case "POST Ping":
          return send(200, { reportingFrequency: 5 });
        case "POST OpenDay":
          return this.openDay(device, body, send);
        case "POST SubmitReceipt": {
          if (this.faults.rejectInvoiceNos.has((body["receipt"] as Receipt).invoiceNo)) {
            return send(422, { title: "FISC01", errorCode: "FISC01", status: 422, detail: "The receipt structure is not valid" });
          }
          const out = this.submit(device, body["receipt"] as Receipt);
          if (this.faults.dropRepliesNext > 0 || this.random() < this.faults.dropReplyRate) {
            if (this.faults.dropRepliesNext > 0) this.faults.dropRepliesNext--;
            log("stored-reply-lost");
            req.socket.destroy();
            return;
          }
          return send(out.status, out.body);
        }
        case "POST CloseDay":
          return this.closeDay(device, body, send);
        default:
          return send(404, { title: "NotFound", status: 404 });
      }
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ title: "Internal", detail: e instanceof Error ? e.message : String(e) }));
    } finally {
      this.inFlight.set(deviceId, (this.inFlight.get(deviceId) ?? 1) - 1);
    }
  }

  private getConfig(d: FakeDevice) {
    return {
      taxPayerName: this.options.taxPayerName ?? "FAKE TAXPAYER",
      taxPayerTIN: "2000000000",
      vatNumber: d.vatPayer ? "220000000" : "",
      deviceSerialNo: d.serialNumber,
      deviceOperatingMode: "Online",
      taxPayerDayMaxHrs: 24,
      taxpayerDayEndNotificationHrs: 2,
      applicableTaxes: this.taxes.map((t) => ({ ...t, validFrom: "2023-01-01T00:00:00" })),
      certificateValidTill: new Date(Date.now() + 180 * 86_400_000).toISOString(),
      qrUrl: this.options.qrUrl ?? "https://fdmstest.zimra.co.zw",
    };
  }

  private getStatus(d: FakeDevice) {
    const all = d.days.flatMap((x) => x.receipts);
    const last = d.days[d.days.length - 1];
    return {
      fiscalDayStatus: d.status,
      fiscalDayReconciliationMode: "Auto",
      fiscalDayClosed: last?.closed,
      // The real gateway sends no day counters while a day is open or failed.
      lastReceiptGlobalNo: all.length ? Math.max(...all.map((r) => r.receipt.receiptGlobalNo)) : 0,
      lastFiscalDayNo: last?.fiscalDayNo ?? 0,
      ...(d.closingErrorCode ? { fiscalDayClosingErrorCode: d.closingErrorCode } : {}),
    };
  }

  private openDay(d: FakeDevice, body: Record<string, unknown>, send: (s: number, b: unknown) => void) {
    if (d.status !== "FiscalDayClosed") return send(422, { title: "FISC02", errorCode: "FISC02", status: 422, detail: "Fiscal day already opened" });
    const no = (d.days[d.days.length - 1]?.fiscalDayNo ?? 0) + 1;
    if (body["fiscalDayNo"] != null && body["fiscalDayNo"] !== no) return send(422, { title: "FISC04", errorCode: "FISC04", status: 422, detail: `Fiscal day number must be ${no}` });
    d.days.push({ fiscalDayNo: no, openedServer: fdmsDateTime(new Date()), receipts: [], counters: [] });
    d.status = "FiscalDayOpened";
    d.closingErrorCode = undefined;
    return send(200, { fiscalDayNo: no });
  }

  private submit(d: FakeDevice, r: Receipt): { status: number; body: unknown } {
    if (d.status !== "FiscalDayOpened" && d.status !== "FiscalDayCloseFailed") {
      return { status: 422, body: { title: d.status === "FiscalDayCloseInitiated" ? "RCPT02" : "RCPT01", errorCode: d.status === "FiscalDayCloseInitiated" ? "RCPT02" : "RCPT01", status: 422, detail: "Fiscal day is not open" } };
    }
    const day = d.days[d.days.length - 1]!;
    const all = d.days.flatMap((x) => x.receipts);

    // Idempotent resend: same global number and same hash returns the stored result.
    const sameNo = all.find((x) => x.receipt.receiptGlobalNo === r.receiptGlobalNo && x.hash === r.receiptDeviceSignature?.hash);
    if (sameNo) return { status: 200, body: this.reply(sameNo) };

    const errors: ValidationError[] = [];
    const err = (code: string, colour: Colour, text: string) =>
      errors.push({ validationErrorCode: code, validationErrorColor: colour, validationErrorDescription: text });

    const prev = day.receipts[day.receipts.length - 1];
    if (r.receiptCounter !== day.receipts.length + 1) err("RCPT011", "Gray", "Receipt counter is not sequential");
    const highest = all.length ? Math.max(...all.map((x) => x.receipt.receiptGlobalNo)) : 0;
    if (r.receiptGlobalNo !== highest + 1) err("RCPT012", "Gray", "Receipt global number is not sequential");
    if (prev && r.receiptDate <= prev.receipt.receiptDate) err("RCPT030", "Gray", "Receipt date is not later than the previous receipt");
    if (r.receiptDate < day.openedServer) err("RCPT014", "Yellow", "Receipt date is earlier than fiscal day opening date");
    if (r.receiptDate > fdmsDateTime(new Date(Date.now() + 5 * 60_000))) err("RCPT031", "Yellow", "Receipt date is in the future");

    // Signature over the canonical string, using the device's own certificate.
    const canonical = receiptSigningString(d.deviceId, r, prev?.receipt.receiptDeviceSignature.hash);
    let ok = r.receiptDeviceSignature?.hash === sha256Base64(canonical);
    if (ok) {
      try {
        const isRsa = d.publicKey.asymmetricKeyType === "rsa";
        ok = cryptoVerify("sha256", utf8Bytes(canonical), isRsa ? d.publicKey : { key: d.publicKey, dsaEncoding: "der" }, fromBase64(r.receiptDeviceSignature.signature));
      } catch {
        ok = false;
      }
    }
    if (!ok) err("RCPT010", "Red", "Receipt device signature is not valid");

    if (all.some((x) => x.receipt.invoiceNo === r.invoiceNo)) err("RCPT013", "Red", "Invoice number is not unique");

    const linesTotal = r.receiptLines.reduce((s, l) => s + toCents(l.receiptLineTotal), 0);
    const taxTotal = r.receiptTaxes.reduce((s, t) => s + toCents(t.taxAmount), 0);
    if (toCents(r.receiptTotal) !== (r.receiptLinesTaxInclusive ? linesTotal : linesTotal + taxTotal)) err("RCPT020", "Red", "Receipt total does not match the lines");
    if (r.receiptPayments.reduce((s, p) => s + toCents(p.paymentAmount), 0) !== toCents(r.receiptTotal)) err("RCPT021", "Red", "Payments do not equal the receipt total");

    const credit = r.receiptType === "CreditNote";
    if (credit && r.receiptLines.some((l) => toCents(l.receiptLineTotal) > 0)) err("RCPT022", "Red", "Credit note lines must be negative");
    if (!credit && r.receiptLines.some((l) => toCents(l.receiptLineTotal) < 0)) err("RCPT022", "Red", "Invoice lines must not be negative");

    for (const l of r.receiptLines) {
      const t = this.taxes.find((x) => x.taxID === l.taxID);
      if (!t) err("RCPT019", "Red", `Tax ${l.taxID} is not applicable`);
      if (d.vatPayer) {
        if (!l.receiptLineHSCode) err("RCPT047", "Red", "Missing Receipt line HS Code for VAT payer receipt.");
        else if (!/^\d{8}$/.test(l.receiptLineHSCode)) err("RCPT048", "Red", "Receipt line HS Code incorrect length.");
      }
    }

    if (credit) {
      const ref = r.creditDebitNote;
      const orig = ref ? all.find((x) => x.receipt.receiptGlobalNo === ref.receiptGlobalNo && x.receipt.receiptType === "FiscalInvoice") : undefined;
      if (!orig) err("RCPT032", "Red", "Credited receipt does not exist");
      else {
        if (orig.receipt.receiptCurrency !== r.receiptCurrency) err("RCPT043", "Red", "Credit note currency differs from the original");
        const credited = all
          .filter((x) => x.receipt.receiptType === "CreditNote" && x.receipt.creditDebitNote?.receiptGlobalNo === orig.receipt.receiptGlobalNo)
          .reduce((s, x) => s + toCents(x.receipt.receiptTotal), 0);
        if (toCents(orig.receipt.receiptTotal) + credited + toCents(r.receiptTotal) < 0) err("RCPT035", "Red", "Credit exceeds the original receipt");
      }
    }

    const injected = this.faults.flagNext.shift();
    if (injected) err(injected.code, injected.colour, "Injected by the test");

    // Accepted whatever the colour.
    const serverDate = fdmsDateTime(new Date());
    const stored: FakeReceipt = { receipt: r, receiptID: d.nextReceiptId++, hash: r.receiptDeviceSignature?.hash ?? "", validationErrors: errors, serverDate, arrivedAt: Date.now() };
    day.receipts.push(stored);
    accumulateCounters(day.counters, r);
    return { status: 200, body: this.reply(stored) };
  }

  private reply(s: FakeReceipt) {
    return {
      receiptID: s.receiptID,
      serverDate: s.serverDate,
      receiptServerSignature: { hash: createHash("sha256").update(String(s.receiptID)).digest("base64"), signature: "RkFLRQ==" },
      validationErrors: s.validationErrors,
    };
  }

  private closeDay(d: FakeDevice, body: Record<string, unknown>, send: (s: number, b: unknown) => void) {
    if (d.status !== "FiscalDayOpened" && d.status !== "FiscalDayCloseFailed") return send(422, { title: "FISC03", errorCode: "FISC03", status: 422, detail: "Fiscal day cannot be closed in this state" });
    const day = d.days[d.days.length - 1]!;
    if (body["fiscalDayNo"] !== day.fiscalDayNo) return send(422, { title: "FISC04", errorCode: "FISC04", status: 422, detail: "Wrong fiscal day number" });
    const bad = (c: Colour) => day.receipts.some((r) => r.validationErrors.some((e) => e.validationErrorColor === c));
    // The real gateway refuses the request outright while Red or Gray receipts exist; the day stays as it was.
    if (bad("Red") || bad("Gray")) return send(422, { title: "FISC05", errorCode: "FISC05", status: 422, detail: "The fiscal day has receipts with validation errors" });

    d.status = "FiscalDayCloseInitiated";
    d.closingErrorCode = undefined;
    const sent = body["fiscalDayCounters"] as FiscalDayCounter[];
    const canonical = fiscalDaySigningString(d.deviceId, day.fiscalDayNo, day.openedServer.slice(0, 10), sent);
    const sig = body["fiscalDayDeviceSignature"] as { hash: string; signature: string } | undefined;
    let sigOk = sig?.hash === sha256Base64(canonical);
    if (sigOk) {
      try {
        const isRsa = d.publicKey.asymmetricKeyType === "rsa";
        sigOk = cryptoVerify("sha256", utf8Bytes(canonical), isRsa ? d.publicKey : { key: d.publicKey, dsaEncoding: "der" }, fromBase64(sig!.signature));
      } catch {
        sigOk = false;
      }
    }
    const serverCanonical = fiscalDaySigningString(d.deviceId, day.fiscalDayNo, day.openedServer.slice(0, 10), day.counters);
    const countersOk = sha256Base64(canonical) === sha256Base64(serverCanonical) && body["receiptCounter"] === day.receipts.length;

    const forced = this.faults.forceCloseFailure;
    if (forced && --this.faults.forceCloseFailureTimes <= 0) {
      this.faults.forceCloseFailure = undefined;
      this.faults.forceCloseFailureTimes = 1;
    }
    setTimeout(() => {
      const code = forced ?? (!sigOk ? "BadCertificateSignature" : !countersOk ? "CountersMismatch" : undefined);
      if (code) {
        d.status = "FiscalDayCloseFailed";
        d.closingErrorCode = code;
      } else {
        d.status = "FiscalDayClosed";
        day.closed = fdmsDateTime(new Date());
      }
    }, this.faults.closeDelayMs).unref();
    return send(200, {});
  }
}
