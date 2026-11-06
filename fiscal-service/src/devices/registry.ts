/**
 * Device registry. Adding a device is: upload its certificate and private key. Everything else about
 * the device comes from the certificate and from ZIMRA's GetConfig; there is no registration flow.
 *
 * Checks before anything is stored: the certificate is a ZIMRA device certificate, it is not expired,
 * the key matches it, the device id is not already registered, and the gateway accepts the pair
 * (GetConfig over mutual TLS). Private keys are stored encrypted, bound to the device id.
 */
import { ObjectId, type Collection, type Db } from "mongodb";

import { assertKeyMatchesCertificate, CertError, parseDeviceCertificate, type DeviceCertInfo } from "./cert-info.js";
import type { SecretBox } from "../security/secret-box.js";

export type Environment = "test" | "production";

export interface DeviceConfigSnapshot {
  taxPayerName?: string;
  taxPayerTIN?: string;
  vatNumber?: string;
  deviceOperatingMode?: string;
  taxPayerDayMaxHrs?: number;
  qrUrl?: string;
  certificateValidTill?: string;
  applicableTaxes?: unknown[];
  fetchedAt: Date;
}

/** When a device's fiscal day opens and closes by itself. Times are wall-clock HH:mm in `timezone`. */
export interface DeviceSchedule {
  enabled: boolean;
  openTime: string;
  closeTime: string;
  timezone: string;
  /** ISO weekdays (1 = Monday) the schedule runs on; empty means every day. */
  weekdays: number[];
  /** Markers written only when the step succeeded, so a failure is retried. */
  lastOpenDate?: string;
  lastCloseDate?: string;
}

export interface DeviceDoc {
  _id: ObjectId;
  tenantId: string;
  name: string;
  deviceId: number;
  serialNumber: string;
  environment: Environment;
  keyType: "rsa" | "ec";
  certificatePem: string;
  /** enc:v1 ciphertext of the private key PEM. */
  privateKeyEnc: string;
  certNotBefore: Date;
  certNotAfter: Date;
  active: boolean;
  schedule?: DeviceSchedule;
  config?: DeviceConfigSnapshot;
  createdAt: Date;
  updatedAt: Date;
}

/** What the API may show: never the key, never the certificate body. */
export interface DeviceSafe {
  id: string;
  tenantId: string;
  name: string;
  deviceId: number;
  serialNumber: string;
  environment: Environment;
  keyType: "rsa" | "ec";
  certNotAfter: string;
  certDaysLeft: number;
  active: boolean;
  schedule?: DeviceSchedule;
  taxPayerName?: string;
  operatingMode?: string;
}

export class RegistryError extends Error {
  constructor(
    message: string,
    public readonly status = 422
  ) {
    super(message);
  }
}

/** Asks the gateway whether it accepts this certificate and key. Injected so tests need no network. */
export type GatewayVerifier = (args: {
  deviceId: number;
  serialNumber: string;
  certificatePem: string;
  privateKeyPem: string;
  environment: Environment;
}) => Promise<DeviceConfigSnapshot>;

const keyContext = (deviceId: number) => `fiscal-service:device:${deviceId}:privateKey`;

export class DeviceRegistry {
  private readonly col: Collection<DeviceDoc>;

  constructor(
    db: Db,
    private readonly box: SecretBox,
    private readonly verify: GatewayVerifier
  ) {
    this.col = db.collection<DeviceDoc>("devices");
  }

  async init(): Promise<void> {
    await this.col.createIndex({ deviceId: 1 }, { unique: true });
    await this.col.createIndex({ tenantId: 1, name: 1 });
  }

  private toSafe(d: DeviceDoc, now = new Date()): DeviceSafe {
    return {
      id: String(d._id),
      tenantId: d.tenantId,
      name: d.name,
      deviceId: d.deviceId,
      serialNumber: d.serialNumber,
      environment: d.environment,
      keyType: d.keyType,
      certNotAfter: d.certNotAfter.toISOString(),
      certDaysLeft: Math.floor((d.certNotAfter.getTime() - now.getTime()) / 86_400_000),
      active: d.active,
      schedule: d.schedule,
      taxPayerName: d.config?.taxPayerName,
      operatingMode: d.config?.deviceOperatingMode,
    };
  }

  private async check(certificatePem: string, privateKeyPem: string, environment: Environment): Promise<{ info: DeviceCertInfo; config: DeviceConfigSnapshot }> {
    let info: DeviceCertInfo;
    try {
      info = parseDeviceCertificate(certificatePem);
      assertKeyMatchesCertificate(certificatePem, privateKeyPem);
    } catch (e) {
      if (e instanceof CertError) throw new RegistryError(e.message);
      throw e;
    }
    if (info.daysLeft < 0) throw new RegistryError(`The certificate expired on ${info.notAfter.toISOString().slice(0, 10)}. A new certificate is needed.`);
    let config: DeviceConfigSnapshot;
    try {
      config = await this.verify({ deviceId: info.deviceId, serialNumber: info.serialNumber, certificatePem, privateKeyPem, environment });
    } catch (e) {
      throw new RegistryError(`ZIMRA did not accept this certificate for device ${info.deviceId}: ${e instanceof Error ? e.message : String(e)}`);
    }
    return { info, config };
  }

  async add(input: { tenantId: string; name: string; certificatePem: string; privateKeyPem: string; environment?: Environment }): Promise<DeviceSafe> {
    const name = input.name.trim();
    if (!name) throw new RegistryError("Give the device a name", 400);
    const environment = input.environment ?? "test";
    const { info, config } = await this.check(input.certificatePem, input.privateKeyPem, environment);
    if (await this.col.findOne({ deviceId: info.deviceId })) throw new RegistryError(`Device ${info.deviceId} is already registered`, 409);
    const now = new Date();
    const doc: DeviceDoc = {
      _id: new ObjectId(),
      tenantId: input.tenantId,
      name,
      deviceId: info.deviceId,
      serialNumber: info.serialNumber,
      environment,
      keyType: info.keyType,
      certificatePem: input.certificatePem.trim(),
      privateKeyEnc: this.box.encrypt(input.privateKeyPem.trim(), keyContext(info.deviceId)),
      certNotBefore: info.notBefore,
      certNotAfter: info.notAfter,
      active: true,
      config,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await this.col.insertOne(doc);
    } catch (e) {
      if ((e as { code?: number }).code === 11000) throw new RegistryError(`Device ${info.deviceId} is already registered`, 409);
      throw e;
    }
    return this.toSafe(doc, now);
  }

  /** Put a renewed certificate (and key) on an existing device. The device id in the certificate must match. */
  async replaceCertificate(id: string, certificatePem: string, privateKeyPem: string): Promise<DeviceSafe> {
    const d = await this.mustGet(id);
    const { info, config } = await this.check(certificatePem, privateKeyPem, d.environment);
    if (info.deviceId !== d.deviceId) throw new RegistryError(`That certificate is for device ${info.deviceId}, not ${d.deviceId}`);
    const upd = {
      certificatePem: certificatePem.trim(),
      privateKeyEnc: this.box.encrypt(privateKeyPem.trim(), keyContext(d.deviceId)),
      keyType: info.keyType,
      certNotBefore: info.notBefore,
      certNotAfter: info.notAfter,
      config,
      updatedAt: new Date(),
    };
    await this.col.updateOne({ _id: d._id }, { $set: upd });
    return this.toSafe({ ...d, ...upd });
  }

  async setActive(id: string, active: boolean): Promise<DeviceSafe> {
    const d = await this.mustGet(id);
    await this.col.updateOne({ _id: d._id }, { $set: { active, updatedAt: new Date() } });
    return this.toSafe({ ...d, active });
  }

  async setSchedule(id: string, s: Omit<DeviceSchedule, "lastOpenDate" | "lastCloseDate">): Promise<DeviceSafe> {
    const d = await this.mustGet(id);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.openTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.closeTime)) throw new RegistryError("Times must be HH:mm", 400);
    try {
      new Intl.DateTimeFormat("en-GB", { timeZone: s.timezone });
    } catch {
      throw new RegistryError("Unknown time zone", 400);
    }
    const schedule: DeviceSchedule = { ...s, lastOpenDate: d.schedule?.lastOpenDate, lastCloseDate: d.schedule?.lastCloseDate };
    await this.col.updateOne({ _id: d._id }, { $set: { schedule, updatedAt: new Date() } });
    return this.toSafe({ ...d, schedule });
  }

  async markScheduleRun(id: string, step: "open" | "close", date: string): Promise<void> {
    await this.col.updateOne({ _id: new ObjectId(id) }, { $set: { [step === "open" ? "schedule.lastOpenDate" : "schedule.lastCloseDate"]: date } });
  }

  /** Active devices with a schedule that is switched on (for the scheduler). */
  async scheduled(): Promise<DeviceSafe[]> {
    const rows = await this.col.find({ active: true, "schedule.enabled": true }).toArray();
    return rows.map((d) => this.toSafe(d));
  }

  /** Everything the engine needs to start for a device, including the tenant. Never returned by the API. */
  async engineConfig(id: string): Promise<{ tenantId: string; config?: DeviceConfigSnapshot }> {
    const d = await this.mustGet(id);
    return { tenantId: d.tenantId, config: d.config };
  }

  async list(tenantId?: string): Promise<DeviceSafe[]> {
    const rows = await this.col.find(tenantId ? { tenantId } : {}).sort({ deviceId: 1 }).toArray();
    return rows.map((d) => this.toSafe(d));
  }

  async get(id: string): Promise<DeviceSafe | null> {
    const d = await this.find(id);
    return d ? this.toSafe(d) : null;
  }

  /** For the engine only: the decrypted identity used to talk to ZIMRA. Never returned by the API. */
  async identity(id: string): Promise<{ deviceId: number; serialNumber: string; environment: Environment; certificatePem: string; privateKeyPem: string }> {
    const d = await this.mustGet(id);
    if (!d.active) throw new RegistryError(`Device ${d.deviceId} is switched off`, 409);
    return {
      deviceId: d.deviceId,
      serialNumber: d.serialNumber,
      environment: d.environment,
      certificatePem: d.certificatePem,
      privateKeyPem: this.box.decrypt(d.privateKeyEnc, keyContext(d.deviceId)),
    };
  }

  private async find(id: string): Promise<DeviceDoc | null> {
    if (!ObjectId.isValid(id)) return null;
    return this.col.findOne({ _id: new ObjectId(id) });
  }

  private async mustGet(id: string): Promise<DeviceDoc> {
    const d = await this.find(id);
    if (!d) throw new RegistryError("Device not found", 404);
    return d;
  }
}
