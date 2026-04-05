import mongoose, { Schema, model, models, type Document, type Types } from "mongoose";

export interface IHomepageConfig extends Document {
  promotionalProductIds: Types.ObjectId[];
  featuredText: string;
  bannerText: string;
}

const HomepageConfigSchema = new Schema<IHomepageConfig>(
  {
    promotionalProductIds: {
      type: [Schema.Types.ObjectId],
      ref: "ProductMaster",
      default: [],
    },
    featuredText: { type: String, default: "" },
    bannerText: { type: String, default: "" },
  },
  { timestamps: true }
);

const HomepageConfig =
  (models.HomepageConfig as mongoose.Model<IHomepageConfig>) ||
  model<IHomepageConfig>("HomepageConfig", HomepageConfigSchema);

export default HomepageConfig;
