import { Worker } from "bullmq";
import { bullConnection } from "../config/bullConnection.js";
import { sendEmail } from "../utils/emailService.js";
import logger from "../utils/logger.js";

// Runs in-process rather than as a separate deployment - this app is small
// enough that a dedicated worker process/deployment would be premature;
// revisit if email volume or API responsiveness ever actually demands it.
export const emailWorker = new Worker(
  "email",
  async (job) => {
    await sendEmail(job.data);
  },
  {
    connection: bullConnection,
    concurrency: 5,
  }
);

emailWorker.on("failed", (job, err) => {
  logger.error({ err, jobId: job?.id, to: job?.data?.to }, "Email job failed");
});

emailWorker.on("error", (err) => {
  logger.error({ err }, "Email worker error");
});
