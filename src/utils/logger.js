import pino from "pino";

// One structured (JSON) logger for the whole app, so log lines can actually
// be aggregated/queried/alerted on instead of being unstructured text spread
// across console.log/console.error. HTTP request logs additionally get a
// per-request child logger (req.log, via pino-http in index.js) already
// bound to that request's correlation id - this is the fallback for
// anything outside an HTTP request/response cycle (startup, socket
// handlers, background jobs).
const logger = pino({
  level: process.env.LOG_LEVEL || "info",
});

export default logger;
