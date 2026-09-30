import { Queue } from "bullmq";
import { bullConnection } from "../config/bullConnection.js";

// Email used to be sent inline in the request path (password reset, room
// invites) or fire-and-forget with no retry (contact form) - a slow or
// transiently-failing Postmark request either blocked the HTTP response or
// silently lost the email. Queuing moves the send off the request path
// entirely and gives it real retry/backoff instead of a single attempt.
export const emailQueue = new Queue("email", {
  connection: bullConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});
