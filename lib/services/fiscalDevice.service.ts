import { Types } from "mongoose";

import Branch from "@/database/branch.model";
import FiscalDevice, { type IFiscalDeviceDoc } from "@/database/fiscalDevice.model";
import FiscalSettings from "@/database/fiscalSettings.model";
import PosSale from "@/database/posSale.model";
import { evaluateExpiry, type CertExpiryStatus } from "@/lib/fiscalCertInfo";
import { fiscalBackend } from "@/lib/fiscal/client";
import dbConnect from "@/lib/mongoose";
import { decryptSecret, encryptSecret, isEncrypted } from "@/lib/security/secretBox";
import {
  applyPem,
  applyPfx,
  clearPemFrom,
  clearPfxFrom,
  deviceScope,
  secretsEncrypted,
  tlsFromHolder,
} from "@/lib/services/fiscalCertStore";
import {
  type CertActor,
  getFiscalSettingsDoc,
  recordCertEvent,
  resolveZimraBaseUrl,
  buildTlsFromDoc,
} from "@/lib/services/fiscalSettings.service";
import type { ZimraTlsConfig } from "@/lib/zimraHttp";

export const CENTRAL_KEY = "central";

/** A branch points at a device that is missing, inactive or not fully set up. Nothing is sent. */
export class DeviceConfigError extends Error {}

/** Everything needed to talk to one device. Built fresh per operation; never cached. */
export interface ResolvedDevice {
  /** "central" or the FiscalDevice id. Keys the circuit breaker, limiter and auth cache. */
  key: string;
  name: string;
  isCentral: boolean;
  base: string;
  tls: ZimraTlsConfig | null;
  deviceId?: string;
  serial?: string;
  /** Login for the Virtual Device, or null when it needs none. */
  vd: { email: string; password: string } | null;
}

const vdPasswordCtx = (id: string) => `fiscal:${deviceScope(id)}:vdPassword`;

/** Strip "test" from the hostname when the production toggle is on (same rule as the central device). */
function productionHost(raw: string): string {
  try {
    const u = new URL(raw);
    u.hostname = u.hostname.replace(/test/gi, "");
    return `${u.protocol}//${u.host}`;
  } catch {
    return raw.replace(/test/gi, "");
  }
}

/** A device has no env/default fallback: a missing URL must never quietly mean "the central device". */
export function deviceBaseUrl(doc: { zimraApiUrl?: string; zimraUseProductionUrl?: boolean }): string | null {
  const raw = doc.zimraApiUrl?.trim().replace(/\/$/, "");
  if (!raw) return null;
  return (doc.zimraUseProductionUrl ? productionHost(raw) : raw).replace(/\/$/, "");
}

export async function resolveCentralDevice(): Promise<ResolvedDevice> {
  const doc = await getFiscalSettingsDoc();
  const email = process.env.ZIMRA_VD_EMAIL?.trim();
  const password = process.env.ZIMRA_VD_PASSWORD?.trim();
  return {
    key: CENTRAL_KEY,
    name: "Central device",
    isCentral: true,
    base: resolveZimraBaseUrl(doc),
    tls: buildTlsFromDoc(doc),
    deviceId: doc.deviceId?.trim() || undefined,
    serial: doc.deviceSerialNumber?.trim() || undefined,
    vd: email && password ? { email, password } : null,
  };
}

function resolveFromDoc(doc: IFiscalDeviceDoc): ResolvedDevice {
  const id = String(doc._id);
  if (!doc.active) throw new DeviceConfigError(`Fiscal device "${doc.name}" is switched off`);
  const base = deviceBaseUrl(doc);
  if (!base) throw new DeviceConfigError(`Fiscal device "${doc.name}" has no ZIMRA API URL`);
  const email = doc.vdEmail?.trim();
  const password = email ? decryptSecret(doc.vdPassword, vdPasswordCtx(id)) : "";
  return {
    key: id,
    name: doc.name,
    isCentral: false,
    base,
    tls: tlsFromHolder(doc, deviceScope(id)),
    deviceId: doc.deviceId?.trim() || undefined,
    serial: doc.deviceSerialNumber?.trim() || undefined,
    vd: email && password ? { email, password } : null,
  };
}

/**
 * The device an admin made central (FISCAL_BACKEND=service), or null. Read and written on the raw collection:
 * a dev server that still holds an older cached FiscalSettings schema would otherwise drop this field silently,
 * which looked like "no central device is chosen" straight after choosing one.
 */
export async function getCentralDeviceId(): Promise<string | null> {
  await dbConnect();
  const row = await FiscalSettings.collection.findOne({}, { projection: { centralFiscalDeviceId: 1 } });
  return row?.centralFiscalDeviceId ? String(row.centralFiscalDeviceId) : null;
}

export async function setCentralDeviceId(id: string | null): Promise<void> {
  await getFiscalSettingsDoc(); // makes sure the settings row exists
  await FiscalSettings.collection.updateOne({}, { $set: { centralFiscalDeviceId: id ? new Types.ObjectId(id) : null } });
}

/** "central" (or empty) resolves to the central device; anything else must be a usable FiscalDevice. */
export async function resolveDeviceByKey(key?: string | null): Promise<ResolvedDevice> {
  if (!key || key === CENTRAL_KEY) return resolveCentralDevice();
  if (!Types.ObjectId.isValid(key)) throw new DeviceConfigError("Unknown fiscal device");
  await dbConnect();
  const doc = await FiscalDevice.findById(key);
  if (!doc) throw new DeviceConfigError("The branch's fiscal device no longer exists");
  return resolveFromDoc(doc);
}

/**
 * The device's id inside the fiscal service (FISCAL_BACKEND=service). The central device uses an env setting,
 * branch devices store theirs on the record. Never falls back to another device.
 */
export async function resolveServiceDeviceId(key?: string | null): Promise<string> {
  if (!key || key === CENTRAL_KEY) {
    // An admin's choice (Fiscal devices > Make central) wins; the environment setting is the fallback for older installs.
    const chosen = await getCentralDeviceId();
    if (chosen) {
      const c = await FiscalDevice.findById(chosen).select("name active serviceDeviceId").lean<{ name: string; active: boolean; serviceDeviceId?: string }>();
      if (!c) throw new DeviceConfigError("The device chosen as central no longer exists. Choose another on the Fiscal devices page.");
      if (!c.active) throw new DeviceConfigError(`The central device "${c.name}" is switched off`);
      if (!c.serviceDeviceId) throw new DeviceConfigError(`The central device "${c.name}" has no certificate in the fiscal service yet`);
      return c.serviceDeviceId;
    }
    const id = process.env.FISCAL_SERVICE_CENTRAL_DEVICE_ID?.trim();
    if (!id) throw new DeviceConfigError("No central device is chosen. Open Fiscal devices and use Make central on a device.");
    return id;
  }
  if (!Types.ObjectId.isValid(key)) throw new DeviceConfigError("Unknown fiscal device");
  await dbConnect();
  const doc = await FiscalDevice.findById(key).select("name active serviceDeviceId").lean<{ name: string; active: boolean; serviceDeviceId?: string }>();
  if (!doc) throw new DeviceConfigError("The branch's fiscal device no longer exists");
  if (!doc.active) throw new DeviceConfigError(`Fiscal device "${doc.name}" is switched off`);
  if (!doc.serviceDeviceId) throw new DeviceConfigError(`Fiscal device "${doc.name}" has not been added to the fiscal service yet`);
  return doc.serviceDeviceId;
}

type BranchDeviceRef = { pos?: { fiscalDeviceId?: Types.ObjectId | string | null } } | null | undefined;

/** Key to snapshot on a new sale: the branch's own device, otherwise central. No lookup, no failure. */
export function deviceKeyForBranch(branch: BranchDeviceRef): string {
  const id = branch?.pos?.fiscalDeviceId;
  return id ? String(id) : CENTRAL_KEY;
}

export async function resolveDeviceForBranch(branchId: string): Promise<ResolvedDevice> {
  await dbConnect();
  const branch = await Branch.findById(branchId).select("pos.fiscalDeviceId").lean<BranchDeviceRef>();
  return resolveDeviceByKey(deviceKeyForBranch(branch));
}

/** Mongo filter for sales that belong to a device (central also matches sales that predate devices). */
export function saleDeviceFilter(key: string | undefined): Record<string, unknown> {
  if (!key || key === CENTRAL_KEY) {
    return { $or: [{ fiscalDeviceKey: CENTRAL_KEY }, { fiscalDeviceKey: { $exists: false } }, { fiscalDeviceKey: null }] };
  }
  return { fiscalDeviceKey: key };
}

// ---------------------------------------------------------------------------
// Admin: list and edit devices
// ---------------------------------------------------------------------------

export interface FiscalDeviceSafe {
  id: string;
  name: string;
  active: boolean;
  zimraApiUrl: string | null;
  zimraUseProductionUrl: boolean;
  effectiveZimraUrl: string | null;
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
  secretsEncrypted: boolean;
  autoRenewCertificate: boolean;
  lastRenewalAt: string | null;
  lastRenewalError: string | null;
  /** ZIMRA has issued a new certificate that is waiting to be verified and installed. */
  renewalPending: boolean;
  deviceModelName: string | null;
  deviceModelVersion: string | null;
  /** The device's id inside the fiscal service (FISCAL_BACKEND=service). */
  serviceDeviceId: string | null;
  vdEmail: string | null;
  hasVdPassword: boolean;
  autoScheduleEnabled: boolean;
  autoCloseEnabled: boolean;
  autoOpenEnabled: boolean;
  closeUnsentPolicy: "send_first" | "stop";
  closeTime: string;
  openTime: string;
  timezone: string;
  closeWeekdays: number[];
  openWeekdays: number[];
  lastAutoCloseDate: string | null;
  lastAutoOpenDate: string | null;
  branches: { id: string; name: string }[];
  /** FISCAL_BACKEND=service: this device is the central one (shop and branches without their own device). */
  isCentral: boolean;
}

function toSafe(doc: IFiscalDeviceDoc, branches: { id: string; name: string }[], isCentral = false): FiscalDeviceSafe {
  const expiry = evaluateExpiry(doc.certNotAfter);
  return {
    id: String(doc._id),
    name: doc.name,
    active: doc.active,
    zimraApiUrl: doc.zimraApiUrl?.trim() || null,
    zimraUseProductionUrl: doc.zimraUseProductionUrl === true,
    effectiveZimraUrl: deviceBaseUrl(doc),
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
    secretsEncrypted: secretsEncrypted(doc) && (!doc.vdPassword?.trim() || isEncrypted(doc.vdPassword)),
    autoRenewCertificate: doc.autoRenewCertificate === true,
    lastRenewalAt: doc.lastRenewalAt ? doc.lastRenewalAt.toISOString() : null,
    lastRenewalError: doc.lastRenewalError?.trim() || null,
    renewalPending: Boolean(doc.pendingKeyPem?.trim()),
    serviceDeviceId: doc.serviceDeviceId?.trim() || null,
    deviceModelName: doc.deviceModelName?.trim() || null,
    deviceModelVersion: doc.deviceModelVersion?.trim() || null,
    vdEmail: doc.vdEmail?.trim() || null,
    hasVdPassword: Boolean(doc.vdPassword?.trim()),
    autoScheduleEnabled: doc.autoScheduleEnabled,
    autoCloseEnabled: doc.autoCloseEnabled,
    autoOpenEnabled: doc.autoOpenEnabled,
    closeUnsentPolicy: doc.closeUnsentPolicy === "stop" ? "stop" : "send_first",
    closeTime: doc.closeTime,
    openTime: doc.openTime,
    timezone: doc.timezone,
    closeWeekdays: [...(doc.closeWeekdays ?? [])],
    openWeekdays: [...(doc.openWeekdays ?? [])],
    lastAutoCloseDate: doc.lastAutoCloseDate ?? null,
    lastAutoOpenDate: doc.lastAutoOpenDate ?? null,
    branches,
    isCentral,
  };
}

async function branchesByDevice(): Promise<Map<string, { id: string; name: string }[]>> {
  const rows = await Branch.find({ "pos.fiscalDeviceId": { $ne: null } })
    .select("name pos.fiscalDeviceId")
    .lean<{ _id: Types.ObjectId; name: string; pos?: { fiscalDeviceId?: Types.ObjectId } }[]>();
  const map = new Map<string, { id: string; name: string }[]>();
  for (const r of rows) {
    const k = r.pos?.fiscalDeviceId ? String(r.pos.fiscalDeviceId) : "";
    if (!k) continue;
    map.set(k, [...(map.get(k) ?? []), { id: String(r._id), name: r.name }]);
  }
  return map;
}

export async function listFiscalDevices(): Promise<FiscalDeviceSafe[]> {
  await dbConnect();
  const [docs, map, centralId] = await Promise.all([FiscalDevice.find().sort({ name: 1 }), branchesByDevice(), getCentralDeviceId()]);
  const central = centralId ?? "";
  return docs.map((d: IFiscalDeviceDoc) => toSafe(d, map.get(String(d._id)) ?? [], String(d._id) === central));
}

export async function getFiscalDeviceSafe(id: string): Promise<FiscalDeviceSafe | null> {
  await dbConnect();
  if (!Types.ObjectId.isValid(id)) return null;
  const [doc, map, centralId] = await Promise.all([FiscalDevice.findById(id), branchesByDevice(), getCentralDeviceId()]);
  return doc ? toSafe(doc, map.get(String(doc._id)) ?? [], centralId === String(doc._id)) : null;
}

async function loadDevice(id: string): Promise<IFiscalDeviceDoc> {
  await dbConnect();
  const doc = Types.ObjectId.isValid(id) ? await FiscalDevice.findById(id) : null;
  if (!doc) throw new DeviceConfigError("Fiscal device not found");
  return doc;
}

/** No two records may describe the same physical device or the same Virtual Device URL. */
async function assertNotDuplicate(
  self: string | null,
  next: { zimraApiUrl?: string; zimraUseProductionUrl?: boolean; deviceId?: string }
): Promise<void> {
  const central = await getFiscalSettingsDoc();
  // Devices behind the fiscal service all talk to the same ZIMRA address; only the Axis VD needs its own URL.
  const base = fiscalBackend() === "service" ? null : deviceBaseUrl(next);
  const wantId = next.deviceId?.trim();
  if (wantId && central.deviceId?.trim() === wantId) {
    throw new DeviceConfigError(`Device ID ${wantId} is already the central device`);
  }
  if (base && resolveZimraBaseUrl(central).toLowerCase() === base.toLowerCase()) {
    throw new DeviceConfigError("This URL is the central device's. A branch device needs its own Virtual Device URL.");
  }
  const others = await FiscalDevice.find(self ? { _id: { $ne: self } } : {}).select("name zimraApiUrl zimraUseProductionUrl deviceId");
  for (const o of others) {
    if (wantId && o.deviceId?.trim() === wantId) throw new DeviceConfigError(`Device ID ${wantId} is already used by "${o.name}"`);
    if (base && deviceBaseUrl(o)?.toLowerCase() === base.toLowerCase()) {
      throw new DeviceConfigError(`This URL is already used by "${o.name}"`);
    }
  }
}

export interface FiscalDeviceInput {
  name?: string;
  active?: boolean;
  zimraApiUrl?: string | null;
  zimraUseProductionUrl?: boolean;
  deviceId?: string | null;
  deviceSerialNumber?: string | null;
  autoRenewCertificate?: boolean;
  serviceDeviceId?: string | null;
  deviceModelName?: string | null;
  deviceModelVersion?: string | null;
  vdEmail?: string | null;
  /** Plain text in, encrypted at rest. null clears it. */
  vdPassword?: string | null;
  autoScheduleEnabled?: boolean;
  autoCloseEnabled?: boolean;
  autoOpenEnabled?: boolean;
  closeUnsentPolicy?: "send_first" | "stop";
  closeTime?: string;
  openTime?: string;
  timezone?: string;
  closeWeekdays?: number[];
  openWeekdays?: number[];
}

function applyInput(doc: IFiscalDeviceDoc, input: FiscalDeviceInput) {
  const id = String(doc._id);
  if (input.name !== undefined) doc.name = input.name.trim();
  if (input.active !== undefined) doc.active = input.active;
  if (input.zimraApiUrl !== undefined) doc.zimraApiUrl = input.zimraApiUrl?.trim() ?? "";
  if (input.zimraUseProductionUrl !== undefined) doc.zimraUseProductionUrl = input.zimraUseProductionUrl;
  if (input.deviceId !== undefined) doc.deviceId = input.deviceId?.trim() ?? "";
  if (input.deviceSerialNumber !== undefined) doc.deviceSerialNumber = input.deviceSerialNumber?.trim() ?? "";
  if (input.autoRenewCertificate !== undefined) doc.autoRenewCertificate = input.autoRenewCertificate;
  if (input.serviceDeviceId !== undefined) doc.serviceDeviceId = input.serviceDeviceId?.trim() ?? "";
  if (input.deviceModelName !== undefined) doc.deviceModelName = input.deviceModelName?.trim() ?? "";
  if (input.deviceModelVersion !== undefined) doc.deviceModelVersion = input.deviceModelVersion?.trim() ?? "";
  if (input.vdEmail !== undefined) doc.vdEmail = input.vdEmail?.trim() ?? "";
  if (input.vdPassword !== undefined) {
    doc.vdPassword = input.vdPassword ? encryptSecret(input.vdPassword, vdPasswordCtx(id)) : "";
  }
  for (const k of [
    "autoScheduleEnabled",
    "autoCloseEnabled",
    "autoOpenEnabled",
    "closeUnsentPolicy",
    "closeTime",
    "openTime",
    "timezone",
    "closeWeekdays",
    "openWeekdays",
  ] as const) {
    if (input[k] !== undefined) (doc as unknown as Record<string, unknown>)[k] = input[k];
  }
}

export async function createFiscalDevice(input: FiscalDeviceInput & { name: string }): Promise<FiscalDeviceSafe> {
  await dbConnect();
  await assertNotDuplicate(null, input as { zimraApiUrl?: string; deviceId?: string });
  const doc = new FiscalDevice({ name: input.name.trim() });
  applyInput(doc, input);
  try {
    await doc.save();
  } catch (e) {
    if ((e as { code?: number }).code === 11000) throw new DeviceConfigError("A device with this name or device ID already exists");
    throw e;
  }
  return toSafe(doc, []);
}

export async function updateFiscalDevice(id: string, input: FiscalDeviceInput): Promise<FiscalDeviceSafe> {
  const doc = await loadDevice(id);
  await assertNotDuplicate(id, {
    zimraApiUrl: input.zimraApiUrl !== undefined ? (input.zimraApiUrl ?? "") : doc.zimraApiUrl,
    zimraUseProductionUrl: input.zimraUseProductionUrl ?? doc.zimraUseProductionUrl,
    deviceId: input.deviceId !== undefined ? (input.deviceId ?? "") : doc.deviceId,
  });
  applyInput(doc, input);
  try {
    await doc.save();
  } catch (e) {
    if ((e as { code?: number }).code === 11000) throw new DeviceConfigError("A device with this name or device ID already exists");
    throw e;
  }
  return (await getFiscalDeviceSafe(id))!;
}

/** Refused while a branch uses the device or any sale was ever sent through it. Switch it off instead. */
export async function deleteFiscalDevice(id: string): Promise<void> {
  const doc = await loadDevice(id);
  const inUse = await Branch.countDocuments({ "pos.fiscalDeviceId": doc._id });
  if (inUse > 0) throw new DeviceConfigError(`${inUse} branch(es) still use this device. Move them to another device first.`);
  if (await PosSale.exists({ fiscalDeviceKey: String(doc._id) })) {
    throw new DeviceConfigError("This device has fiscal history and cannot be deleted. Switch it off instead.");
  }
  await FiscalDevice.deleteOne({ _id: doc._id });
}

/** Point a branch at a device, or back at the central one (deviceId null). */
export async function assignBranchDevice(branchId: string, deviceId: string | null): Promise<void> {
  await dbConnect();
  if (!Types.ObjectId.isValid(branchId)) throw new DeviceConfigError("Branch not found");
  if (deviceId) {
    const d = await loadDevice(deviceId);
    if (!d.active) throw new DeviceConfigError("That device is switched off");
    if (fiscalBackend() === "service") {
      if (!d.serviceDeviceId?.trim()) throw new DeviceConfigError("Add this device's certificate first, so it can be used by a branch");
    } else if (!deviceBaseUrl(d)) throw new DeviceConfigError("Set the device's ZIMRA API URL before assigning it to a branch");
  }
  const res = await Branch.updateOne({ _id: branchId }, { $set: { "pos.fiscalDeviceId": deviceId ? new Types.ObjectId(deviceId) : null } });
  if (res.matchedCount === 0) throw new DeviceConfigError("Branch not found");
}

// ---------------------------------------------------------------------------
// Certificates (same validation and encryption as the central device)
// ---------------------------------------------------------------------------

export async function setDevicePem(id: string, certPem: string, keyPem: string, actor?: CertActor): Promise<void> {
  const doc = await loadDevice(id);
  const info = applyPem(doc, certPem, keyPem, deviceScope(id));
  await doc.save();
  await recordCertEvent("upload_pem", actor, { certSerial: info.serial, certNotAfter: info.notAfter, detail: `device ${doc.name}` });
}

export async function setDevicePfx(id: string, base64: string, passphrase: string, actor?: CertActor): Promise<void> {
  const doc = await loadDevice(id);
  const info = applyPfx(doc, base64, passphrase, deviceScope(id));
  await doc.save();
  await recordCertEvent("upload_pfx", actor, { certSerial: info.serial, certNotAfter: info.notAfter, detail: `device ${doc.name}` });
}

export async function clearDevicePem(id: string, actor?: CertActor): Promise<void> {
  const doc = await loadDevice(id);
  clearPemFrom(doc);
  await doc.save();
  await recordCertEvent("clear_pem", actor, { detail: `device ${doc.name}` });
}

export async function clearDevicePfx(id: string, actor?: CertActor): Promise<void> {
  const doc = await loadDevice(id);
  clearPfxFrom(doc);
  await doc.save();
  await recordCertEvent("clear_pfx", actor, { detail: `device ${doc.name}` });
}

// ---------------------------------------------------------------------------
// Scheduler support
// ---------------------------------------------------------------------------

/** Active devices (not central) that have the daily open/close schedule switched on. */
export async function listScheduledDevices(): Promise<IFiscalDeviceDoc[]> {
  await dbConnect();
  return FiscalDevice.find({ active: true, autoScheduleEnabled: true });
}

export async function setDeviceLastAutoCloseDate(id: string, date: string): Promise<void> {
  await FiscalDevice.updateOne({ _id: id }, { $set: { lastAutoCloseDate: date } });
}

export async function setDeviceLastAutoOpenDate(id: string, date: string): Promise<void> {
  await FiscalDevice.updateOne({ _id: id }, { $set: { lastAutoOpenDate: date } });
}

/**
 * A device ID may belong to only one record (the central device or one FiscalDevice). `selfKey` is the
 * record that wants it, so it does not clash with itself.
 */
export async function assertDeviceIdFree(selfKey: string, deviceId: string): Promise<void> {
  const id = deviceId.trim();
  if (!id) return;
  if (selfKey !== CENTRAL_KEY) {
    const central = await getFiscalSettingsDoc();
    if (central.deviceId?.trim() === id) throw new DeviceConfigError(`Device ID ${id} is already the central device`);
  }
  const clash = await FiscalDevice.findOne({ deviceId: id, ...(selfKey === CENTRAL_KEY ? {} : { _id: { $ne: selfKey } }) }).select("name");
  if (clash) throw new DeviceConfigError(`Device ID ${id} is already used by "${clash.name}"`);
}

/** Persist the serial/ID read from the device's GetConfig. */
export async function saveDeviceIdentity(id: string, deviceId: string, serial: string): Promise<void> {
  await assertNotDuplicate(id, { deviceId });
  await FiscalDevice.updateOne({ _id: id }, { $set: { deviceId, deviceSerialNumber: serial } });
}
