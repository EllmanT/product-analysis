import FiscalCertEvent, { type IFiscalCertEvent } from "@/database/fiscalCertEvent.model";
import FiscalSettings, { type IFiscalSettingsDoc } from "@/database/fiscalSettings.model";
import { type CertExpiryStatus, evaluateExpiry } from "@/lib/fiscalCertInfo";
import { isEncryptionConfigured } from "@/lib/security/secretBox";
import {
  CENTRAL_SCOPE,
  applyPem,
  applyPfx,
  clearPemFrom,
  clearPfxFrom,
  secretCtx,
  secretsEncrypted,
  tlsFromHolder,
} from "@/lib/services/fiscalCertStore";
import { ZIMRA_DEFAULT_TEST_BASE } from "@/lib/zimraConstants";
import dbConnect from "@/lib/mongoose";
import type { ZimraTlsConfig } from "@/lib/zimraHttp";

/** Resolved base URL after optional custom URL, env, and production toggle. */
export function resolveZimraBaseUrl(doc: IFiscalSettingsDoc): string {
  const raw =
    doc.zimraApiUrl?.trim() ||
    process.env.ZIMRA_API_URL?.trim() ||
    ZIMRA_DEFAULT_TEST_BASE;
  let base = raw.replace(/\/$/, "");
  if (doc.zimraUseProductionUrl === true) {
    try {
      const u = new URL(base);
      u.hostname = u.hostname.replace(/test/gi, "");
      base = `${u.protocol}//${u.host}`.replace(/\/$/, "");
    } catch {
      base = base.replace(/test/gi, "");
    }
  }
  return base;
}

export type FiscalSettingsSafe = {
  zimraApiUrl: string | null;
  zimraUseProductionUrl: boolean;
  effectiveZimraUrl: string;
  deviceId: string | null;
  deviceSerialNumber: string | null;
  hasClientCert: boolean;
  hasClientKey: boolean;
  hasPfx: boolean;
  certSubject: string | null;
  certSerial: string | null;
  certNotAfter: string | null;
  certExpiryStatus: CertExpiryStatus;
  certDaysLeft: number | null;
  /** False while a private key / PFX is still stored as plaintext (run the encrypt script). */
  secretsEncrypted: boolean;
  encryptionConfigured: boolean;
  autoRenewCertificate: boolean;
  lastRenewalAt: string | null;
  lastRenewalError: string | null;
  renewalPending: boolean;
  autoScheduleEnabled: boolean;
  autoCloseEnabled: boolean;
  autoOpenEnabled: boolean;
  closeTime: string;
  openTime: string;
  timezone: string;
  closeWeekdays: number[];
  openWeekdays: number[];
  lastAutoCloseDate: string | null;
  lastAutoOpenDate: string | null;
  updatedAt?: Date;
};

const DEFAULTS = {
  autoScheduleEnabled: false,
  autoCloseEnabled: false,
  autoOpenEnabled: false,
  closeTime: "00:00",
  openTime: "00:05",
  timezone: "Africa/Harare",
  closeWeekdays: [1, 2, 3, 4, 5, 6, 7] as number[],
  openWeekdays: [1, 2, 3, 4, 5, 6, 7] as number[],
};

export async function getFiscalSettingsDoc(): Promise<IFiscalSettingsDoc> {
  await dbConnect();
  let doc = await FiscalSettings.findOne();
  if (!doc) {
    doc = await FiscalSettings.create({ ...DEFAULTS });
  }
  return doc;
}

export async function getFiscalSettingsSafe(): Promise<FiscalSettingsSafe> {
  const doc = await getFiscalSettingsDoc();
  return toSafe(doc);
}

/** Encryption context binds each secret to its field, so values cannot be swapped between fields. */
export const SECRET_CTX = secretCtx(CENTRAL_SCOPE);

export type CertActor = { id?: string | null; email?: string | null };

export async function recordCertEvent(
  action: IFiscalCertEvent["action"],
  actor: CertActor | undefined,
  extra: Partial<IFiscalCertEvent> = {}
): Promise<void> {
  try {
    await FiscalCertEvent.create({
      action,
      actorId: actor?.id ?? undefined,
      actorEmail: actor?.email ?? undefined,
      ...extra,
    });
  } catch {
    // An audit write problem must not block a certificate change that already succeeded.
  }
}

function toSafe(doc: IFiscalSettingsDoc): FiscalSettingsSafe {
  const expiry = evaluateExpiry(doc.certNotAfter);
  return {
    zimraApiUrl: doc.zimraApiUrl?.trim() || null,
    zimraUseProductionUrl: doc.zimraUseProductionUrl === true,
    effectiveZimraUrl: resolveZimraBaseUrl(doc),
    deviceId: doc.deviceId?.trim() || null,
    deviceSerialNumber: doc.deviceSerialNumber?.trim() || null,
    hasClientCert: Boolean(doc.clientCertPem?.trim()),
    hasClientKey: Boolean(doc.clientKeyPem?.trim()),
    hasPfx: Boolean(doc.clientPfxBase64?.trim()),
    certSubject: doc.certSubject ?? null,
    certSerial: doc.certSerial ?? null,
    certNotAfter: doc.certNotAfter ? doc.certNotAfter.toISOString() : null,
    certExpiryStatus: expiry.status,
    certDaysLeft: expiry.daysLeft,
    secretsEncrypted: secretsEncrypted(doc),
    encryptionConfigured: isEncryptionConfigured(),
    autoRenewCertificate: doc.autoRenewCertificate === true,
    lastRenewalAt: doc.lastRenewalAt ? doc.lastRenewalAt.toISOString() : null,
    lastRenewalError: doc.lastRenewalError?.trim() || null,
    renewalPending: Boolean(doc.pendingKeyPem?.trim()),
    autoScheduleEnabled: doc.autoScheduleEnabled,
    autoCloseEnabled: doc.autoCloseEnabled,
    autoOpenEnabled: doc.autoOpenEnabled,
    closeTime: doc.closeTime,
    openTime: doc.openTime,
    timezone: doc.timezone,
    closeWeekdays: doc.closeWeekdays?.length ? [...doc.closeWeekdays] : [...DEFAULTS.closeWeekdays],
    openWeekdays: doc.openWeekdays?.length ? [...doc.openWeekdays] : [...DEFAULTS.openWeekdays],
    lastAutoCloseDate: doc.lastAutoCloseDate ?? null,
    lastAutoOpenDate: doc.lastAutoOpenDate ?? null,
    updatedAt: doc.updatedAt,
  };
}

export function buildTlsFromDoc(doc: IFiscalSettingsDoc): ZimraTlsConfig | null {
  // PEM wins over PFX when both are set, so a stale PFX passphrase cannot block mTLS.
  return tlsFromHolder(doc, CENTRAL_SCOPE);
}

export async function patchFiscalSettings(
  input: Partial<{
    zimraApiUrl: string | null;
    zimraUseProductionUrl: boolean;
    deviceId: string | null;
    deviceSerialNumber: string | null;
    autoRenewCertificate: boolean;
    autoScheduleEnabled: boolean;
    autoCloseEnabled: boolean;
    autoOpenEnabled: boolean;
    closeTime: string;
    openTime: string;
    timezone: string;
    closeWeekdays: number[];
    openWeekdays: number[];
  }>
): Promise<FiscalSettingsSafe> {
  await dbConnect();
  const doc = await getFiscalSettingsDoc();
  const set: Record<string, unknown> = {};
  if (input.zimraApiUrl !== undefined) set.zimraApiUrl = input.zimraApiUrl ?? "";
  if (input.zimraUseProductionUrl !== undefined)
    set.zimraUseProductionUrl = input.zimraUseProductionUrl;
  if (input.deviceId !== undefined) set.deviceId = input.deviceId ?? "";
  if (input.deviceSerialNumber !== undefined) set.deviceSerialNumber = input.deviceSerialNumber ?? "";
  if (input.autoRenewCertificate !== undefined) set.autoRenewCertificate = input.autoRenewCertificate;
  if (input.autoScheduleEnabled !== undefined) set.autoScheduleEnabled = input.autoScheduleEnabled;
  if (input.autoCloseEnabled !== undefined) set.autoCloseEnabled = input.autoCloseEnabled;
  if (input.autoOpenEnabled !== undefined) set.autoOpenEnabled = input.autoOpenEnabled;
  if (input.closeTime !== undefined) set.closeTime = input.closeTime;
  if (input.openTime !== undefined) set.openTime = input.openTime;
  if (input.timezone !== undefined) set.timezone = input.timezone;
  if (input.closeWeekdays !== undefined) set.closeWeekdays = input.closeWeekdays;
  if (input.openWeekdays !== undefined) set.openWeekdays = input.openWeekdays;
  Object.assign(doc, set);
  await doc.save();
  return toSafe(doc);
}

export async function clearPemCertificates(actor?: CertActor): Promise<void> {
  const doc = await getFiscalSettingsDoc();
  clearPemFrom(doc);
  await doc.save();
  await recordCertEvent("clear_pem", actor);
}

export async function clearPfxCertificate(actor?: CertActor): Promise<void> {
  const doc = await getFiscalSettingsDoc();
  clearPfxFrom(doc);
  await doc.save();
  await recordCertEvent("clear_pfx", actor);
}

export async function setPemCertificates(certPem: string, keyPem: string, actor?: CertActor): Promise<void> {
  await dbConnect();
  const doc = await getFiscalSettingsDoc();
  const info = applyPem(doc, certPem, keyPem, CENTRAL_SCOPE);
  await doc.save();
  await recordCertEvent("upload_pem", actor, { certSerial: info.serial, certNotAfter: info.notAfter });
}

export async function setPfxCertificate(base64: string, passphrase: string, actor?: CertActor): Promise<void> {
  await dbConnect();
  const doc = await getFiscalSettingsDoc();
  const info = applyPfx(doc, base64, passphrase, CENTRAL_SCOPE);
  await doc.save();
  await recordCertEvent("upload_pfx", actor, { certSerial: info.serial, certNotAfter: info.notAfter });
}

export async function setLastAutoCloseDate(dateStr: string): Promise<void> {
  const doc = await getFiscalSettingsDoc();
  doc.lastAutoCloseDate = dateStr;
  await doc.save();
}

export async function setLastAutoOpenDate(dateStr: string): Promise<void> {
  const doc = await getFiscalSettingsDoc();
  doc.lastAutoOpenDate = dateStr;
  await doc.save();
}
