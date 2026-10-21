import FiscalDevice, { type IFiscalDeviceDoc } from "@/database/fiscalDevice.model";
import { evaluateExpiry, type CertExpiry } from "@/lib/fiscalCertInfo";
import logger from "@/lib/logger";
import dbConnect from "@/lib/mongoose";
import { isEncrypted } from "@/lib/security/secretBox";
import {
  CENTRAL_SCOPE,
  deviceScope,
  ensureCertMeta,
  hasCertificate,
  secretsEncrypted,
  type CertHolder,
} from "@/lib/services/fiscalCertStore";
import { sendFiscalAlertOnce } from "@/lib/services/fiscalAlerts.service";
import { CENTRAL_KEY } from "@/lib/services/fiscalDevice.service";
import { getFiscalSettingsDoc } from "@/lib/services/fiscalSettings.service";

/** Days before expiry at which an email goes out (once each per certificate). */
const ALERT_THRESHOLDS = [60, 30, 14, 7, 3, 1];

export type CertExpiryReport = CertExpiry & {
  /** "central" or the FiscalDevice id. */
  key: string;
  name: string;
  hasCertificate: boolean;
  serial: string | null;
  deviceId: string | null;
  /** False while this device's private key / PFX / login password is still stored as plaintext. */
  secretsEncrypted: boolean;
};

/**
 * Expiry of one stored device certificate. Rows saved before expiry tracking existed have no parsed
 * dates, so they are read from the stored certificate once and saved.
 */
async function reportFor(
  doc: CertHolder & { deviceId?: string; save(): Promise<unknown>; vdPassword?: string },
  key: string,
  name: string,
  scope: string
): Promise<CertExpiryReport> {
  const has = hasCertificate(doc);
  if (has && !doc.certNotAfter) {
    try {
      if (ensureCertMeta(doc, scope)) await doc.save();
    } catch (e) {
      logger.warn({ key, err: e instanceof Error ? e.message : String(e) }, "Could not read certificate expiry");
    }
  }
  return {
    ...evaluateExpiry(has ? doc.certNotAfter : null),
    key,
    name,
    hasCertificate: has,
    serial: doc.certSerial ?? null,
    deviceId: doc.deviceId?.trim() || null,
    secretsEncrypted: secretsEncrypted(doc) && (!doc.vdPassword?.trim() || isEncrypted(doc.vdPassword)),
  };
}

/** The central device first, then every active branch device. */
export async function getCertExpiryReports(): Promise<CertExpiryReport[]> {
  const central = await reportFor(await getFiscalSettingsDoc(), CENTRAL_KEY, "Central device", CENTRAL_SCOPE);
  await dbConnect();
  const devices: IFiscalDeviceDoc[] = await FiscalDevice.find({ active: true }).sort({ name: 1 });
  const rest = await Promise.all(devices.map((d) => reportFor(d, String(d._id), d.name, deviceScope(String(d._id)))));
  return [central, ...rest];
}

export interface CertExpiryCheckResult {
  key: string;
  name: string;
  status: CertExpiry["status"];
  daysLeft: number | null;
  alerted: boolean;
}

/** Run daily. Emails the administrators at each threshold; the alert key is unique per certificate. */
export async function runCertExpiryCheck(): Promise<CertExpiryCheckResult[]> {
  const out: CertExpiryCheckResult[] = [];
  for (const r of await getCertExpiryReports()) {
    const base = { key: r.key, name: r.name, status: r.status, daysLeft: r.daysLeft };
    if (!r.hasCertificate || r.status === "ok" || r.status === "unknown" || r.daysLeft === null) {
      out.push({ ...base, alerted: false });
      continue;
    }

    const device = r.key === CENTRAL_KEY ? "the central fiscal device" : `fiscal device "${r.name}"`;
    const id = r.deviceId ? ` (device ${r.deviceId})` : "";
    const when = r.notAfter!.toISOString().slice(0, 16).replace("T", " ") + " UTC";
    let key: string;
    let subject: string;
    let text: string;

    if (r.status === "expired") {
      key = `cert-expiry:${r.serial}:expired`;
      subject = `Certificate for ${device} has EXPIRED`;
      text =
        `The ZIMRA client certificate for ${device}${id} expired on ${when}.\n\n` +
        `ZIMRA now rejects every request from this device, so fiscal receipts cannot be issued.\n` +
        `Install a renewed certificate under Admin > Fiscal settings immediately.`;
    } else {
      const threshold = ALERT_THRESHOLDS.filter((t) => r.daysLeft! <= t).pop()!;
      key = `cert-expiry:${r.serial}:${threshold}`;
      subject = `Certificate for ${device} expires in ${r.daysLeft} day${r.daysLeft === 1 ? "" : "s"}`;
      text =
        `The ZIMRA client certificate for ${device}${id} expires on ${when} (${r.daysLeft} days from now).\n\n` +
        `After that date ZIMRA rejects every request from the device and fiscal receipts stop.\n` +
        `ZIMRA recommends renewing at least a month before expiry. Install the renewed certificate under ` +
        `Admin > Fiscal settings.`;
    }

    out.push({ ...base, alerted: await sendFiscalAlertOnce(key, subject, text) });
  }
  return out;
}
