const IN = "en-IN";

export const fmtDate = (iso?: string | null, withTime = false) =>
  iso
    ? new Date(iso).toLocaleString(IN, {
        day: "numeric",
        month: "short",
        year: withTime ? undefined : "numeric",
        ...(withTime && { hour: "2-digit", minute: "2-digit" }),
      })
    : "—";

/** "in 18 hrs" / "in 3 days" / "closed" */
export function timeLeft(iso: string) {
  const h = (new Date(iso).getTime() - Date.now()) / 36e5;
  if (h <= 0) return "closed";
  return h < 48 ? `in ${Math.ceil(h)} hrs` : `in ${Math.ceil(h / 24)} days`;
}

type Reason = { rule?: unknown; required?: unknown; actual?: unknown };
export function reasonText(r: Reason) {
  switch (r.rule) {
    case "min_cgpa":
      return `Cutoff CGPA ≥ ${r.required}${r.actual != null ? ` (yours ${r.actual})` : ""}`;
    case "programmes":
      return "Your programme isn't eligible";
    case "completion_years":
      return "Your batch isn't eligible";
    case "max_age":
      return `Age limit ${r.required}`;
    default:
      return String(r.rule ?? "Not eligible");
  }
}

export const APP_STATUS: Record<string, { label: string; tone: "info" | "soft" | "warn" | "error" | "primary" }> = {
  applied: { label: "Applied • Awaiting T&P Release", tone: "soft" },
  released_to_recruiter: { label: "CV Verified • With Recruiter", tone: "info" },
  shortlisted: { label: "Shortlisted", tone: "warn" },
  rejected: { label: "Not Selected", tone: "error" },
  selected: { label: "Selected • Offer", tone: "primary" },
};

export const initialsOf = (s: string) =>
  s
    .split(/\s+/)
    .filter((w) => /^[a-z]/i.test(w))
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
