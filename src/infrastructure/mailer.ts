import nodemailer from "nodemailer";
import { z } from "zod";
import { env } from "../config/env.js";
import type { Tx } from "./db.js";
import { log } from "./logger.js";
import { defineJob, enqueue } from "./queue.js";
import { getSetting } from "../modules/settings/settings.service.js";

// The one email job: every module sends mail through `mail()`.
// Zero paid services: plain SMTP, configured only by env. University relay (no quota) or Gmail
// with an app password (email_daily_cap 450, see settings.registry.ts). SMTP_HOST unset -> mail is logged, not sent.
const transport = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
  : nodemailer.createTransport({ jsonTransport: true });

const EmailPayload = z.object({ to: z.email(), subject: z.string(), text: z.string() });
export type Email = z.infer<typeof EmailPayload>;

export const sendEmail = defineJob({
  type: "email.send",
  payload: EmailPayload,
  maxAttempts: 6,
  throttle: async () => ({ perDay: await getSetting("email_daily_cap"), perMinute: await getSetting("email_per_minute_cap") }),
  redact: (p) => ({ to: p.to, subject: "", text: "" }),
  run: async (p) => {
    const info = await transport.sendMail({ from: env.SMTP_FROM, ...p });
    if (!env.SMTP_HOST) log.info({ to: p.to, subject: p.subject }, "email (SMTP_HOST unset, not sent)");
    return { messageId: info.messageId };
  },
});

/** Queue one email in the caller's transaction. priority 0 for login codes so bulk mail never delays them. */
export const mail = (tx: Tx, email: Email, opts?: { priority?: number; dedupeKey?: string }) => enqueue(tx, sendEmail, email, opts);
