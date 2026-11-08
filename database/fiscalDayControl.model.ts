import { Document, model, models, Schema } from "mongoose";

/**
 * One row per fiscal device, shared by every app instance.
 * - lock: only one fiscal-day close may run for a device at a time (cron and a manual close can overlap).
 * - fence: while a close is running, tills must not push new receipts at the device. They queue instead.
 */
export interface IFiscalDayControl {
  deviceKey: string;
  lockOwner?: string;
  lockedUntil?: Date;
  fenceUntil?: Date;
  /** Progress of "send waiting sales, then close": how many are done of how many, and when it started. */
  drainSent?: number;
  drainTotal?: number;
  drainStartedAt?: Date;
}

export interface IFiscalDayControlDoc extends IFiscalDayControl, Document {}

const FiscalDayControlSchema = new Schema<IFiscalDayControl>(
  {
    deviceKey: { type: String, required: true, unique: true },
    lockOwner: String,
    lockedUntil: Date,
    fenceUntil: Date,
    drainSent: Number,
    drainTotal: Number,
    drainStartedAt: Date,
  },
  { timestamps: true }
);

const FiscalDayControl =
  models?.FiscalDayControl || model<IFiscalDayControl>("FiscalDayControl", FiscalDayControlSchema);

export default FiscalDayControl;
