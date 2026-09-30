import Redis from "ioredis";

// BullMQ's internal blocking commands require maxRetriesPerRequest: null - a
// finite retry limit (as the shared redisClient elsewhere in this app uses,
// deliberately, so refresh-token lookups fail fast) breaks BullMQ's own
// retry/backoff behavior. This is a separate connection specifically
// because that requirement conflicts with the shared client's config, not
// an unnecessary duplicate.
export const bullConnection = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
});
