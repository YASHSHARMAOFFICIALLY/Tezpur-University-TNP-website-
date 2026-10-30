import { pino } from "pino";

// No PII: never log request bodies; redact auth headers.
export const log = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
  redact: ["req.headers.authorization", "req.headers.cookie"],
});
