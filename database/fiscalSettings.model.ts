import { Document, model, models, Schema, Types } from "mongoose";

/** Singleton-style fiscal / ZIMRA configuration (admin-editable). */
export interface IFiscalSettings {
  zimraApiUrl?: string;
  /** When true, hostname has "test" removed (e.g. fdmsapitest → fdmsapi). */
  zimraUseProductionUrl?: boolean;
  deviceId?: string;
  deviceSerialNumber?: string;
  /** PEM client certificate (optional if using PFX). */
  clientCertPem?: string;
  /** PEM private key (optional if using PFX). */
  clientKeyPem?: string;
  /** Base64 PFX / PKCS#12 (optional alternative to PEM pair). */
  clientPfxBase64?: string;
  clientPfxPassphrase?: string;
  /**
   * clientKeyPem, clientPfxBase64 and clientPfxPassphrase are stored encrypted ("enc:v1:...").
   * Plain values are legacy rows; scripts/fiscal-encrypt-secrets.ts converts them.
   */

  /** Parsed from the stored device certificate when it is uploaded (never from the private key). */
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

  autoScheduleEnabled: boolean;
  autoCloseEnabled: boolean;
  autoOpenEnabled: boolean;
  /** What closing the day does about sales still without a fiscal receipt. Missing means send_first. */
  closeUnsentPolicy?: "send_first" | "stop";
  /** Local time in `timezone`, format HH:mm */
  closeTime: string;
  openTime: string;
  /** IANA timezone e.g. Africa/Harare */
  timezone: string;
  /** ISO weekdays 1 (Mon) — 7 (Sun); empty = every day */
  closeWeekdays: number[];
  openWeekdays: number[];

  lastAutoCloseDate?: string;
  lastAutoOpenDate?: string;

  /**
   * FISCAL_BACKEND=service: the FiscalDevice that acts as the central device (shop invoices and every branch
   * without its own device). Unset means the FISCAL_SERVICE_CENTRAL_DEVICE_ID environment setting.
   */
  centralFiscalDeviceId?: Types.ObjectId | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export interface IFiscalSettingsDoc extends IFiscalSettings, Document {}

const FiscalSettingsSchema = new Schema<IFiscalSettings>(
  {
    zimraApiUrl: { type: String },
    zimraUseProductionUrl: { type: Boolean, default: false },
    deviceId: { type: String },
    deviceSerialNumber: { type: String },
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

    autoScheduleEnabled: { type: Boolean, default: false },
    autoCloseEnabled: { type: Boolean, default: false },
    autoOpenEnabled: { type: Boolean, default: false },
    closeUnsentPolicy: { type: String, enum: ["send_first", "stop"], default: "send_first" },
    closeTime: { type: String, default: "00:00" },
    openTime: { type: String, default: "00:05" },
    timezone: { type: String, default: "Africa/Harare" },
    closeWeekdays: { type: [Number], default: [1, 2, 3, 4, 5, 6, 7] },
    openWeekdays: { type: [Number], default: [1, 2, 3, 4, 5, 6, 7] },

    lastAutoCloseDate: { type: String },
    lastAutoOpenDate: { type: String },

    centralFiscalDeviceId: { type: Schema.Types.ObjectId, ref: "FiscalDevice", default: null },
  },
  { timestamps: true }
);

const FiscalSettings =
  models?.FiscalSettings || model<IFiscalSettings>("FiscalSettings", FiscalSettingsSchema);

export default FiscalSettings;
