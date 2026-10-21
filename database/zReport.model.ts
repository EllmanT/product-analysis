import { Document, model, models, Schema } from "mongoose";

export type ZReportSource = "manual" | "scheduled";

export interface IZReport {
  source: ZReportSource;
  closedAt: Date;
  fiscalDayNo: number | null;
  /** "central" or a FiscalDevice id. Missing on reports written before multi-device support (central). */
  fiscalDeviceKey?: string;
  deviceName?: string;
  deviceId?: string;
  totalSalesUsd: number | null;
  totalSalesZwg: number | null;
  rawCloseResponse: unknown;
}

export interface IZReportDoc extends IZReport, Document {}

const ZReportSchema = new Schema<IZReport>(
  {
    source: { type: String, enum: ["manual", "scheduled"], required: true },
    closedAt: { type: Date, required: true },
    fiscalDayNo: { type: Number, default: null },
    fiscalDeviceKey: { type: String },
    deviceName: { type: String },
    deviceId: { type: String },
    totalSalesUsd: { type: Number, default: null },
    totalSalesZwg: { type: Number, default: null },
    rawCloseResponse: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

ZReportSchema.index({ closedAt: -1 });
ZReportSchema.index({ fiscalDeviceKey: 1, closedAt: -1 });

const ZReport = models?.ZReport || model<IZReport>("ZReport", ZReportSchema);

export default ZReport;
