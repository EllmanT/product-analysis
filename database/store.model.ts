import { Document, model, models, Schema } from "mongoose";

// validation for the ide 
// validation for the developer while we type code
export interface IStore {
  name: string;
}

export interface IStoreDoc extends IStore, Document {}
// validation for the backend
// validation for the mongoose schema
const StoreSchema = new Schema<IStore>(
  {
    name: { type: String, required: true },
  },
  {
    timestamps: true,
  }
);
const Store = models?.Store || model<IStore>("Store", StoreSchema);

export default Store;
