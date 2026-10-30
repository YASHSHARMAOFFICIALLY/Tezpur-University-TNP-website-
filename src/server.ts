import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { db } from "./infrastructure/db.js";
import { log } from "./infrastructure/logger.js";
import { startWorkers } from "./workers/index.js";

const server = createApp().listen(env.PORT, () => log.info({ port: env.PORT }, "api listening"));
const workers = env.WORKER === "on" ? await startWorkers() : undefined;

async function shutdown() {
  log.info("shutting down");
  server.close();
  await workers?.stop();
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
