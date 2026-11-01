import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { db } from "./infrastructure/db.js";
import { log } from "./infrastructure/logger.js";
import { startWorkers } from "./workers/index.js";

const server = createApp().listen(env.PORT, () => log.info({ port: env.PORT }, "api listening"));
// Outlive the keep-alive of the proxies in front (Next rewrites, nginx): otherwise they reuse a socket
// Node already closed (default 5 s) and the request fails with ECONNRESET.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
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
