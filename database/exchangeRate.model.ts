import { Document, model, models, Schema } from "mongoose";

export interface IExchangeRate {
  currency: string;
  rate: number;
  effectiveDate: Date;
  notes?: string;
}

export interface IExchangeRateDoc extends IExchangeRate, Document {}

const ExchangeRateSchema = new Schema<IExchangeRate>(
  {
    currency: { type: String, required: true, uppercase: true, trim: true },
    rate: { type: Number, required: true },
    effectiveDate: { type: Date, required: true },
    notes: { type: String },
  },
  { timestamps: true }
);

const ExchangeRate =
  models?.ExchangeRate || model<IExchangeRate>("ExchangeRate", ExchangeRateSchema);

export default ExchangeRate;
