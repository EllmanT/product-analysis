import { Document, model, models, Schema } from "mongoose";

export type ZReportSource = "manual" | "scheduled";

export interface IZReport {
  source: ZReportSource;
  closedAt: Date;
  fiscalDayNo: number | null;
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
    totalSalesUsd: { type: Number, default: null },
    totalSalesZwg: { type: Number, default: null },
    rawCloseResponse: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

ZReportSchema.index({ closedAt: -1 });

const ZReport = models?.ZReport || model<IZReport>("ZReport", ZReportSchema);

export default ZReport;
