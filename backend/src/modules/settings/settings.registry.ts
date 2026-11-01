// THE list of admin-editable settings. Secrets never belong here: they stay in .env.
// A setting is read with getSetting(key), typed from its schema; the settings table holds overrides only.
import { z } from "zod";
import { env } from "../../config/env.js";
import { FILE_POLICY, MB } from "../../middleware/upload.js";

type Def<S extends z.ZodType> = { schema: S; default: z.output<S>; label: string; help: string; unit: string };
const def = <S extends z.ZodType>(d: Def<S>) => d;

const cap = z.number().int().min(0).nullable();
const mbUpTo = (bytes: number) => z.number().positive().max(bytes / MB);
const capMb = Object.fromEntries(Object.entries(FILE_POLICY).map(([k, p]) => [k, p.maxBytes / MB])) as Record<keyof typeof FILE_POLICY, number>;

export const SETTINGS = {
  email_daily_cap: def({
    schema: cap,
    default: env.SMTP_PER_DAY ?? null,
    label: "Emails per day",
    help: "Most emails the portal sends in 24 hours; leave empty for no limit (university relay), use 450 for Gmail, 0 pauses all email.",
    unit: "emails/day",
  }),
  email_per_minute_cap: def({
    schema: cap,
    default: env.SMTP_PER_MINUTE ?? null,
    label: "Emails per minute",
    help: "Most emails the portal sends in one minute; leave empty for no limit, use 20 for Gmail.",
    unit: "emails/minute",
  }),
  alumni_cutoff: def({
    schema: z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "use MM-DD, e.g. 07-01"),
    default: "07-01",
    label: "Alumni date",
    help: "Each year on this date, students whose year of completion has passed become alumni (read-only).",
    unit: "MM-DD",
  }),
  otp_expiry_minutes: def({
    schema: z.number().int().min(5).max(60),
    default: 10,
    label: "Email code lifetime",
    help: "How long a sign-up or password-reset code stays valid after it is emailed.",
    unit: "minutes",
  }),
  student_email_domain: def({
    schema: z.hostname().toLowerCase(),
    default: env.STUDENT_EMAIL_DOMAIN,
    label: "Student email domain",
    help: "Students can only sign up, or be imported by CSV, with an email address ending in @ this domain.",
    unit: "domain",
  }),
  upload_max_mb: def({
    schema: z.object({ resume: mbUpTo(FILE_POLICY.resume.maxBytes), photo: mbUpTo(FILE_POLICY.photo.maxBytes), jd: mbUpTo(FILE_POLICY.jd.maxBytes), brochure: mbUpTo(FILE_POLICY.brochure.maxBytes) }),
    default: capMb,
    label: "Upload size limits",
    help: `Largest file accepted for each kind of upload; each can only be lowered below the built-in maximum (resume ${capMb.resume}, photo ${capMb.photo}, JD ${capMb.jd}, brochure ${capMb.brochure}).`,
    unit: "MB",
  }),
};

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.output<(typeof SETTINGS)[K]["schema"]>;
export const SETTING_KEYS = Object.keys(SETTINGS) as [SettingKey, ...SettingKey[]];
