import { Document, model, models, Schema } from "mongoose";

export type CloseAttemptOutcome = "closed" | "failed" | "blocked";

/** Every attempt to close a fiscal day, with why it failed. Failed closes were previously only a log line. */
export interface IFiscalCloseAttempt {
  deviceKey: string;
  source: "manual" | "scheduled";
  forced: boolean;
  outcome: CloseAttemptOutcome;
  /** Device-reported close error (CountersMismatch, ReceiptsWithValidationErrors, ...), when known. */
  errorCode?: string;
  message?: string;
  fiscalDayNo?: number | null;
  pendingSales?: number;
  deviceStatusAfter?: string;
  startedAt: Date;
  finishedAt: Date;
}

export interface IFiscalCloseAttemptDoc extends IFiscalCloseAttempt, Document {}

const FiscalCloseAttemptSchema = new Schema<IFiscalCloseAttempt>(
  {
    deviceKey: { type: String, required: true },
    source: { type: String, enum: ["manual", "scheduled"], required: true },
    forced: { type: Boolean, default: false },
    outcome: { type: String, enum: ["closed", "failed", "blocked"], required: true },
    errorCode: String,
    message: String,
    fiscalDayNo: { type: Number, default: null },
    pendingSales: Number,
    deviceStatusAfter: String,
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, required: true },
  },
  { timestamps: false }
);

FiscalCloseAttemptSchema.index({ deviceKey: 1, finishedAt: -1 });

const FiscalCloseAttempt =
  models?.FiscalCloseAttempt || model<IFiscalCloseAttempt>("FiscalCloseAttempt", FiscalCloseAttemptSchema);

export default FiscalCloseAttempt;
