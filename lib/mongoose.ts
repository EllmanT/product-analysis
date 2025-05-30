import mongoose, { Mongoose } from "mongoose";

import logger from "./logger";
import "@/database";

let MONGODB_URI = process.env.MONGODB_URI as string;
const OFFLINE_MONGODB_URI = process.env.OFFLINE_MONGODB_URI as string;
const NODE_ENV = process.env.NODE_ENV as string;

if (!MONGODB_URI) {
  throw new Error("Mongo URI is not defined");
}

console.log(OFFLINE_MONGODB_URI);
if (NODE_ENV !== "production") {
  MONGODB_URI = OFFLINE_MONGODB_URI;
  console.log(OFFLINE_MONGODB_URI);
  console.log(MONGODB_URI);
}

interface MongooseCache {
  con: Mongoose | null;
  promise: Promise<Mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongoose: MongooseCache;
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { con: null, promise: null };
}

const dbConnect = async (): Promise<Mongoose> => {
  if (cached.con) {
    logger.info("Using existing mongo");
    return cached.con;
  }
  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, {
        dbName: "stockflow",
      })
      .then((result) => {
        logger.info("Logged into mongodb");
        return result;
      })
      .catch((error) => {
        logger.error("Failed to connect to Mongodb", error);
        throw error;
      });
  }
  cached.con = await cached.promise;
  return cached.con;
};

export default dbConnect;
