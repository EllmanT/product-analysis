import type { Model } from "mongoose";

import FiscalDevice from "@/database/fiscalDevice.model";
import FiscalSettings from "@/database/fiscalSettings.model";
import { certMatchesKey, parseCertPem } from "@/lib/fiscalCertInfo";
import logger from "@/lib/logger";
import dbConnect from "@/lib/mongoose";
import { decryptSecret } from "@/lib/security/secretBox";
import {
  CENTRAL_SCOPE,
  applyPem,
  deviceScope,
  secretCtx,
  type CertHolder,
} from "@/lib/services/fiscalCertStore";
import { CENTRAL_KEY } from "@/lib/services/fiscalDevice.service";
import { getFiscalSettingsDoc, recordCertEvent, type CertActor } from "@/lib/services/fiscalSettings.service";
import { gatewayCall, gatewayProblem } from "@/lib/zimraGateway";

/** A certificate operation (renewal or registration) could not be completed. Safe to show to an administrator. */
export class RenewalError extends Error {}

/** A crashed operation must not block the next attempt forever. */
const LOCK_TTL_MS = 10 * 60_000;

export type CertDoc = CertHolder & {
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

/** The central FiscalSettings document or one FiscalDevice, whichever a certificate operation is about. */
export interface Target {
  key: string;
  name: string;
  scope: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: Model<any>;
  id: unknown;
}

export async function loadTarget(key: string): Promise<Target> {
  await dbConnect();
  if (key === CENTRAL_KEY) {
    const doc = await getFiscalSettingsDoc();
    return { key, name: "Central device", scope: CENTRAL_SCOPE, model: FiscalSettings, id: doc._id };
  }
  const doc = await FiscalDevice.findById(key).select("name");
  if (!doc) throw new RenewalError("Fiscal device not found");
  return { key, name: doc.name, scope: deviceScope(key), model: FiscalDevice, id: doc._id };
}

export const loadDoc = async (t: Target): Promise<CertDoc> => (await t.model.findById(t.id)) as CertDoc;

/**
 * Only one certificate operation per device at a time. Two overlapping requests to ZIMRA could each
 * be issued a certificate, and the second would invalidate the first.
 */
export async function acquireLock(t: Target): Promise<void> {
  const stale = new Date(Date.now() - LOCK_TTL_MS);
  const got = await t.model.findOneAndUpdate(
    { _id: t.id, $or: [{ renewalLockedAt: { $exists: false } }, { renewalLockedAt: null }, { renewalLockedAt: { $lt: stale } }] },
    { $set: { renewalLockedAt: new Date() } }
  );
  if (!got) throw new RenewalError("A certificate operation for this device is already running");
}

export const releaseLock = (t: Target) => t.model.updateOne({ _id: t.id }, { $unset: { renewalLockedAt: "" } });

export interface InstallOptions {
  deviceId: string;
  base: string;
  model: { name: string; version: string };
  /** The certificate ZIMRA issued (its key is the encrypted pendingKeyPem on the document). */
  newCert: string;
  action: "renew" | "register";
  /** Set the device ID and serial on the document (registration). Otherwise the existing serial is kept. */
  identity?: { deviceId: string; serial: string };
  actor?: CertActor;
  resumed: boolean;
  /** For the audit trail only. */
  label: string;
}

/**
 * Test an issued certificate against ZIMRA and only then install it. Used by renewal and registration.
 * Nothing replaces the working certificate until ZIMRA has accepted the new one over mTLS (GetConfig).
 * On any failure the pending pair is kept so the next attempt can finish without asking ZIMRA again.
 */
export async function installPending(t: Target, o: InstallOptions): Promise<{ newNotAfter: Date }> {
  const ctx = secretCtx(t.scope);
  const doc = await loadDoc(t);
  const pendingKey = decryptSecret(doc.pendingKeyPem, ctx.pendingKey);
  if (!o.newCert || !pendingKey || !certMatchesKey(o.newCert, pendingKey)) {
    // The leftover pair is unusable; drop it so the next attempt starts clean.
    await t.model.updateOne({ _id: t.id }, { $set: { pendingKeyPem: "", pendingCertPem: "" } });
    throw new RenewalError("The pending certificate did not match its key and was discarded; try again");
  }

  const check = await gatewayCall({
    base: o.base,
    path: `/Device/v1/${encodeURIComponent(o.deviceId)}/GetConfig`,
    method: "GET",
    tls: { certPem: o.newCert, keyPem: pendingKey },
    model: o.model,
  });
  if (check.status !== 200) {
    throw new RenewalError(
      `The new certificate was issued but ZIMRA rejected it on a test call (HTTP ${check.status}: ${gatewayProblem(check)}). ` +
        "It is kept and tested again on the next attempt" +
        (o.action === "renew" ? "; the current certificate is still installed." : ".")
    );
  }

  // applyPem validates and encrypts. The serial it derives from the certificate is not the device serial.
  const keepSerial = doc.deviceSerialNumber;
  applyPem(doc, o.newCert, pendingKey, t.scope);
  if (o.identity) {
    doc.deviceId = o.identity.deviceId;
    doc.deviceSerialNumber = o.identity.serial;
  } else {
    doc.deviceSerialNumber = keepSerial;
  }
  doc.pendingKeyPem = "";
  doc.pendingCertPem = "";
  doc.lastRenewalAt = new Date();
  doc.lastRenewalError = undefined;
  await doc.save();

  const installed = parseCertPem(o.newCert);
  await recordCertEvent(o.action, o.actor, {
    certSerial: installed.serial,
    certNotAfter: installed.notAfter,
    detail: `${o.label}${o.resumed ? " (resumed)" : ""}`,
  });
  logger.info({ key: t.key, action: o.action, notAfter: installed.notAfter }, "Fiscal device certificate installed");
  return { newNotAfter: installed.notAfter };
}
