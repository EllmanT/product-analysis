import ExchangeRate, { IExchangeRate } from "@/database/exchangeRate.model";
import dbConnect from "@/lib/mongoose";
import { Types } from "mongoose";

interface ExchangeRateLean extends IExchangeRate {
  _id: Types.ObjectId;
}

export async function convertToUsd(amount: number, currency: string): Promise<number> {
  if (currency.toUpperCase() === "USD") return amount;

  await dbConnect();

  const record = await ExchangeRate.findOne({ currency: currency.toUpperCase() })
    .sort({ effectiveDate: -1, createdAt: -1 })
    .lean<ExchangeRateLean>();

  if (!record) {
    throw new Error(
      `No exchange rate found for ${currency.toUpperCase()} — please configure exchange rates in admin settings.`
    );
  }

  return amount / record.rate;
}

export async function convertFromUsd(usdAmount: number, currency: string): Promise<number> {
  if (currency.toUpperCase() === "USD") return usdAmount;

  await dbConnect();

  const record = await ExchangeRate.findOne({ currency: currency.toUpperCase() })
    .sort({ effectiveDate: -1, createdAt: -1 })
    .lean<ExchangeRateLean>();

  if (!record) {
    throw new Error(
      `No exchange rate found for ${currency.toUpperCase()} — please configure exchange rates in admin settings.`
    );
  }

  return usdAmount * record.rate;
}
