import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { randomUUID } from "node:crypto";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env.js";
import { db } from "./infrastructure/db.js";
import { errorMiddleware, fail } from "./middleware/errors.js";
import { log } from "./infrastructure/logger.js";
import { buildOpenApi, buildRouter } from "./http/route.js";
import { modules } from "./modules/index.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1); // behind nginx
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN.split(","), credentials: false }));
  app.use(express.json({ limit: "1mb" }));
  app.use(pinoHttp({ logger: log, genReqId: (req) => (req.headers["x-request-id"] as string) ?? randomUUID(), autoLogging: { ignore: (req) => req.url === "/healthz" } }));

  app.get("/healthz", (_req, res) => res.json({ ok: true }));
  app.get("/readyz", async (_req, res) => {
    await db.$queryRaw`select 1`;
    res.json({ ok: true });
  });

  const spec = buildOpenApi(modules);
  app.get("/api/v1/openapi.json", (_req, res) => res.json(spec));
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(spec));
  app.use("/api/v1", buildRouter(modules));
  app.use((_req, _res) => fail("NOT_FOUND"));
  app.use(errorMiddleware);
  return app;
}
