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
export const createRateLimiter = (options) =>
  rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      sendCommand: (...args) => redisClient.call(...args),
    }),
    ...options,
  });
