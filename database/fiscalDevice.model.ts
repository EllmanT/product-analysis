import { Document, model, models, Schema } from "mongoose";

/**
 * A branch-specific ZIMRA virtual fiscal device. The central device keeps living in FiscalSettings;
 * a branch uses one of these only when `Branch.pos.fiscalDeviceId` points at it.
 *
 * Each device has its own fiscal day, receipt counters, certificate, login and schedule.
 * clientKeyPem, clientPfxBase64, clientPfxPassphrase and vdPassword are stored encrypted ("enc:v1:...").
 */
export interface IFiscalDevice {
  /** Shown in the admin UI and on Z-reports, e.g. "Bulawayo till device". */
  name: string;
  /** Inactive devices are skipped by the scheduler and refuse new receipts. */
  active: boolean;

  zimraApiUrl?: string;
  zimraUseProductionUrl?: boolean;
  deviceId?: string;
  deviceSerialNumber?: string;

  clientCertPem?: string;
  clientKeyPem?: string;
  clientPfxBase64?: string;
  clientPfxPassphrase?: string;
  certSubject?: string;
  certSerial?: string;
  certFingerprint256?: string;
  certNotBefore?: Date;
  certNotAfter?: Date;

  /** Gateway headers: the model name/version ZIMRA registered this device under (defaults: env, then Server / v1). */
  deviceModelName?: string;
  deviceModelVersion?: string;
  /**
   * Renew the certificate by itself when 30 days or less remain. OFF unless an admin turns it on:
   * ZIMRA revokes the old certificate the moment it issues the new one, so anything else holding the
   * old copy (e.g. a Virtual Device with its own certificate) stops working at once.
   */
  autoRenewCertificate?: boolean;
  /** A renewal in flight: the new key (encrypted) and the certificate ZIMRA issued, kept until verified. */
  pendingKeyPem?: string;
  pendingCertPem?: string;
  renewalLockedAt?: Date;
  lastRenewalAt?: Date;
  lastRenewalAttemptAt?: Date;
  lastRenewalError?: string;

  /** Login for this device's Axis Virtual Device (POST /api/Auth/login). Optional. */
  vdEmail?: string;
  vdPassword?: string;

  autoScheduleEnabled: boolean;
  autoCloseEnabled: boolean;
  autoOpenEnabled: boolean;
  closeTime: string;
  openTime: string;
  timezone: string;
  closeWeekdays: number[];
  openWeekdays: number[];
  lastAutoCloseDate?: string;
  lastAutoOpenDate?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export interface IFiscalDeviceDoc extends IFiscalDevice, Document {}

const FiscalDeviceSchema = new Schema<IFiscalDevice>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    active: { type: Boolean, default: true },

    zimraApiUrl: { type: String, trim: true },
    zimraUseProductionUrl: { type: Boolean, default: false },
    deviceId: { type: String, trim: true },
    deviceSerialNumber: { type: String, trim: true },

    clientCertPem: { type: String },
    clientKeyPem: { type: String },
    clientPfxBase64: { type: String },
    clientPfxPassphrase: { type: String },
    certSubject: { type: String },
    certSerial: { type: String },
    certFingerprint256: { type: String },
    certNotBefore: { type: Date },
    certNotAfter: { type: Date },

    deviceModelName: { type: String, trim: true },
    deviceModelVersion: { type: String, trim: true },
    autoRenewCertificate: { type: Boolean, default: false },
    pendingKeyPem: { type: String },
    pendingCertPem: { type: String },
    renewalLockedAt: { type: Date },
    lastRenewalAt: { type: Date },
    lastRenewalAttemptAt: { type: Date },
    lastRenewalError: { type: String },

    vdEmail: { type: String, trim: true },
    vdPassword: { type: String },

    autoScheduleEnabled: { type: Boolean, default: false },
    autoCloseEnabled: { type: Boolean, default: false },
    autoOpenEnabled: { type: Boolean, default: false },
    closeTime: { type: String, default: "00:00" },
    openTime: { type: String, default: "00:05" },
    timezone: { type: String, default: "Africa/Harare" },
    closeWeekdays: { type: [Number], default: [1, 2, 3, 4, 5, 6, 7] },
    openWeekdays: { type: [Number], default: [1, 2, 3, 4, 5, 6, 7] },
    lastAutoCloseDate: { type: String },
    lastAutoOpenDate: { type: String },
  },
  { timestamps: true }
);

FiscalDeviceSchema.index({ name: 1 }, { unique: true });
// One physical device has one fiscal day, so two records must never describe the same device.
FiscalDeviceSchema.index(
  { deviceId: 1 },
  { unique: true, partialFilterExpression: { deviceId: { $type: "string", $gt: "" } } }
);

const FiscalDevice = models?.FiscalDevice || model<IFiscalDevice>("FiscalDevice", FiscalDeviceSchema);
export default FiscalDevice;
