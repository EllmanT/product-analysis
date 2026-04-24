import { Document, model, models, Schema } from "mongoose";

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

  autoScheduleEnabled: boolean;
  autoCloseEnabled: boolean;
  autoOpenEnabled: boolean;
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

const FiscalSettings =
  models?.FiscalSettings || model<IFiscalSettings>("FiscalSettings", FiscalSettingsSchema);

export default FiscalSettings;
