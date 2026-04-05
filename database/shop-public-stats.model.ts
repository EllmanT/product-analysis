import mongoose, { Schema, model, models, type Document } from "mongoose";

export interface IShopPublicStats extends Document {
  key: string;
  totalVisits: number;
}

const ShopPublicStatsSchema = new Schema<IShopPublicStats>(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    totalVisits: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const ShopPublicStats =
  (models.ShopPublicStats as mongoose.Model<IShopPublicStats>) ||
  model<IShopPublicStats>("ShopPublicStats", ShopPublicStatsSchema);

export default ShopPublicStats;
