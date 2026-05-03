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
    // #region agent log
    fetch("http://127.0.0.1:7467/ingest/2de68ee5-e25c-499c-9697-defc2dfd27b9", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "61e806",
      },
      body: JSON.stringify({
        sessionId: "61e806",
        runId: "pre-fix",
        hypothesisId: "H1",
        location: "lib/mongoose.ts:newConnection",
        message: "mongoose.connect invoked",
        data: {
          targetsLocalhost:
            /localhost|127\.0\.0\.1|:27017/.test(MONGODB_URI) &&
            !MONGODB_URI.includes("mongodb.net"),
          usesSrv: MONGODB_URI.startsWith("mongodb+srv"),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    cached.promise = mongoose
      .connect(MONGODB_URI, {
        dbName: "stockflow",
      })
      .then((result) => {
        logger.info("Logged into mongodb");
        return result;
      })
      .catch((error) => {
        cached.promise = null;
        const errObj = error as Error & {
          reason?: unknown;
          errorLabelSet?: unknown;
        };
        // #region agent log
        fetch(
          "http://127.0.0.1:7467/ingest/2de68ee5-e25c-499c-9697-defc2dfd27b9",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Debug-Session-Id": "61e806",
            },
            body: JSON.stringify({
              sessionId: "61e806",
              runId: "pre-fix",
              hypothesisId: "H2",
              location: "lib/mongoose.ts:catch",
              message: "mongoose.connect failed",
              data: {
                errName: errObj?.name,
                errMsg: String(errObj?.message ?? "").slice(0, 300),
                hasReasonKey: typeof errObj === "object" && errObj !== null &&
                  "reason" in errObj,
                reasonType:
                  typeof errObj?.reason === "object" && errObj?.reason !== null
                    ? (
                        errObj.reason as { constructor?: { name?: string } }
                      ).constructor?.name ?? "unknown"
                    : typeof errObj?.reason,
                clearedFailedPromise: true,
              },
              timestamp: Date.now(),
            }),
          }
        ).catch(() => {});
        // #endregion
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
