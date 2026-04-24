import IORedis from "ioredis";

/**
 * BullMQ needs a TCP Redis connection (`redis://` / `rediss://`), not the Upstash HTTP client.
 * Set BULLMQ_REDIS_URL or REDIS_URL to your Redis URL (e.g. Upstash “Redis” connection string).
 */
export function getBullmqConnection(): IORedis | null {
  const url = process.env.BULLMQ_REDIS_URL ?? process.env.REDIS_URL;
  if (!url) return null;
  if (!/^rediss?:\/\//i.test(url)) return null;
  return new IORedis(url, { maxRetriesPerRequest: null });
}
