import Redis from "ioredis";
import { redisOptions } from "./env.js";

// BullMQ's internal blocking commands require maxRetriesPerRequest: null - a
// finite retry limit (as the shared redisClient elsewhere in this app uses,
// deliberately, so refresh-token lookups fail fast) breaks BullMQ's own
// retry/backoff behavior. This is a separate connection specifically
// because that requirement conflicts with the shared client's config, not
// an unnecessary duplicate.
export const bullConnection = new Redis(...redisOptions({ maxRetriesPerRequest: null }));
