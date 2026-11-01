// Background work for this process: the job runner plus the hourly check that enqueues daily jobs.
import { log } from "../infrastructure/logger.js";
import { jobs } from "../modules/index.js";
import { scheduleDailyJobs } from "../modules/students/students.service.js";
import { scheduleSystemJobs } from "../modules/system/system.service.js";
import { startWorker } from "./runner.js";

export async function startWorkers() {
  const worker = startWorker(jobs);
  const daily = () => Promise.all([scheduleDailyJobs(), scheduleSystemJobs()]);
  await daily();
  const timer = setInterval(() => void daily().catch((err) => log.error({ err }, "daily schedule failed")), 60 * 60_000);
  return {
    async stop() {
      clearInterval(timer);
      await worker.stop();
    },
  };
}
