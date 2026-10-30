import "dotenv/config";
import { z } from "zod";

const optInt = z.preprocess((v) => (v === "" || v === undefined ? undefined : v), z.coerce.number().int().positive().optional());

export const env = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().url(),
    PORT: z.coerce.number().default(3000),
    JWT_SECRET: z.string().min(32),
    OTP_SECRET: z.string().min(32),
    CORS_ORIGIN: z.string().default("http://localhost:5173"),
    UPLOAD_DIR: z.string().default("./data/uploads"),
    STUDENT_EMAIL_DOMAIN: z.string().default("tezu.ac.in"),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_SECURE: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().default("T&P Cell <tnp@tezu.ac.in>"),
    SMTP_PER_DAY: optInt,
    SMTP_PER_MINUTE: optInt,
    WORKER: z.enum(["on", "off"]).default("on"),
  })
  .superRefine((e, ctx) => {
    if (e.NODE_ENV !== "production") return;
    for (const k of ["JWT_SECRET", "OTP_SECRET"] as const)
      if (e[k].includes("change-me")) ctx.addIssue({ code: "custom", path: [k], message: "placeholder secret; set one with: openssl rand -hex 32" });
    // Unset SMTP_HOST falls back to the JSON transport, which marks every mail as sent.
    if (!e.SMTP_HOST) ctx.addIssue({ code: "custom", path: ["SMTP_HOST"], message: "required in production" });
  })
  .parse(process.env);
