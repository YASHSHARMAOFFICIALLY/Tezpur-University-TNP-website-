import type { Tone } from "@/components/ui";
import type { paths } from "@/lib/api-types";

type Json<P extends keyof paths, M extends "get"> = paths[P][M] extends {
  responses: { 200: { content: { "application/json": infer T } } };
}
  ? T
  : never;

export type Posting = Json<"/api/v1/company/opportunities", "get">["data"][number];
export type Applicant = Json<"/api/v1/company/opportunities/{id}/applicants", "get">["data"][number];
export type Company = Json<"/api/v1/companies/me", "get">;
export type FeedbackForm = Json<"/api/v1/feedback", "get">[number];
export type DriveMode = NonNullable<Posting["drive_mode"]>;
export type Round = keyof Posting["selection_process"];

export const POSTING_TONE: Record<Posting["status"], Tone> = {
  draft: "muted",
  pending_admin: "warn",
  approved: "info",
  rejected: "error",
  closed: "soft",
};
const POSTING_LABEL: Record<Posting["status"], string> = {
  draft: "Draft",
  pending_admin: "Awaiting T&P approval",
  approved: "Live to students",
  rejected: "Rejected",
  closed: "Closed",
};
export const postingLabel = (p: Posting) => (p.status === "draft" && p.review_note ? "Returned for edits" : POSTING_LABEL[p.status]);

export const STAGE_LABEL: Record<Applicant["status"], string> = {
  released_to_recruiter: "Released by T&P",
  shortlisted: "Shortlisted",
  rejected: "Rejected",
  selected: "Selected / Offer",
};

export const DRIVE_MODE: Record<DriveMode, string> = { online: "Online", offline: "Offline", hybrid: "Hybrid (mix)" };

/** Labels for the backend's selection_process flags, in drive order. */
export const ROUND_LABEL: Record<Round, string> = {
  shortlist_from_resumes: "Resume Shortlisting",
  online_test: "Online Test",
  written_test: "Written Test",
  group_discussion: "Group Discussion",
  technical_interview: "Technical Interview",
  hr_interview: "HR Interview",
};
export const ROUNDS = Object.keys(ROUND_LABEL) as Round[];

const fmtMonth = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleString("en-IN", { month: "short", year: "numeric" });

/** "Jan 2027" or "Jan 2027 – Mar 2027" from YYYY-MM months; null without a start. */
export function monthRange(from: string | null, to: string | null) {
  if (!from) return null;
  return to && to !== from ? `${fmtMonth(from)} – ${fmtMonth(to)}` : fmtMonth(from);
}
export const hiringPeriod = (p: Pick<Posting, "hiring_from" | "hiring_to">) => monthRange(p.hiring_from, p.hiring_to);
