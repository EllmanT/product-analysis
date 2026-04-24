import mongoose, { Mongoose } from "mongoose";

import logger from "./logger";
import "@/database";

let MONGODB_URI = (process.env.MONGODB_URI ?? "").trim();
const OFFLINE_MONGODB_URI = (process.env.OFFLINE_MONGODB_URI ?? "").trim();
const NODE_ENV = process.env.NODE_ENV as string;

if (!MONGODB_URI) {
  throw new Error("Mongo URI is not defined");
}

if (NODE_ENV !== "production") {
  MONGODB_URI = OFFLINE_MONGODB_URI;
  if (!MONGODB_URI) {
    throw new Error("OFFLINE_MONGODB_URI is not defined for non-production");
  }
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
        const msg = error instanceof Error ? error.message : String(error);
        logger.error("Failed to connect to Mongodb", error);
        if (msg.includes("querySrv") || msg.includes("ENOTFOUND")) {
          logger.error(
            "MongoDB DNS failed: the host in MONGODB_URI is not a real Atlas cluster (wrong URL, deleted cluster, or typo). In Atlas: Database → your cluster → Connect → copy a fresh connection string and update Vercel MONGODB_URI."
          );
        }
        throw error;
      });
  }
  cached.con = await cached.promise;
  return cached.con;
};

export default dbConnect;
