import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import redisClient from "./redisClient.js";

// Backed by the shared Redis instance rather than express-rate-limit's
// default in-memory store - an in-memory store counts requests per process,
// so running more than one app instance behind a load balancer would let
// each instance independently allow up to the configured limit, silently
// multiplying the effective limit by however many instances are running.
//
// This runs at route-module import time (before the app finishes booting),
// which is safe as long as the shared Redis client already has real
// credentials by then - see the dotenv-ordering comment at the top of
// index.js. (A lazy-construct-on-first-request version was tried instead,
// but express-rate-limit's own ERR_ERL_CREATED_IN_REQUEST_HANDLER check
// rejects constructing a limiter from inside a request handler at all,
// even a cached one - so that isn't a viable workaround.)
//
// `name` must be unique per limiter: it becomes the Redis key prefix. Every
// limiter used to share rate-limit-redis's default "rl:" prefix, so they all
// counted into ONE per-IP key - e.g. 21 chat uploads exhausted the login
// limit (20) for that IP.
export const createRateLimiter = ({ name, ...options }) => {
  if (!name) throw new Error("createRateLimiter requires a unique `name`");
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      prefix: `rl:${name}:`,
      sendCommand: (...args) => redisClient.call(...args),
    }),
    ...options,
  });
};
