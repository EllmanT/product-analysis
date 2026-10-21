import type { Model } from "mongoose";

import FiscalDevice from "@/database/fiscalDevice.model";
import FiscalSettings from "@/database/fiscalSettings.model";
import { certMatchesKey, parseCertPem } from "@/lib/fiscalCertInfo";
import { generateCsr, parseDeviceCommonName } from "@/lib/fiscalCsr";
import logger from "@/lib/logger";
import dbConnect from "@/lib/mongoose";
import { decryptSecret, encryptSecret, isEncryptionConfigured } from "@/lib/security/secretBox";
import { sendFiscalAlertOnce } from "@/lib/services/fiscalAlerts.service";
import {
  CENTRAL_SCOPE,
  applyPem,
  deviceScope,
  hasCertificate,
  secretCtx,
  tlsFromHolder,
  type CertHolder,
} from "@/lib/services/fiscalCertStore";
import { getCertExpiryReports } from "@/lib/services/fiscalCertExpiry.service";
import { CENTRAL_KEY } from "@/lib/services/fiscalDevice.service";
import { getFiscalSettingsDoc, recordCertEvent, type CertActor } from "@/lib/services/fiscalSettings.service";
import { gatewayBase, gatewayCall, gatewayModel, gatewayProblem } from "@/lib/zimraGateway";

/** A renewal could not be completed. The message is safe to show to an administrator. */
export class RenewalError extends Error {}

/** ZIMRA recommends renewing a month before expiry. */
export const AUTO_RENEW_DAYS = 30;
/** A renewal that crashed mid-way must not block the next attempt forever. */
const LOCK_TTL_MS = 10 * 60_000;

type RenewalDoc = CertHolder & {
  _id: unknown;
  deviceId?: string;
  deviceSerialNumber?: string;
  zimraUseProductionUrl?: boolean;
  deviceModelName?: string;
  deviceModelVersion?: string;
  autoRenewCertificate?: boolean;
  lastRenewalAt?: Date;
  lastRenewalAttemptAt?: Date;
  lastRenewalError?: string;
  save(): Promise<unknown>;
};

interface Target {
  key: string;
  name: string;
  scope: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: Model<any>;
  id: unknown;
}

async function loadTarget(key: string): Promise<Target> {
  await dbConnect();
  if (key === CENTRAL_KEY) {
    const doc = await getFiscalSettingsDoc();
    return { key, name: "Central device", scope: CENTRAL_SCOPE, model: FiscalSettings, id: doc._id };
  }
  const doc = await FiscalDevice.findById(key).select("name");
  if (!doc) throw new RenewalError("Fiscal device not found");
  return { key, name: doc.name, scope: deviceScope(key), model: FiscalDevice, id: doc._id };
}

const loadDoc = async (t: Target): Promise<RenewalDoc> => (await t.model.findById(t.id)) as RenewalDoc;

async function acquireLock(t: Target): Promise<void> {
  const stale = new Date(Date.now() - LOCK_TTL_MS);
  const got = await t.model.findOneAndUpdate(
    { _id: t.id, $or: [{ renewalLockedAt: { $exists: false } }, { renewalLockedAt: null }, { renewalLockedAt: { $lt: stale } }] },
    { $set: { renewalLockedAt: new Date() } }
  );
  // Two overlapping renewals could each ask ZIMRA for a certificate and invalidate the other's.
  if (!got) throw new RenewalError("A renewal for this device is already running");
}

const releaseLock = (t: Target) => t.model.updateOne({ _id: t.id }, { $unset: { renewalLockedAt: "" } });

export interface RenewalResult {
  key: string;
  name: string;
  oldNotAfter: Date | null;
  newNotAfter: Date;
  /** True when a certificate ZIMRA had already issued earlier was verified and installed (no new request). */
  resumed: boolean;
}

/**
 * Ask ZIMRA for a new certificate and install it without downtime.
 *
 * ZIMRA revokes the OLD certificate as soon as it issues the new one (verified on the test gateway:
 * the old pair gets HTTP 401 immediately). Anything else holding the old copy stops working, so
 * callers must only renew when this app is the certificate's only holder, or can hand the new one on.
 *
 *  1. New key + CSR; the key is stored encrypted BEFORE anything is sent, so a certificate that ZIMRA
 *     issues can never be lost to a crash.
 *  2. IssueCertificate over mTLS with the CURRENT certificate (no activation key needed).
 *  3. The reply is checked: right device, matches our key, and valid for longer than the old one.
 *  4. The new certificate is tested against ZIMRA (GetConfig over mTLS) while the old one is still
 *     the active one. Only then is it swapped in. A failure leaves the old certificate in place.
 *  5. If step 4 fails after ZIMRA has issued the certificate, it stays pending and the next attempt
 *     verifies and installs it instead of asking ZIMRA for another.
 */
export async function renewCertificate(key: string, opts: { actor?: CertActor } = {}): Promise<RenewalResult> {
  if (!isEncryptionConfigured()) {
    throw new RenewalError("FISCAL_ENCRYPTION_KEY is not set; refusing to create a private key that cannot be stored encrypted");
  }
  const t = await loadTarget(key);
  await acquireLock(t);
  const ctx = secretCtx(t.scope);

  try {
    let doc = await loadDoc(t);
    if (!hasCertificate(doc)) throw new RenewalError("No certificate is stored for this device, so there is nothing to renew from");
    const current = tlsFromHolder(doc, t.scope);
    const currentPem = current?.certPem;
    if (!current || !currentPem) {
      throw new RenewalError("Renewal needs the certificate stored as a PEM pair. Upload it as certificate + key first.");
    }
    const cur = parseCertPem(currentPem);
    if (cur.notAfter.getTime() <= Date.now()) {
      throw new RenewalError("The certificate has already expired, so ZIMRA will not accept a renewal. The device must be registered again.");
    }

    const identity = parseDeviceCommonName(cur.subject);
    const deviceId = identity?.deviceId || doc.deviceId?.trim();
    const serial = identity?.serial || doc.deviceSerialNumber?.trim();
    if (!deviceId || !serial) throw new RenewalError("Cannot tell the device ID and serial from the certificate; set them on the device first");

    const base = gatewayBase(doc.zimraUseProductionUrl);
    const model = gatewayModel(doc);
    await t.model.updateOne({ _id: t.id }, { $set: { lastRenewalAttemptAt: new Date() } });

    // Resume: ZIMRA already issued a certificate on an earlier attempt that never got installed.
    let newCert = doc.pendingCertPem?.trim() || "";
    const resumed = Boolean(newCert && doc.pendingKeyPem);

    if (!resumed) {
      const { csrPem, keyPem } = generateCsr(serial, deviceId);
      await t.model.updateOne(
        { _id: t.id },
        { $set: { pendingKeyPem: encryptSecret(keyPem, ctx.pendingKey), pendingCertPem: "" } }
      );

      const res = await gatewayCall({
        base,
        path: `/Device/v1/${encodeURIComponent(deviceId)}/IssueCertificate`,
        method: "POST",
        body: { certificateRequest: csrPem },
        tls: current,
        model,
      });
      if (res.status !== 200 || typeof res.json?.certificate !== "string") {
        throw new RenewalError(`ZIMRA did not issue a certificate (HTTP ${res.status}: ${gatewayProblem(res)})`);
      }
      newCert = res.json.certificate;

      const issued = parseCertPem(newCert);
      if (parseDeviceCommonName(issued.subject)?.deviceId !== deviceId) {
        throw new RenewalError("ZIMRA returned a certificate for a different device; it was not installed");
      }
      if (!certMatchesKey(newCert, keyPem)) throw new RenewalError("ZIMRA's certificate does not match the new key; it was not installed");
      if (issued.notAfter.getTime() <= cur.notAfter.getTime()) {
        throw new RenewalError("ZIMRA's new certificate does not last longer than the current one; it was not installed");
      }
      await t.model.updateOne({ _id: t.id }, { $set: { pendingCertPem: newCert } });
    }

    doc = await loadDoc(t);
    const pendingKey = decryptSecret(doc.pendingKeyPem, ctx.pendingKey);
    if (!newCert || !pendingKey || !certMatchesKey(newCert, pendingKey)) {
      // The leftover pending pair is unusable; drop it so the next attempt starts clean.
      await t.model.updateOne({ _id: t.id }, { $set: { pendingKeyPem: "", pendingCertPem: "" } });
      throw new RenewalError("The pending certificate did not match its key and was discarded; try again");
    }

    // Prove it works with ZIMRA before it replaces the working one.
    const check = await gatewayCall({
      base,
      path: `/Device/v1/${encodeURIComponent(deviceId)}/GetConfig`,
      method: "GET",
      tls: { certPem: newCert, keyPem: pendingKey },
      model,
    });
    if (check.status !== 200) {
      throw new RenewalError(
        `The new certificate was issued but ZIMRA rejected it on a test call (HTTP ${check.status}: ${gatewayProblem(check)}). ` +
          "The current certificate is still installed; the new one is kept and re-tested on the next attempt."
      );
    }

    // Swap. applyPem validates and encrypts; the serial it derives is not the device serial, so keep ours.
    const keepSerial = doc.deviceSerialNumber;
    applyPem(doc, newCert, pendingKey, t.scope);
    doc.deviceSerialNumber = keepSerial;
    doc.pendingKeyPem = "";
    doc.pendingCertPem = "";
    doc.lastRenewalAt = new Date();
    doc.lastRenewalError = undefined;
    await doc.save();

    const installed = parseCertPem(newCert);
    await recordCertEvent("renew", opts.actor, {
      certSerial: installed.serial,
      certNotAfter: installed.notAfter,
      detail: `${t.name}${resumed ? " (resumed)" : ""}`,
    });
    logger.info({ key, notAfter: installed.notAfter }, "Fiscal device certificate renewed");
    return { key, name: t.name, oldNotAfter: cur.notAfter, newNotAfter: installed.notAfter, resumed };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await t.model.updateOne({ _id: t.id }, { $set: { lastRenewalError: message.slice(0, 500) } }).catch(() => undefined);
    await recordCertEvent("renew_failed", opts.actor, { detail: `${t.name}: ${message}`.slice(0, 300) });
    throw e instanceof RenewalError ? e : new RenewalError(message);
  } finally {
    await releaseLock(t).catch(() => undefined);
  }
}

export interface AutoRenewOutcome {
  key: string;
  name: string;
  action: "renewed" | "failed" | "skipped";
  detail?: string;
}

/** Daily: renew every device whose certificate has 30 days or fewer left (and auto-renew is on). */
export async function runAutoRenewals(): Promise<AutoRenewOutcome[]> {
  const out: AutoRenewOutcome[] = [];
  for (const r of await getCertExpiryReports()) {
    if (!r.hasCertificate || r.daysLeft === null || r.daysLeft > AUTO_RENEW_DAYS || r.daysLeft <= 0) continue;

    const t = await loadTarget(r.key);
    const doc = await loadDoc(t);
    if (doc.autoRenewCertificate !== true) {
      out.push({ key: r.key, name: r.name, action: "skipped", detail: "auto-renew is off" });
      continue;
    }

    try {
      const res = await renewCertificate(r.key);
      out.push({ key: r.key, name: r.name, action: "renewed", detail: `valid until ${res.newNotAfter.toISOString().slice(0, 10)}` });
      await sendFiscalAlertOnce(
        `cert-renewed:${r.key}:${res.newNotAfter.toISOString().slice(0, 10)}`,
        `Certificate for ${r.name} was renewed`,
        `The ZIMRA client certificate for ${r.name} was renewed automatically and is now valid until ${res.newNotAfter.toISOString().slice(0, 10)}.\n\n` +
          `If this device's Virtual Device keeps its own copy of the certificate, make sure it has been given the new one.`
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      out.push({ key: r.key, name: r.name, action: "failed", detail: message });
      await sendFiscalAlertOnce(
        `cert-renew-failed:${r.key}:${new Date().toISOString().slice(0, 10)}`,
        `Certificate renewal failed for ${r.name}`,
        `The automatic renewal of the ZIMRA certificate for ${r.name} did not complete. It expires in ${r.daysLeft} day${r.daysLeft === 1 ? "" : "s"}; after that date fiscal receipts stop.\n\n` +
          `Reason: ${message}\n\nThe system tries again tomorrow. You can also renew it by hand under Admin > Fiscal devices.`
      );
    }
  }
  return out;
}
