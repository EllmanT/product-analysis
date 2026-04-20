import FiscalSettings, { type IFiscalSettingsDoc } from "@/database/fiscalSettings.model";
import dbConnect from "@/lib/mongoose";
import type { ZimraTlsConfig } from "@/lib/zimraHttp";

export type FiscalSettingsSafe = {
  zimraApiUrl: string | null;
  deviceId: string | null;
  deviceSerialNumber: string | null;
  hasClientCert: boolean;
  hasClientKey: boolean;
  hasPfx: boolean;
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

function toSafe(doc: IFiscalSettingsDoc): FiscalSettingsSafe {
  return {
    zimraApiUrl: doc.zimraApiUrl?.trim() || null,
    deviceId: doc.deviceId?.trim() || null,
    deviceSerialNumber: doc.deviceSerialNumber?.trim() || null,
    hasClientCert: Boolean(doc.clientCertPem?.trim()),
    hasClientKey: Boolean(doc.clientKeyPem?.trim()),
    hasPfx: Boolean(doc.clientPfxBase64?.trim()),
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
  if (doc.clientPfxBase64?.trim()) {
    return {
      pfxBase64: doc.clientPfxBase64,
      pfxPassphrase: doc.clientPfxPassphrase,
    };
  }
  if (doc.clientCertPem?.trim() && doc.clientKeyPem?.trim()) {
    return {
      certPem: doc.clientCertPem,
      keyPem: doc.clientKeyPem,
    };
  }
  return null;
}

export async function patchFiscalSettings(
  input: Partial<{
    zimraApiUrl: string | null;
    deviceId: string | null;
    deviceSerialNumber: string | null;
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
  if (input.deviceId !== undefined) set.deviceId = input.deviceId ?? "";
  if (input.deviceSerialNumber !== undefined) set.deviceSerialNumber = input.deviceSerialNumber ?? "";
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

export async function clearPemCertificates(): Promise<void> {
  const doc = await getFiscalSettingsDoc();
  doc.clientCertPem = "";
  doc.clientKeyPem = "";
  await doc.save();
}

export async function clearPfxCertificate(): Promise<void> {
  const doc = await getFiscalSettingsDoc();
  doc.clientPfxBase64 = "";
  doc.clientPfxPassphrase = "";
  await doc.save();
}

export async function setPemCertificates(certPem: string, keyPem: string): Promise<void> {
  await dbConnect();
  const doc = await getFiscalSettingsDoc();
  doc.clientCertPem = certPem;
  doc.clientKeyPem = keyPem;
  doc.clientPfxBase64 = "";
  doc.clientPfxPassphrase = "";
  await doc.save();
}

export async function setPfxCertificate(base64: string, passphrase: string): Promise<void> {
  await dbConnect();
  const doc = await getFiscalSettingsDoc();
  doc.clientPfxBase64 = base64;
  doc.clientPfxPassphrase = passphrase;
  doc.clientCertPem = "";
  doc.clientKeyPem = "";
  await doc.save();
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
