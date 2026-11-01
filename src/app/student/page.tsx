"use client";

import { useState } from "react";
import useSWR from "swr";
import { AppShell, type NavItem } from "@/components/AppShell";
import { Badge, Button, Card, Empty, Field, Icon, Input, Select, State, Textarea, cx } from "@/components/ui";
import { api, call, fileBody, fileUrl, openFile, type ApiError } from "@/lib/api";
import type { components } from "@/lib/api-types";
import { APP_STATUS, fmtDate, initialsOf, reasonText, timeLeft } from "@/lib/format";

type Paths = import("@/lib/api-types").paths;
type Opp = Paths["/api/v1/opportunities"]["get"]["responses"]["200"]["content"]["application/json"]["data"][number];
type App = Paths["/api/v1/applications/mine"]["get"]["responses"]["200"]["content"]["application/json"]["data"][number];
type Ev = Paths["/api/v1/events"]["get"]["responses"]["200"]["content"]["application/json"]["data"][number];
type Profile = components["schemas"]["StudentProfile"];

const NAV: NavItem[] = [
  { label: "My Placement Hub", icon: "dashboard", href: "#profile" },
  { label: "Application Tracker", icon: "conversion_path", href: "#tracker" },
  { label: "Final Placements", icon: "work", href: "#placements" },
  { label: "Internships", icon: "school", href: "#internships" },
  { label: "Training & Workshops", icon: "lightbulb", href: "#training" },
  { label: "Notices", icon: "campaign", href: "#notices" },
];

const useProfile = () => useSWR("students/me", () => call(api.GET("/api/v1/students/me")));
const useApps = () => useSWR("applications/mine", () => call(api.GET("/api/v1/applications/mine", { params: { query: { limit: 100 } } })));

export default function StudentPage() {
  return (
    <AppShell role="student" nav={NAV} active="#profile">
      <div className="mx-auto flex max-w-[976px] flex-col gap-5">
        <NoticeBanner />
        <ProfileCard />
        <div className="grid gap-5 lg:grid-cols-[1fr_312px]">
          <div className="flex min-w-0 flex-col gap-5">
            <Tracker />
            <Opportunities />
            <Benchmark />
          </div>
          <div className="flex flex-col gap-5">
            <Dossier />
            <Certifications />
            <Helpdesk />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function NoticeBanner() {
  const { data, error } = useSWR("noticeboard", () => call(api.GET("/api/v1/noticeboard", { params: { query: { limit: 100 } } })));
  const [all, setAll] = useState(false);
  if (error || !data?.data.length) return <span id="notices" />;
  const list = all ? data.data : data.data.slice(0, 1);
  return (
    <section id="notices" className="flex scroll-mt-24 flex-col gap-2 rounded-lg bg-accent/15 p-3 shadow-card">
      {list.map((n) => (
        <div key={n.id}>
          <p className="flex items-start gap-2 text-[14px] leading-5 text-primary">
            <Icon name="campaign" className="text-[20px] text-tertiary" />
            <span>
              <strong className="font-semibold">{n.title}:</strong> {n.body}
            </span>
          </p>
          <p className="flex items-center gap-1 pl-7 text-label font-semibold text-tertiary">
            <Icon name="schedule" /> Posted {fmtDate(n.published_at, true)}
          </p>
        </div>
      ))}
      {data.data.length > 1 && (
        <button onClick={() => setAll(!all)} className="w-fit pl-7 text-label font-semibold text-primary underline cursor-pointer">
          {all ? "Show latest only" : `Show all ${data.data.length} notices`}
        </button>
      )}
    </section>
  );
}

function Photo({ id, name }: { id: string | null | undefined; name: string }) {
  const { data: src } = useSWR(id ? ["file", id] : null, () => fileUrl(id!));
  return (
    <div className="relative size-28 shrink-0">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- blob: URL from an authenticated download
        <img src={src} alt={name} className="size-28 rounded-sm object-cover" />
      ) : (
        <div className="grid size-28 place-items-center rounded-sm bg-[#751515] font-display text-headline font-bold text-white">{initialsOf(name)}</div>
      )}
      <span className="absolute -right-1.5 -bottom-1.5 grid size-6 place-items-center rounded-xl bg-primary text-white shadow-card ring-2 ring-white">
        <Icon name="verified" className="text-[14px]" filled />
      </span>
    </div>
  );
}

function ProfileCard() {
  const p = useProfile();
  const progs = useSWR("programmes", () => call(api.GET("/api/v1/programmes")));
  const [editing, setEditing] = useState(false);
  return (
    <Card className="relative scroll-mt-24 overflow-hidden p-5">
      <span id="profile" className="absolute -top-24" />
      <div className="pointer-events-none absolute -top-16 right-24 size-64 rounded-xl bg-primary-fixed/30 blur-3xl" />
      <div className="pointer-events-none absolute right-0 bottom-0 size-48 rounded-xl bg-tertiary-fixed/40 blur-3xl" />
      <State data={p.data} error={p.error} retry={() => p.mutate()} rows={4}>
        {(s) => {
          const prog = progs.data?.find((x) => x.id === s.programme_id);
          const sem = s.year_of_admission ? Math.min(8, (new Date().getFullYear() - s.year_of_admission) * 2 + (new Date().getMonth() >= 6 ? 1 : 0)) : null;
          return (
            <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <Photo id={s.photo_file_id} name={s.user.name} />
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap gap-1">
                    <Badge tone="soft" className="rounded-xl uppercase">Enrolment: {s.enrolment_no}</Badge>
                    {s.academic_standing === "probation" ? (
                      <Badge tone="error" icon="block" className="rounded-xl">Academic Probation</Badge>
                    ) : (
                      <Badge tone="info" icon="verified" className="rounded-xl bg-primary/10">TPO Verified Profile</Badge>
                    )}
                    {s.user.status === "alumni" && <Badge tone="warn" className="rounded-xl">Alumnus • Read only</Badge>}
                  </div>
                  <h1 className="font-display text-headline font-bold text-primary">{s.user.name}</h1>
                  <p className="max-w-[260px] text-body-lg leading-5 text-muted sm:max-w-none">
                    {prog?.name ?? s.department ?? "Programme not set"}
                    {sem ? ` • ${sem}th Semester` : ""} • Tezpur University
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <span className="flex items-baseline gap-1.5 rounded-xs bg-surface-low px-2 py-1 text-label text-muted">
                      Cumulative CGPA <b className="font-display text-title text-primary">{s.cgpa ?? "—"}</b> / 10.0
                    </span>
                    <span className="flex items-center gap-1 rounded-xs bg-surface-low px-2 py-1 text-label font-semibold text-primary">
                      <Icon name="check_circle" /> Zero Active Backlogs
                    </span>
                  </div>
                  <div className="flex items-center gap-3 pt-2">
                    {s.resume_file_id ? (
                      <button onClick={() => openFile(s.resume_file_id!)} className="flex items-center gap-1 rounded-xs bg-surface-high px-2 py-1 text-label font-semibold text-primary cursor-pointer">
                        <Icon name="picture_as_pdf" /> Verified CV.pdf
                      </button>
                    ) : (
                      <Badge tone="error" icon="warning">Resume not uploaded</Badge>
                    )}
                    {s.linkedin_url && (
                      <a href={s.linkedin_url} target="_blank" rel="noreferrer" aria-label="LinkedIn" className="text-muted">
                        <Icon name="language" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-start gap-3 md:items-end">
                <Button size="sm" icon="edit" onClick={() => setEditing(true)} disabled={s.user.status === "alumni"}>
                  Edit Profile &amp; Documents
                </Button>
                {editing && <EditProfile s={s} programmes={progs.data ?? []} onClose={() => (setEditing(false), p.mutate())} />}
                <button
                  disabled
                  title="Alumni transition runs automatically after your year of completion"
                  className="flex items-center gap-1 rounded-xs bg-surface-high px-3 py-1 text-label font-semibold text-ink shadow-card disabled:opacity-80"
                >
                  <Icon name="swap_horiz" className="text-tertiary" /> Switch to Alumni Transition Module
                </button>
                <div className="md:text-right">
                  <p className="text-caption font-semibold text-muted uppercase">Placement Quota Status</p>
                  <QuotaStatus />
                </div>
              </div>
            </div>
          );
        }}
      </State>
    </Card>
  );
}

type Programme = Paths["/api/v1/programmes"]["get"]["responses"]["200"]["content"]["application/json"][number];

/** Not in Figma: needed so a student can meet PROFILE_REQUIRED (photo, resume, CGPA, DOB, programme, batch) and apply. */
function EditProfile({ s, programmes, onClose }: { s: Profile; programmes: Programme[]; onClose: () => void }) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const g = (k: string) => String(fd.get(k) ?? "").trim();
    const num = (k: string) => (g(k) ? Number(g(k)) : undefined);
    setBusy(true);
    setErr("");
    try {
      const photo = fd.get("photo") as File;
      const resume = fd.get("resume") as File;
      if (photo?.size) await call(api.POST("/api/v1/students/me/photo", fileBody(photo)));
      if (resume?.size) await call(api.POST("/api/v1/students/me/resume", fileBody(resume)));
      await call(
        api.PATCH("/api/v1/students/me", {
          body: {
            mobile: g("mobile") || undefined,
            dob: g("dob") || undefined,
            programme_id: g("programme_id") || undefined,
            year_of_admission: num("year_of_admission"),
            year_of_completion: num("year_of_completion"),
            cgpa: num("cgpa"),
            category: g("category") || undefined,
            regional_diversity: g("regional_diversity") || undefined,
            jee_rank: num("jee_rank"),
            marks_10: num("marks_10"),
            marks_12: num("marks_12"),
            current_address: g("current_address") || undefined,
            professional_interests: g("professional_interests") || undefined,
            certifications: g("certifications") || undefined,
            linkedin_url: g("linkedin_url") || undefined,
          },
        }),
      );
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  const f = "bg-surface-low shadow-none";
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-primary/30" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={submit} role="dialog" aria-modal aria-label="Edit profile" className="flex h-full w-full max-w-[544px] flex-col bg-white text-left shadow-pop">
        <div className="flex items-start justify-between bg-primary px-5 py-5 text-white">
          <div>
            <h2 className="font-display text-title font-semibold">Edit Profile &amp; Documents</h2>
            <p className="text-caption font-semibold text-surface-high">Photo, resume, CGPA, DOB, programme and batch are required before applying.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="cursor-pointer">
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>
        <div className="grid flex-1 grid-cols-2 content-start gap-3 overflow-y-auto p-5">
          <Field label="Coloured Photo (JPEG/PNG, ≤2 MB)" hint={s.photo_file_id ? "Uploaded. Choose a file to replace." : "Required"}>
            <Input name="photo" type="file" accept="image/jpeg,image/png" className="py-1.5" />
          </Field>
          <Field label="Resume (PDF, ≤5 MB)" hint={s.resume_file_id ? "Uploaded. Choose a file to replace." : "Required"}>
            <Input name="resume" type="file" accept="application/pdf" className="py-1.5" />
          </Field>
          <Field label="Date of Birth *">
            <Input name="dob" type="date" required defaultValue={s.dob?.slice(0, 10)} className={f} />
          </Field>
          <Field label="Cumulative CGPA *">
            <Input name="cgpa" type="number" step="0.01" min="0" max="10" required defaultValue={s.cgpa ?? ""} className={f} />
          </Field>
          <Field label="Programme *" className="col-span-2">
            <Select name="programme_id" required defaultValue={s.programme_id ?? ""} className={f}>
              <option value="">Select programme</option>
              {programmes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Year of Admission">
            <Input name="year_of_admission" type="number" min="2000" max="2100" defaultValue={s.year_of_admission ?? ""} className={f} />
          </Field>
          <Field label="Year of Completion *">
            <Input name="year_of_completion" type="number" min="2000" max="2100" required defaultValue={s.year_of_completion ?? ""} className={f} />
          </Field>
          <Field label="Mobile">
            <Input name="mobile" type="tel" pattern="\+?\d{10,13}" defaultValue={s.mobile ?? ""} className={f} />
          </Field>
          <Field label="Social Category">
            <Input name="category" defaultValue={s.category ?? ""} className={f} />
          </Field>
          <Field label="Domicile & Diversity">
            <Input name="regional_diversity" defaultValue={s.regional_diversity ?? ""} className={f} />
          </Field>
          <Field label="JEE Rank">
            <Input name="jee_rank" type="number" min="1" defaultValue={s.jee_rank ?? ""} className={f} />
          </Field>
          <Field label="Class X %">
            <Input name="marks_10" type="number" step="0.1" min="0" max="100" defaultValue={s.marks_10 ?? ""} className={f} />
          </Field>
          <Field label="Class XII %">
            <Input name="marks_12" type="number" step="0.1" min="0" max="100" defaultValue={s.marks_12 ?? ""} className={f} />
          </Field>
          <Field label="Current Address" className="col-span-2">
            <Input name="current_address" defaultValue={s.current_address ?? ""} className={f} />
          </Field>
          <Field label="Technical Skills" hint="Comma separated; recruiters filter on these." className="col-span-2">
            <Input name="professional_interests" defaultValue={s.professional_interests ?? ""} placeholder="Python, AWS Cloud, SQL" className={f} />
          </Field>
          <Field label="Certifications & Internships" hint="One per line." className="col-span-2">
            <Textarea name="certifications" rows={3} defaultValue={s.certifications ?? ""} className={f} />
          </Field>
          <Field label="LinkedIn URL" className="col-span-2">
            <Input name="linkedin_url" type="url" defaultValue={s.linkedin_url ?? ""} className={f} />
          </Field>
          {err && <p role="alert" className="col-span-2 rounded-xs bg-error-container px-3 py-2 text-body text-on-error-container">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 bg-surface-low px-5 py-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            Save Profile
          </Button>
        </div>
      </form>
    </div>
  );
}

function QuotaStatus() {
  const { data } = useApps();
  const selected = data?.data.filter((a) => a.status === "selected").length ?? 0;
  return <p className="font-display text-title font-semibold text-primary">Dream Tier Application: {selected} / 2</p>;
}

// Tracker stages from the Figma pipeline card, mapped onto the backend application machine.
const STAGES = ["Applied", "CV Verified", "Shortlisted", "Interview", "HR Round", "Final Offer"];
const stageOf = (a: App) => ({ applied: 0, released_to_recruiter: 1, shortlisted: a.interviews.length ? 3 : 2, selected: 5, rejected: -1 })[a.status];

function Tracker() {
  const apps = useApps();
  const [pick, setPick] = useState(0);
  return (
    <Card className="flex scroll-mt-24 flex-col gap-3 p-5">
      <span id="tracker" />
      <State data={apps.data} error={apps.error} retry={() => apps.mutate()} rows={3}>
        {({ data }) => {
          const active = data.filter((a) => a.status !== "rejected");
          if (!active.length)
            return (
              <>
                <TrackerHead title="Active Recruitment Stage Tracker" sub="No active drive yet" />
                <Empty icon="conversion_path" text="Apply to an open drive below to start tracking it here." />
              </>
            );
          const a = active[Math.min(pick, active.length - 1)];
          const at = stageOf(a);
          const iv = a.interviews.at(-1);
          return (
            <>
              <TrackerHead
                title="Active Recruitment Stage Tracker"
                sub={`Drive: ${a.opportunity.company.name} • ${a.opportunity.title}`}
                badge={a.status === "selected" ? "OFFER RELEASED" : `ROUND ${Math.max(1, at)} ACTIVE`}
              />
              {active.length > 1 && (
                <div className="flex flex-wrap gap-1">
                  {active.map((x, i) => (
                    <button key={x.id} onClick={() => setPick(i)} className={cx("rounded-xs px-2 py-0.5 text-caption font-semibold cursor-pointer", i === pick ? "bg-primary text-white" : "bg-surface-low text-muted")}>
                      {x.opportunity.company.name}
                    </button>
                  ))}
                </div>
              )}
              <ol className="relative grid grid-cols-3 gap-y-4 pt-2 sm:grid-cols-6">
                <span className="absolute top-[24px] right-[8%] left-[8%] hidden h-1 bg-surface-highest sm:block" />
                <span className="absolute top-[24px] left-[8%] hidden h-1 bg-primary sm:block" style={{ width: `${(Math.max(at, 0) / 5) * 84}%` }} />
                {STAGES.map((s, i) => (
                  <li key={s} className="relative flex flex-col items-center gap-1 text-center">
                    <span
                      className={cx(
                        "grid size-8 place-items-center rounded-xl text-caption font-bold shadow-card",
                        i < at ? "bg-primary text-white" : i === at ? "bg-tertiary text-white ring-4 ring-accent/30" : "bg-surface-high text-muted",
                      )}
                    >
                      {i < at ? <Icon name="check" /> : i === at ? <Icon name="schedule" /> : i + 1}
                    </span>
                    <span className="text-label font-semibold text-ink">{s}</span>
                    <span className={cx("text-caption", i === at ? "font-semibold text-tertiary" : "text-muted")}>
                      {i === 0 ? fmtDate(a.created_at) : i === 3 && iv ? fmtDate(iv.at, true) : i < at ? "Cleared" : i === at ? "In progress" : "Pending"}
                    </span>
                  </li>
                ))}
              </ol>
              <div className="flex flex-col justify-between gap-3 rounded-xs bg-surface-low p-3 sm:flex-row sm:items-center">
                <p className="flex items-start gap-2 text-body text-ink">
                  <Icon name="location_on" className="text-primary" />
                  {iv ? (
                    <span>
                      <b className="font-semibold">Interview Venue:</b> {iv.venue_or_link} • {iv.round}
                    </span>
                  ) : (
                    <span className="text-muted">Interview venue appears here once the recruiter schedules your round.</span>
                  )}
                </p>
                <Button size="sm" disabled={!iv} onClick={() => window.print()} className="shrink-0 px-3 py-2">
                  Download Hall Ticket
                </Button>
              </div>
            </>
          );
        }}
      </State>
    </Card>
  );
}

function TrackerHead({ title, sub, badge }: { title: string; sub: string; badge?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex gap-2">
        <Icon name="conversion_path" className="pt-0.5 text-[20px] text-primary" />
        <div>
          <h2 className="font-display text-title font-semibold text-primary">{title}</h2>
          <p className="text-caption font-semibold text-muted">{sub}</p>
        </div>
      </div>
      {badge && <span className="rounded-xs bg-primary px-2 py-1 text-caption font-bold text-white">{badge}</span>}
    </div>
  );
}

type TabId = "job" | "internship" | "events";

function Opportunities() {
  const [tab, setTab] = useState<TabId>("job");
  const opps = useSWR("opportunities", () => call(api.GET("/api/v1/opportunities", { params: { query: { limit: 100 } } })));
  const events = useSWR("events", () => call(api.GET("/api/v1/events", { params: { query: { limit: 100 } } })));
  const apps = useApps();
  const list = opps.data?.data ?? [];
  const count = (t: string) => list.filter((o) => o.type === t).length;

  return (
    <Card className="overflow-hidden">
      <span id="placements" className="block scroll-mt-24" />
      <span id="internships" className="block scroll-mt-24" />
      <span id="training" className="block scroll-mt-24" />
      <div className="bg-surface-low px-3 pt-3">
        <div role="tablist" className="flex gap-2">
          {(
            [
              ["job", "work", "Final Placements", count("job")],
              ["internship", "school", "Summer & Research Internships", count("internship")],
              ["events", "lightbulb", "Training & Workshops", events.data?.data.length ?? 0],
            ] as const
          ).map(([id, icon, label, n]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cx(
                "flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-t-xs px-3 py-2 text-left text-body-lg leading-[22px] cursor-pointer",
                tab === id ? "border-b-2 border-primary bg-white font-semibold text-primary" : "text-muted",
              )}
            >
              <Icon name={icon} />
              {label}
              <span className={cx("rounded-xl px-1.5 text-caption font-bold", tab === id ? "bg-primary text-white" : "bg-surface-high text-ink")}>{n}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3 p-5">
        {tab === "events" ? (
          <EventList data={events.data?.data} error={events.error} retry={() => events.mutate()} />
        ) : (
          <>
            <State data={opps.data} error={opps.error} retry={() => opps.mutate()} empty={() => count(tab) === 0}>
              {() =>
                list
                  .filter((o) => o.type === tab)
                  .map((o) => <OppCard key={o.id} o={o} app={apps.data?.data.find((a) => a.opportunity.id === o.id)} onApplied={() => (apps.mutate(), opps.mutate())} />)
              }
            </State>
            <ClosedApps apps={apps.data?.data.filter((a) => a.opportunity.type === tab && !list.some((o) => o.id === a.opportunity.id)) ?? []} />
          </>
        )}
      </div>
    </Card>
  );
}

function OppCard({ o, app, onApplied }: { o: Opp; app?: App; onApplied: () => void }) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const eligible = o.my_eligibility.eligible;
  const closes = timeLeft(o.apply_deadline);

  async function apply() {
    setBusy(true);
    setErr("");
    try {
      await call(api.POST("/api/v1/opportunities/{id}/apply", { params: { path: { id: o.id } } }));
      onApplied();
    } catch (e) {
      const x = e as ApiError;
      setErr(x.code === "PROFILE_INCOMPLETE" ? "Complete your profile (photo, resume, CGPA, DOB, programme) before applying." : x.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={cx("flex flex-col justify-between gap-3 rounded-lg p-3 shadow-card sm:flex-row sm:items-center", !eligible && !app ? "bg-surface-low/70 opacity-90" : "bg-white")}>
      <div className="flex gap-3">
        <span
          className={cx(
            "grid size-12 shrink-0 place-items-center rounded-xs font-display text-title font-bold",
            app ? "bg-surface text-primary" : eligible ? "bg-accent/20 text-on-accent" : "bg-surface-highest text-muted",
          )}
        >
          {initialsOf(o.company.name)}
        </span>
        <div className="flex flex-col gap-1">
          <h3 className="font-display text-title font-semibold text-primary">{o.company.name}</h3>
          <Badge tone={eligible ? "warn" : "soft"} className="w-fit">
            {o.designation ?? o.job_profile ?? (o.type === "job" ? "Full-time Role" : "Internship")}
          </Badge>
          <p className="text-body text-muted">
            Role: {o.title}
            {o.location && ` • ${o.location}`}
          </p>
          {o.ctc_benefits && <p className="text-label font-semibold text-ink">CTC: {o.ctc_benefits}</p>}
          {!app && eligible && closes !== "closed" && (
            <p className="flex items-center gap-1 text-label font-semibold text-error">
              <Icon name="timer" /> Registration closes {closes}
            </p>
          )}
          {err && <p className="text-label text-error">{err}</p>}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
        {app ? (
          <>
            <Badge tone={APP_STATUS[app.status].tone} icon="event_available" className="rounded-xl">
              {APP_STATUS[app.status].label}
            </Badge>
            <span className="text-caption text-muted">Applied {fmtDate(app.created_at)}</span>
          </>
        ) : eligible ? (
          <>
            <Badge tone="soft">Eligible by CGPA &amp; Stream</Badge>
            <Button variant="tertiary" busy={busy} disabled={closes === "closed"} onClick={apply} className="px-3">
              {closes === "closed" ? "Applications Closed" : "Apply Now (One-Click)"}
            </Button>
          </>
        ) : (
          <>
            <Badge tone="error" icon="warning">Ineligible: {o.my_eligibility.reasons.map((r) => reasonText(r)).join("; ")}</Badge>
          </>
        )}
        {o.jd_file_id && (
          <button onClick={() => openFile(o.jd_file_id!)} className="text-caption font-semibold text-primary underline cursor-pointer">
            View JD
          </button>
        )}
      </div>
    </article>
  );
}

/** Drives that closed after the student applied: no longer in /opportunities, but the result matters most here. */
function ClosedApps({ apps }: { apps: App[] }) {
  if (!apps.length) return null;
  return (
    <div className="flex flex-col gap-2 pt-2">
      <p className="text-caption font-semibold text-muted uppercase">Applied drives (closed)</p>
      {apps.map((a) => (
        <article key={a.id} className="flex items-center justify-between gap-3 rounded-sm bg-surface-low p-3">
          <div>
            <p className="text-card font-semibold text-primary">{a.opportunity.company.name}</p>
            <p className="text-body text-muted">{a.opportunity.title}</p>
          </div>
          <Badge tone={APP_STATUS[a.status].tone} className="rounded-xl">
            {APP_STATUS[a.status].label}
          </Badge>
        </article>
      ))}
    </div>
  );
}

function EventList({ data, error, retry }: { data?: Ev[]; error?: unknown; retry: () => void }) {
  const mine = useSWR("events/mine", () => call(api.GET("/api/v1/events/mine", { params: { query: { limit: 100 } } })));
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState<Record<string, string>>({});

  async function act(id: string, kind: "register" | "cancel-registration") {
    setBusy(id);
    setErr({});
    try {
      if (kind === "register") await call(api.POST("/api/v1/events/{id}/register", { params: { path: { id } } }));
      else await call(api.POST("/api/v1/events/{id}/cancel-registration", { params: { path: { id } } }));
      await mine.mutate();
    } catch (e) {
      setErr({ [id]: (e as Error).message });
    } finally {
      setBusy("");
    }
  }

  return (
    <State data={data} error={error} retry={retry} empty={(d) => d.length === 0}>
      {(events) =>
        events.map((e) => {
          const reg = mine.data?.data.find((r) => r.event.id === e.id && r.status !== "cancelled");
          const open = Date.now() >= +new Date(e.registration_opens_at) && Date.now() < +new Date(e.registration_closes_at);
          return (
            <article key={e.id} className="flex flex-col justify-between gap-3 rounded-lg bg-white p-3 shadow-card sm:flex-row sm:items-center">
              <div className="flex gap-3">
                <span className="grid size-12 shrink-0 place-items-center rounded-xs bg-surface text-primary">
                  <Icon name="co_present" className="text-[22px]" />
                </span>
                <div className="flex flex-col gap-1">
                  <h3 className="font-display text-title font-semibold text-primary">{e.name}</h3>
                  <Badge className="w-fit capitalize">{e.type.replace("_", " ")}</Badge>
                  <p className="text-body text-muted">
                    {e.topic && `${e.topic} • `}
                    {e.resource_person}
                  </p>
                  <p className="text-label font-semibold text-ink">
                    {fmtDate(e.starts_at, true)} • {e.venue ?? "Venue TBA"} • {e.chargeable ? `₹${e.fee ?? 0} fee` : "Free"}
                  </p>
                  {err[e.id] && <p className="text-label text-error">{err[e.id]}</p>}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
                {reg && <Badge tone="info" className="capitalize">{reg.status}</Badge>}
                {reg && open ? (
                  <Button variant="ghost" busy={busy === e.id} onClick={() => act(e.id, "cancel-registration")}>
                    Cancel Registration
                  </Button>
                ) : !reg ? (
                  <Button variant="tertiary" busy={busy === e.id} disabled={!open} onClick={() => act(e.id, "register")}>
                    {open ? "Register" : "Registration Closed"}
                  </Button>
                ) : null}
                <span className="text-caption text-muted">Closes {fmtDate(e.registration_closes_at, true)}</span>
              </div>
            </article>
          );
        })
      }
    </State>
  );
}

// Static analytics block: no backend source (user decision: keep Figma content).
function Benchmark() {
  const pts = [8.42, 8.65, 8.81, 9.02, 8.94, 9.38];
  const x = (i: number) => 30 + i * 100;
  const y = (v: number) => 90 - (v - 8.3) * 70;
  const line = pts.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-title font-semibold text-primary">Tezpur University Placement Benchmark &amp; Analytics</h2>
        <span className="text-caption font-semibold text-muted">B.Tech CSE 2024-25 Batch</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Average CSE CTC", "₹12.4 LPA", "↑ 18.2% vs previous cohort"],
          ["Batch Placement Rate", "74.6%", "48 of 64 students placed"],
          ["Highest Package (Current Drive)", "₹38.5 LPA", "Direct Core Offer"],
        ].map(([l, v, s], i) => (
          <div key={l} className="rounded-xs bg-surface-low p-3">
            <p className="text-caption font-medium text-muted uppercase">{l}</p>
            <p className="font-display text-title font-bold text-primary">{v}</p>
            <p className={cx("text-caption font-semibold", i === 0 ? "text-tertiary" : "text-muted")}>{s}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xs bg-surface-low/50 p-3">
        <div className="flex justify-between text-caption font-semibold">
          <span className="text-muted">Semester-Wise Academic SGPA Trajectory</span>
          <span className="text-primary">Trend: Steady High Performance</span>
        </div>
        <svg viewBox="0 0 580 110" className="h-28 w-full" role="img" aria-label="SGPA by semester from 8.42 to 9.38">
          {[30, 60, 90].map((l) => (
            <line key={l} x1="0" x2="580" y1={l} y2={l} stroke="rgba(0,20,47,0.08)" strokeDasharray="3 3" />
          ))}
          <polygon points={`${x(0)},100 ${line} ${x(5)},100`} fill="rgba(0,20,47,0.08)" />
          <polyline points={line} fill="none" stroke="#00142f" strokeWidth="2" />
          {pts.map((v, i) => (
            <g key={i}>
              <circle cx={x(i)} cy={y(v)} r="3.5" fill={i === 5 ? "#fe932c" : "#00142f"} />
              <text x={x(i)} y="108" fontSize="8" textAnchor="middle" fill="#44474e">
                S{i + 1}: {v}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </Card>
  );
}

function Dossier() {
  const p = useProfile();
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-2">
        <h2 className="flex gap-2 font-display text-title font-semibold text-primary">
          <Icon name="badge" className="pt-1" /> Personal &amp; Demographic Dossier
        </h2>
        <Badge tone="info">TPO Locked</Badge>
      </div>
      <State data={p.data} error={p.error} rows={4}>
        {(s: Profile) => (
          <>
            <dl className="flex flex-col text-body">
              {[
                ["Social Category:", s.category],
                ["Specially-abled Status:", s.specially_abled == null ? null : s.specially_abled ? "Yes" : "No (PwD: Nil)"],
                ["Domicile & Diversity:", s.regional_diversity],
                ["Date of Birth:", fmtDate(s.dob)],
                ["Address:", s.current_address],
              ].map(([k, v], i) => (
                <div key={k} className={cx("grid grid-cols-[1fr_1.2fr] gap-2 px-2 py-2", i % 2 === 0 && "bg-surface-low")}>
                  <dt className="text-muted">{k}</dt>
                  <dd className="font-semibold text-ink">{v ?? "—"}</dd>
                </div>
              ))}
            </dl>
            <p className="pt-1 text-caption font-semibold text-muted uppercase">Standardized Testing &amp; Ranks</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xs bg-surface-low p-2">
                <p className="text-caption font-semibold text-muted">JEE Advanced</p>
                <p className="font-display text-title font-bold text-primary">Rank: {s.jee_rank?.toLocaleString("en-IN") ?? "—"}</p>
                <p className="text-caption font-semibold text-muted">AIR All India</p>
              </div>
              <div className="rounded-xs bg-surface-low p-2">
                <p className="text-caption font-semibold text-muted">Secondary &amp; HS</p>
                <p className="font-display text-title font-bold text-primary">
                  {s.marks_10 ?? "—"}% / {s.marks_12 ?? "—"}%
                </p>
                <p className="text-caption font-semibold text-muted">CBSE Class X / XII</p>
              </div>
            </div>
          </>
        )}
      </State>
    </Card>
  );
}

function Certifications() {
  const p = useProfile();
  const certs = p.data?.certifications
    ?.split(/\n|;/)
    .map((c) => c.trim())
    .filter(Boolean);
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="flex items-center gap-2 font-display text-title font-semibold text-primary">
        <Icon name="workspace_premium" /> Certifications &amp; Internships
      </h2>
      {certs?.length ? (
        certs.map((c) => (
          <div key={c} className="flex items-start gap-2 rounded-xs bg-surface-low p-3">
            <Icon name="cloud_done" className="text-[18px] text-tertiary" />
            <p className="text-body font-semibold text-ink">{c}</p>
          </div>
        ))
      ) : (
        <>
          <div className="flex items-start gap-2 rounded-xs bg-surface-low p-3">
            <Icon name="cloud" className="text-[18px] text-tertiary" />
            <div>
              <p className="flex items-center gap-2 text-card font-semibold text-ink">
                AWS Certified Cloud Practitioner <Badge>CLF-C02</Badge>
              </p>
              <p className="text-caption font-semibold text-muted">Amazon Web Services • Valid thru 2026</p>
            </div>
          </div>
          <div className="flex flex-col gap-1 rounded-xs bg-surface-low p-3">
            <p className="flex justify-between text-caption font-semibold text-muted uppercase">
              Completed Internship <span>May - July 2024</span>
            </p>
            <p className="font-display text-title font-bold text-primary">Summer Intern @ C-DAC Silchar</p>
            <p className="text-body text-muted">Engineered automated natural language pipeline for Northeast tribal dialect transcription.</p>
            <p className="text-label font-semibold text-tertiary">Grade Received: Outstanding (O)</p>
          </div>
          <p className="text-caption text-muted">Add your certifications to your profile to replace these examples.</p>
        </>
      )}
    </Card>
  );
}

function Helpdesk() {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="flex gap-2 font-display text-title font-semibold text-primary">
        <Icon name="support_agent" className="pt-1" /> T&amp;P Helpdesk &amp; Student Coordinator
      </h2>
      <p className="text-body text-muted">
        Facing scheduling conflicts with university end-term labs or drive interviews? Submit instant emergency token.
      </p>
      <div className="flex items-center justify-between gap-2 rounded-xs bg-surface-low p-2">
        <div>
          <p className="text-body font-semibold text-ink">TPO Cell North Wing</p>
          <p className="text-caption font-semibold text-muted">Extension: +91 3712 273005</p>
        </div>
        <a href="mailto:adtp@tezu.ernet.in?subject=Drive%20scheduling%20dispute" className="rounded-xs bg-primary px-2 py-1 text-label font-semibold text-white">
          Raise Dispute
        </a>
      </div>
    </Card>
  );
}
