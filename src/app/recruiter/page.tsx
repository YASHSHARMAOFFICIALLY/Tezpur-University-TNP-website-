"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { AppShell, type NavItem } from "@/components/AppShell";
import { Badge, Button, Card, Empty, Field, Icon, Input, Modal, Notice, Select, State, Textarea, cx, useRun, type Tone } from "@/components/ui";
import { api, call, fileBody, listAll, openFile } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import type { paths } from "@/lib/api-types";
import { fmtDate, initialsOf, ymd } from "@/lib/format";

type Json<P extends keyof paths, M extends "get"> = paths[P][M] extends {
  responses: { 200: { content: { "application/json": infer T } } };
}
  ? T
  : never;
type Posting = Json<"/api/v1/company/opportunities", "get">["data"][number];
type Applicant = Json<"/api/v1/company/opportunities/{id}/applicants", "get">["data"][number];

const NAV: NavItem[] = [
  { label: "Corporate Desk", icon: "domain", href: "#desk" },
  { label: "Talent Pool", icon: "groups", href: "#talent" },
  { label: "Drive Timeline", icon: "timeline", href: "#timeline" },
  { label: "Candidates", icon: "person_search", href: "#candidates" },
  { label: "Liaison Dispatch", icon: "forward_to_inbox", href: "#dispatch" },
];

const POSTING_TONE: Record<Posting["status"], Tone> = {
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
const postingLabel = (p: Posting) => (p.status === "draft" && p.review_note ? "Returned for edits" : POSTING_LABEL[p.status]);
const STAGE_LABEL: Record<Applicant["status"], string> = {
  released_to_recruiter: "Released by T&P",
  shortlisted: "Shortlisted",
  rejected: "Rejected",
  selected: "Selected / Offer",
};

export default function RecruiterPage() {
  const postings = useSWR("company/opportunities", () =>
    listAll((cursor) => call(api.GET("/api/v1/company/opportunities", { params: { query: { limit: 100, cursor } } }))),
  );
  const [pick, setPick] = useState<string | null>(null);
  const [studio, setStudio] = useState(false);
  const [prog, setProg] = useState("");
  const list = postings.data?.data ?? [];
  const drive = list.find((p) => p.id === pick) ?? list.find((p) => p.status === "approved") ?? list[0];
  const applicants = useSWR(drive ? ["applicants", drive.id] : null, () =>
    listAll((cursor) => call(api.GET("/api/v1/company/opportunities/{id}/applicants", { params: { path: { id: drive!.id }, query: { limit: 100, cursor } } }))),
  );

  return (
    <AppShell role="company" nav={NAV} active="#desk">
      <div className="mx-auto flex max-w-[912px] flex-col gap-6">
        <CompanyHeader postings={list} applicants={applicants.data?.data} onCreate={() => setStudio(true)} />
        <TalentPool onExplore={setProg} />
        <DriveTimeline
          postings={list}
          drive={drive}
          onPick={setPick}
          applicants={applicants.data?.data}
          reload={() => postings.mutate()}
          error={postings.error}
          loading={!postings.data}
        />
        {drive && <Candidates key={drive.id} drive={drive} q={applicants} prog={prog} setProg={setProg} />}
        <div className="grid gap-6 lg:grid-cols-[1fr_350px]">
          <Dispatch />
          <Logistics />
        </div>
      </div>
      {studio && <PostingStudio onClose={() => setStudio(false)} onDone={() => (setStudio(false), postings.mutate())} />}
    </AppShell>
  );
}

function CompanyHeader({ postings, applicants, onCreate }: { postings: Posting[]; applicants?: Applicant[]; onCreate: () => void }) {
  const co = useSWR("companies/me", () => call(api.GET("/api/v1/companies/me")));
  const feedback = useSWR("feedback", () => call(api.GET("/api/v1/feedback")));
  const pendingFeedback = feedback.data?.filter((f) => !f.submitted) ?? [];
  const [fbOpen, setFbOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const live = postings.filter((p) => p.status === "approved");
  const a = applicants ?? [];
  const short = a.filter((x) => x.status === "shortlisted").length;
  const offers = a.filter((x) => x.status === "selected").length;
  const target = live.reduce((n, p) => n + (p.expected_hires ?? 0), 0);

  return (
    <Card className="flex scroll-mt-24 flex-col gap-4 p-4 sm:p-5">
      <span id="desk" />
      <State data={co.data} error={co.error} retry={() => co.mutate()} rows={2}>
        {(c) => (
          <div className="flex flex-col gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-12 shrink-0 place-items-center rounded-sm bg-surface text-primary">
                <Icon name="apartment" className="text-[26px]" />
              </span>
              <h1 className="min-w-0 truncate font-display text-[22px] leading-7 font-semibold text-primary" title={c.name}>
                {c.name}
              </h1>
              <span className="hidden shrink-0 sm:block">
                <Badge icon="domain" className="uppercase">
                  {c.category}
                  {c.sector && ` / ${c.sector}`}
                </Badge>
              </span>
            </div>
            <span className="sm:hidden">
              <Badge icon="domain" className="uppercase">
                {c.category}
                {c.sector && ` / ${c.sector}`}
              </Badge>
            </span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Badge tone="warn" icon="verified">
                Verified Corporate Partner
              </Badge>
              <p className="min-w-0 text-body text-muted">
                {c.postal_address && `${c.postal_address} • `}T&amp;P Liaison: Tezpur Central Placement Cell
                {c.contacts[0] && ` • Contact: ${c.contacts[0].name}`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 [&>button]:max-sm:w-full">
              <Button variant="ghost" icon="edit" onClick={() => setProfileOpen(true)} className="px-4 py-2.5">
                Edit Organisation Profile
              </Button>
              <Button icon="add_circle" onClick={onCreate} className="px-4 py-2.5 text-center">
                Create New Job Opening
              </Button>
              <Button
                variant="ghost"
                icon="rate_review"
                disabled={!pendingFeedback.length}
                title={pendingFeedback.length ? undefined : "No feedback form from the T&P cell yet"}
                onClick={() => setFbOpen(true)}
                className="px-4 py-2.5"
              >
                Submit Drive Feedback
              </Button>
            </div>
          </div>
        )}
      </State>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat
          label="Active Openings"
          icon="campaign"
          value={String(live.length).padStart(2, "0")}
          unit="Roles in progress"
          foot={live[0]?.title ?? "No live drive yet"}
          dot
        />
        <Stat label="Applications Received" icon="groups" value={String(a.length)} unit="released by T&P" bar={a.length ? 1 : 0} />
        <Stat
          label="Shortlisted for PI"
          icon="contact_support"
          value={String(short)}
          unit={a.length ? `${Math.round((short / a.length) * 100)}% pass rate` : "—"}
          accent
        />
        <Stat
          label="Offers Released"
          icon="verified"
          value={String(offers)}
          unit={target ? `of ${target} drive target` : "selections"}
          bar={target ? offers / target : 0}
          barTone="bg-tertiary"
        />
      </div>
      {fbOpen && <FeedbackDialog forms={pendingFeedback} onClose={() => (setFbOpen(false), feedback.mutate())} />}
      {profileOpen && co.data && <CompanyProfile c={co.data} onClose={() => (setProfileOpen(false), co.mutate())} />}
    </Card>
  );
}

function Stat({
  label,
  icon,
  value,
  unit,
  foot,
  dot,
  bar,
  barTone = "bg-primary",
  accent,
}: {
  label: string;
  icon: string;
  value: string;
  unit: string;
  foot?: string;
  dot?: boolean;
  bar?: number;
  barTone?: string;
  accent?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xs bg-surface-low p-2.5">
      <p className="flex items-center justify-between gap-1 text-caption font-semibold tracking-[0.55px] text-muted uppercase">
        {label} <Icon name={icon} className={accent ? "text-tertiary" : "text-primary"} />
      </p>
      <p className="flex items-baseline gap-2">
        <span className={cx("font-display text-headline font-bold", accent ? "text-tertiary" : "text-primary")}>{value}</span>
        <span className="text-caption font-semibold text-muted">{unit}</span>
      </p>
      {foot && (
        <p className="flex items-center gap-1 truncate text-caption font-semibold text-ink">
          {dot && <span className="size-1.5 shrink-0 rounded-xl bg-tertiary" />}
          {foot}
        </p>
      )}
      {bar !== undefined && (
        <span className="mt-1 h-1 rounded-xl bg-surface-highest">
          <span className={cx("block h-1 rounded-xl", barTone)} style={{ width: `${Math.min(1, bar) * 100}%` }} />
        </span>
      )}
    </div>
  );
}

function TalentPool({ onExplore }: { onExplore: (programmeId: string) => void }) {
  const progs = useSWR("programmes", () => call(api.GET("/api/v1/programmes")));
  const uni = useSWR("university", () => call(api.GET("/api/v1/university")));
  const u = uni.data;
  const chevron = <Icon name="expand_more" className="transition-transform group-open:rotate-180" />;
  return (
    <div className="grid scroll-mt-24 gap-4" id="talent">
      {u && (
        <details className="group rounded-lg bg-primary text-surface-high shadow-pop">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
            <span className="min-w-0">
              <span className="flex items-center gap-1 text-caption font-semibold uppercase">
                <Icon name="account_balance" /> Accreditation
              </span>
              <span className="block truncate font-display text-title font-bold text-white">{u.name}</span>
              {u.ranking && <span className="block text-caption font-semibold">{u.ranking}</span>}
            </span>
            {chevron}
          </summary>
          <div className="flex flex-col gap-3 px-4 pb-4">
            {u.est_year != null && <p className="text-body">Estd. {u.est_year}</p>}
            {u.achievements && <p className="text-body">{u.achievements}</p>}
            <div className="flex flex-wrap justify-between gap-2 text-caption font-semibold">
              {u.address && <span>{u.address}</span>}
              <Link href="/#brochure" className="flex items-center gap-1 text-white">
                View Institutional Brochure <Icon name="arrow_forward" />
              </Link>
            </div>
          </div>
        </details>
      )}
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-title font-semibold text-primary">Campus Talent Pool Drilldown</h2>
            <p className="text-body text-muted">Departmental clusters and batch strength from the university programme register.</p>
          </div>
          <Badge>Passing Out Cohort</Badge>
        </div>
        <State data={progs.data} error={progs.error} retry={() => progs.mutate()} empty={(d) => !d.length}>
          {(ps) => {
            const card = (p: (typeof ps)[number]) => (
              <div key={p.id} className="flex flex-col gap-2 rounded-xs bg-surface-low p-3">
                <p className="text-caption font-bold text-muted uppercase">{p.department}</p>
                <p className="font-display text-title font-bold text-primary">{p.name}</p>
                <p className="text-body text-muted">
                  <b className="font-display text-title text-ink">{p.student_count ?? "—"}</b> Students in batch
                </p>
                <a href="#candidates" onClick={() => onExplore(p.id)} className="flex items-center justify-between text-label font-semibold text-tertiary">
                  Explore Cohort Roster <Icon name="arrow_forward" />
                </a>
              </div>
            );
            return (
              <div className="flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">{ps.slice(0, 2).map(card)}</div>
                {ps.length > 2 && (
                  <details className="group flex flex-col gap-3">
                    <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-xs px-1 text-label font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
                      <span className="group-open:hidden">Show all {ps.length} programmes</span>
                      <span className="hidden group-open:inline">Show fewer</span>
                      {chevron}
                    </summary>
                    <div className="grid gap-3 sm:grid-cols-2">{ps.slice(2).map(card)}</div>
                  </details>
                )}
              </div>
            );
          }}
        </State>
      </Card>
    </div>
  );
}

function DriveTimeline({
  postings,
  drive,
  onPick,
  applicants,
  reload,
  error,
  loading,
}: {
  postings: Posting[];
  drive?: Posting;
  onPick: (id: string) => void;
  applicants?: Applicant[];
  reload: () => void;
  error?: unknown;
  loading: boolean;
}) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(false);
  const a = applicants ?? [];
  const sp = drive?.selection_process;
  const steps: [string, string, boolean][] = drive
    ? [
        ["01. Applications", `${a.length} Released`, a.length > 0],
        [
          "02. Resume Screen",
          sp?.shortlist_from_resumes ? `${a.filter((x) => x.status !== "released_to_recruiter").length} Screened` : "Not in process",
          a.some((x) => x.status !== "released_to_recruiter"),
        ],
        ["03. Online Test", sp?.online_test || sp?.written_test ? "In selection process" : "Not in process", false],
        ["04. Technical PI", `${a.filter((x) => x.status === "shortlisted").length} Shortlisted`, a.some((x) => x.status === "shortlisted")],
        ["05. HR / Leadership", sp?.hr_interview ? `${a.filter((x) => x.interviews.length > 1).length} Scheduled` : "Not in process", false],
        ["06. Final Offers", `${a.filter((x) => x.status === "selected").length} Rolled Out`, a.some((x) => x.status === "selected")],
      ]
    : [];
  const current = steps.findLastIndex((s) => s[2]);

  async function act(kind: "submit" | "close") {
    if (!drive) return;
    setBusy(kind);
    setErr("");
    try {
      if (kind === "submit")
        await call(
          api.POST("/api/v1/company/opportunities/{id}/submit", {
            params: { path: { id: drive.id } },
          }),
        );
      else
        await call(
          api.POST("/api/v1/company/opportunities/{id}/close", {
            params: { path: { id: drive.id } },
          }),
        );
      reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function uploadJd(f: File | undefined) {
    if (!drive || !f) return;
    setBusy("jd");
    setErr("");
    try {
      await call(
        api.POST("/api/v1/company/opportunities/{id}/jd", {
          params: { path: { id: drive.id } },
          ...fileBody(f),
        }),
      );
      reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <Card className="flex scroll-mt-24 flex-col gap-3 p-3 sm:p-3">
      <span id="timeline" />
      <State data={loading ? undefined : postings} error={error} retry={reload} rows={2}>
        {() =>
          !drive ? (
            <Empty icon="work_outline" text="No job postings yet. Use “Create New Job Opening” to start a drive." />
          ) : (
            <>
              <div className="flex flex-col justify-between gap-2 px-2 pt-1 sm:flex-row sm:items-start">
                <div>
                  <h2 className="font-display text-title font-semibold text-primary">Drive Timeline: {drive.title}</h2>
                  <p className="text-body text-muted">
                    Drive ID: {drive.id.slice(0, 8).toUpperCase()} • Role: {drive.designation ?? drive.job_profile ?? drive.type} • Deadline{" "}
                    {fmtDate(drive.apply_deadline)}
                  </p>
                  {drive.review_note && (
                    <p className="pt-1 text-label font-semibold text-error">
                      <Icon name="feedback" /> T&amp;P note: {drive.review_note}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-start gap-1 sm:items-end">
                  <span className="flex items-center gap-1 text-caption font-semibold text-muted">
                    Current Status: <Badge tone={POSTING_TONE[drive.status]}>{postingLabel(drive)}</Badge>
                  </span>
                  {postings.length > 1 && (
                    <Select aria-label="Choose drive" value={drive.id} onChange={(e) => onPick(e.target.value)} className="h-8 w-60 py-1 text-label">
                      {postings.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title} ({postingLabel(p)})
                        </option>
                      ))}
                    </Select>
                  )}
                </div>
              </div>
              <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {steps.map(([t, v, done], i) => (
                  <li
                    key={t}
                    className={cx(
                      "flex justify-between gap-1 rounded-xs p-2",
                      i === current ? "bg-primary text-white" : "bg-surface-low",
                      !done && i > current && "opacity-60",
                    )}
                  >
                    <div>
                      <p className={cx("text-caption font-semibold", i === current ? "text-surface-high" : "text-ink")}>{t}</p>
                      <p className={cx("text-body font-semibold", i === current ? "text-white" : "text-ink")}>{v}</p>
                    </div>
                    {i === current ? (
                      <span className="mt-1 size-2 rounded-xl bg-accent" />
                    ) : (
                      <Icon name={done ? "check_circle" : "pending"} className="text-muted" />
                    )}
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap items-center gap-2 px-2 pb-1">
                {drive.status === "draft" && (
                  <>
                    <Button size="sm" variant="soft" icon="edit" onClick={() => setEditing(true)}>
                      Edit Posting
                    </Button>
                    <Button size="sm" busy={busy === "submit"} onClick={() => act("submit")} icon="send">
                      Submit for T&amp;P Approval
                    </Button>
                  </>
                )}
                {editing && <PostingStudio initial={drive} onClose={() => setEditing(false)} onDone={() => (setEditing(false), reload())} />}
                {drive.status === "approved" && (
                  <Button size="sm" variant="ghost" busy={busy === "close"} onClick={() => act("close")} icon="block">
                    Stop Accepting Applications
                  </Button>
                )}
                <label
                  className={cx(
                    "inline-flex cursor-pointer items-center gap-1 rounded-xs bg-surface-high px-2 py-1 text-caption font-semibold text-ink",
                    busy === "jd" && "opacity-50",
                  )}
                >
                  <Icon name="upload_file" /> {drive.jd_file_id ? "Replace JD PDF" : "Upload JD PDF"}
                  <input type="file" accept="application/pdf" className="sr-only" onChange={(e) => uploadJd(e.target.files?.[0])} />
                </label>
                {drive.jd_file_id && (
                  <button onClick={() => openFile(drive.jd_file_id!)} className="text-caption font-semibold text-primary underline cursor-pointer">
                    View JD
                  </button>
                )}
                {err && <span className="text-label text-error">{err}</span>}
              </div>
            </>
          )
        }
      </State>
    </Card>
  );
}

function Candidates({
  drive,
  q,
  prog,
  setProg,
}: {
  drive: Posting;
  q: { data?: { data: Applicant[] }; error?: unknown; mutate: () => unknown };
  prog: string;
  setProg: (id: string) => void;
}) {
  const progs = useSWR("programmes", () => call(api.GET("/api/v1/programmes")));
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [minCgpa, setMinCgpa] = useState(0);
  const [kw, setKw] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [iv, setIv] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const PER = 5;

  const rows = useMemo(
    () =>
      (q.data?.data ?? []).filter((a) => {
        const s = a.student;
        const hay = `${(s.user as { name?: string }).name ?? ""} ${s.enrolment_no} ${s.professional_interests ?? ""}`.toLowerCase();
        return (!prog || s.programme_id === prog) && (!minCgpa || (s.cgpa ?? 0) >= minCgpa) && (!kw || hay.includes(kw.toLowerCase()));
      }),
    [q.data, prog, minCgpa, kw],
  );
  const pages = Math.max(1, Math.ceil(rows.length / PER));
  const shown = rows.slice(page * PER, page * PER + PER);
  // Only rows the filters still show count as selected, so bulk actions never touch hidden candidates.
  const ids = rows.filter((a) => sel.has(a.id)).map((a) => a.id);
  const progName = (id: string | null) => progs.data?.find((p) => p.id === id)?.name ?? "—";

  async function bulk(kind: "shortlist" | "reject" | "results") {
    setConfirming(false);
    setBusy(kind);
    setMsg(null);
    try {
      if (kind === "shortlist")
        await call(
          api.POST("/api/v1/company/applications/shortlist", {
            body: { application_ids: ids },
          }),
        );
      if (kind === "reject")
        await call(
          api.POST("/api/v1/company/applications/reject", {
            body: { application_ids: ids },
          }),
        );
      if (kind === "results")
        await call(
          api.POST("/api/v1/company/opportunities/{id}/results", {
            params: { path: { id: drive.id } },
            body: { selected_application_ids: ids },
          }),
        );
      setMsg({
        tone: "ok",
        text:
          kind === "results"
            ? `Final selections sent: ${ids.length} candidate(s). The T&P cell publishes them to students.`
            : `${ids.length} candidate(s) updated.`,
      });
      setSel(new Set());
      q.mutate();
    } catch (e) {
      setMsg({ tone: "err", text: (e as Error).message });
    } finally {
      setBusy("");
    }
  }

  function exportCsv() {
    const head = ["Name", "Email", "Enrolment", "Programme", "CGPA", "Applied", "Stage"];
    const lines = rows.map((a) => {
      const u = a.student.user as { name?: string; email?: string };
      return [u.name, u.email, a.student.enrolment_no, progName(a.student.programme_id), a.student.cgpa, a.created_at.slice(0, 10), STAGE_LABEL[a.status]];
    });
    downloadCsv(`${drive.title}-candidates.csv`, [head, ...lines]);
  }

  return (
    <Card className="flex scroll-mt-24 flex-col overflow-hidden">
      <span id="candidates" />
      <div className="flex flex-col justify-between gap-3 p-5 pb-3 md:flex-row md:items-start">
        <div>
          <h2 className="font-display text-title font-semibold text-primary">Candidate Shortlisting Database</h2>
          <p className="text-body text-muted">Applicants released by the T&amp;P cell, with academic filters.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon="person_add" busy={busy === "shortlist"} disabled={!ids.length} onClick={() => bulk("shortlist")} className="px-2 py-1.5">
            Bulk Shortlist ( {ids.length} )
          </Button>
          <Button size="sm" variant="tertiary" icon="event" disabled={!ids.length} onClick={() => setIv(true)} className="px-2 py-1.5">
            Schedule Interview
          </Button>
          <Button size="sm" variant="ghost" icon="download" disabled={!rows.length} onClick={exportCsv} className="px-2 py-1.5">
            Export CSV
          </Button>
        </div>
      </div>

      <div className="mx-5 grid gap-3 rounded-xs bg-surface-low p-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="DEGREE / DEPARTMENT">
          <Select value={prog} onChange={(e) => (setProg(e.target.value), setPage(0))}>
            <option value="">All programmes</option>
            {progs.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <label className="flex flex-col gap-1.5">
          <span className="flex justify-between text-label font-semibold text-ink">
            MIN CGPA THRESHOLD <b>{minCgpa.toFixed(1)}</b>
          </span>
          <input
            type="range"
            min={0}
            max={9.5}
            step={0.1}
            value={minCgpa}
            onChange={(e) => (setMinCgpa(+e.target.value), setPage(0))}
            className="accent-primary"
          />
          <span className="flex justify-between text-caption text-muted">
            <span>0.0</span>
            <span>9.5</span>
          </span>
        </label>
        <Field label="ACTIVE BACKLOGS ALLOWED">
          <Select disabled title="Backlog data isn't collected by the portal yet">
            <option>Strictly 0 Backlogs</option>
          </Select>
        </Field>
        <Field label="SKILL KEYWORDS">
          <Input value={kw} onChange={(e) => (setKw(e.target.value), setPage(0))} placeholder="Filter: name, enrolment, skills…" />
        </Field>
      </div>

      {msg && (
        <p
          className={cx(
            "mx-5 mt-3 rounded-xs px-3 py-2 text-body",
            msg.tone === "ok" ? "bg-primary-fixed text-primary" : "bg-error-container text-on-error-container",
          )}
        >
          {msg.text}
        </p>
      )}

      <div className="mt-3 overflow-x-auto">
        <State data={q.data} error={q.error} retry={() => q.mutate()} rows={4}>
          {() =>
            rows.length === 0 ? (
              <div className="p-5">
                <Empty
                  icon="person_search"
                  text={
                    q.data?.data.length
                      ? "No candidates match these filters."
                      : "No applicants released yet. The T&P cell releases eligible applicants after the deadline."
                  }
                />
              </div>
            ) : (
              <table className="w-full min-w-[820px] text-left">
                <thead className="bg-surface-low text-caption font-semibold tracking-[0.55px] text-muted uppercase">
                  <tr>
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label="Select all on this page"
                        checked={shown.every((a) => sel.has(a.id))}
                        onChange={(e) =>
                          setSel(new Set(e.target.checked ? [...sel, ...shown.map((a) => a.id)] : [...sel].filter((id) => !shown.some((a) => a.id === id))))
                        }
                      />
                    </th>
                    <th className="px-2 py-3">Candidate Detail</th>
                    <th className="px-2 py-3">Enrolment ID</th>
                    <th className="px-2 py-3">Degree &amp; Program</th>
                    <th className="px-2 py-3">CGPA</th>
                    <th className="px-2 py-3">Technical Core</th>
                    <th className="px-2 py-3">Resume Dossier</th>
                    <th className="px-2 py-3">Applied Date</th>
                    <th className="px-2 py-3">Drive Stage</th>
                  </tr>
                </thead>
                <tbody className="text-body text-ink">
                  {shown.map((a) => {
                    const s = a.student;
                    const u = s.user as { name?: string; email?: string };
                    const skills = (s.professional_interests ?? "")
                      .split(/,|;/)
                      .map((x) => x.trim())
                      .filter(Boolean)
                      .slice(0, 3);
                    return (
                      <tr key={a.id} className="border-t border-surface">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            aria-label={`Select ${u.name}`}
                            checked={sel.has(a.id)}
                            onChange={(e) => setSel(new Set(e.target.checked ? [...sel, a.id] : [...sel].filter((x) => x !== a.id)))}
                          />
                        </td>
                        <td className="px-2 py-3">
                          <div className="flex items-center gap-2">
                            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-surface-high text-caption font-bold text-primary">
                              {initialsOf(u.name ?? "?")}
                            </span>
                            <div>
                              <p className="font-semibold">{u.name}</p>
                              <p className="text-caption text-muted">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-3">{s.enrolment_no}</td>
                        <td className="max-w-[140px] px-2 py-3">{progName(s.programme_id)}</td>
                        <td className="px-2 py-3 font-bold">{s.cgpa?.toFixed(2) ?? "—"}</td>
                        <td className="px-2 py-3">
                          <div className="flex max-w-[120px] flex-wrap gap-1">
                            {skills.length ? (
                              skills.map((k) => (
                                <Badge key={k} tone="muted">
                                  {k}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-3">
                          {s.resume_file_id ? (
                            <button
                              onClick={() => openFile(s.resume_file_id!)}
                              className="flex items-center gap-1 rounded-xs bg-surface-low px-2 py-1 text-caption font-semibold cursor-pointer"
                            >
                              <Icon name="picture_as_pdf" /> View PDF
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-2 py-3">{fmtDate(a.created_at)}</td>
                        <td className="px-2 py-3">
                          <Badge tone={a.status === "selected" ? "primary" : a.status === "rejected" ? "error" : a.status === "shortlisted" ? "warn" : "soft"}>
                            {STAGE_LABEL[a.status]}
                          </Badge>
                          {a.interviews.at(-1) && (
                            <p className="pt-1 text-caption text-muted">
                              {a.interviews.at(-1)!.round}: {fmtDate(a.interviews.at(-1)!.at, true)}
                            </p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          }
        </State>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 bg-surface-low px-4 py-3 text-body text-muted">
        <span>
          Showing <b className="text-ink">{shown.length}</b> of {rows.length} released candidates
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" icon="close" busy={busy === "reject"} disabled={!ids.length} onClick={() => bulk("reject")}>
            Reject Selected
          </Button>
          <Button size="sm" icon="workspace_premium" busy={busy === "results"} disabled={!ids.length} onClick={() => setConfirming(true)}>
            Submit as Final Selections
          </Button>
          <span className="mx-2 h-5 w-px bg-surface-highest" />
          <button disabled={page === 0} onClick={() => setPage(page - 1)} className="text-caption font-semibold disabled:opacity-40 cursor-pointer">
            Previous
          </button>
          {Array.from({ length: pages }, (_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              aria-current={i === page}
              className={cx(
                "grid size-6 place-items-center rounded-xs text-caption font-semibold cursor-pointer",
                i === page ? "bg-primary text-white" : "text-ink",
              )}
            >
              {i + 1}
            </button>
          ))}
          <button
            disabled={page >= pages - 1}
            onClick={() => setPage(page + 1)}
            className="text-caption font-semibold text-ink disabled:opacity-40 cursor-pointer"
          >
            Next
          </button>
        </div>
      </div>
      {confirming && (
        <Modal title="Submit final selections" onClose={() => setConfirming(false)}>
          <p className="text-body text-ink">
            Submit {ids.length} candidate(s) as the final selections for {drive.title}? This replaces any selection submitted earlier for this drive.
          </p>
          <p className="text-body text-ink">
            Every other shortlisted or released applicant on this drive is rejected when the T&amp;P cell publishes the results.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button icon="workspace_premium" onClick={() => bulk("results")}>
              Confirm
            </Button>
          </div>
        </Modal>
      )}
      {iv && (
        <InterviewDialog
          drive={drive}
          ids={ids}
          onClose={(ok) => (
            setIv(false),
            ok &&
              (setSel(new Set()),
              q.mutate(),
              setMsg({
                tone: "ok",
                text: "Interview scheduled; candidates are notified.",
              }))
          )}
        />
      )}
    </Card>
  );
}

function InterviewDialog({ drive, ids, onClose }: { drive: Posting; ids: string[]; onClose: (ok: boolean) => void }) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setBusy(true);
    try {
      await call(
        api.POST("/api/v1/company/opportunities/{id}/interviews", {
          params: { path: { id: drive.id } },
          body: {
            application_ids: ids,
            round: f.round,
            at: new Date(f.at).toISOString(),
            venue_or_link: f.venue,
          },
        }),
      );
      onClose(true);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Modal title={`Schedule interview • ${ids.length} candidate(s)`} onClose={() => onClose(false)}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Round *">
          <Input name="round" required defaultValue="Technical PI" />
        </Field>
        <Field label="Date & time *">
          <Input name="at" type="datetime-local" required />
        </Field>
        <Field label="Venue or meeting link *">
          <Input name="venue" required placeholder="Computer Center Lab 2 / https://meet…" />
        </Field>
        <p className="text-caption text-muted">Only shortlisted candidates can be scheduled.</p>
        {err && <p className="text-body text-error">{err}</p>}
        <Button type="submit" busy={busy}>
          Schedule &amp; Notify
        </Button>
      </form>
    </Modal>
  );
}

type Company = Json<"/api/v1/companies/me", "get">;
const CATEGORIES = ["mnc", "private", "psu", "govt", "startup", "ngo", "other"] as const;

function CompanyProfile({ c, onClose }: { c: Company; onClose: () => void }) {
  const save = useRun();
  const contacts = useRun();
  const [list, setList] = useState(c.contacts);
  const refresh = async () => setList((await call(api.GET("/api/v1/companies/me"))).contacts);
  return (
    <Modal title="Organisation Profile" onClose={onClose} wide>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const g = (k: string) => String(fd.get(k) ?? "").trim();
          save.run(
            "save",
            () =>
              call(
                api.PATCH("/api/v1/companies/me", {
                  body: {
                    name: g("name"),
                    website: g("website") || undefined,
                    category: g("category") as Company["category"],
                    sector: g("sector") || undefined,
                    postal_address: g("postal_address") || undefined,
                  },
                }),
              ),
            "Profile saved.",
          );
        }}
      >
        <Field label="Organisation Legal Name *">
          <Input name="name" required minLength={2} defaultValue={c.name} />
        </Field>
        <Field label="Official Website">
          <Input name="website" type="url" defaultValue={c.website ?? ""} />
        </Field>
        <Field label="Corporate Category">
          <Select name="category" defaultValue={c.category}>
            {CATEGORIES.map((x) => (
              <option key={x} value={x}>
                {x.toUpperCase()}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Industry Sector">
          <Input name="sector" defaultValue={c.sector ?? ""} />
        </Field>
        <Field label="Registered Office Address" className="sm:col-span-2">
          <Input name="postal_address" defaultValue={c.postal_address ?? ""} />
        </Field>
        <div className="flex items-center justify-end gap-2 sm:col-span-2">
          <Notice msg={save.msg} />
          <Button type="submit" busy={save.busy === "save"}>
            Save Profile
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-2 rounded-xs bg-surface-low p-3">
        <p className="text-label font-bold text-ink uppercase">Contact persons</p>
        {list.length ? (
          list.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-xs bg-white p-2 text-body">
              <span>
                <b className="text-ink">{p.name}</b> {p.designation && <span className="text-muted">• {p.designation}</span>}
                <span className="block text-caption text-muted">{[p.email, p.phone, p.mobile].filter(Boolean).join(" • ")}</span>
              </span>
              <Button
                size="sm"
                variant="danger"
                aria-label={`Remove ${p.name}`}
                busy={contacts.busy === p.id}
                onClick={() =>
                  contacts.run(
                    p.id,
                    async () => (
                      await call(
                        api.DELETE("/api/v1/companies/me/contacts/{id}", {
                          params: { path: { id: p.id } },
                        }),
                      ),
                      await refresh()
                    ),
                    "Contact removed.",
                  )
                }
              >
                Remove
              </Button>
            </div>
          ))
        ) : (
          <p className="text-body text-muted">No contact persons yet.</p>
        )}
        <form
          className="grid gap-2 pt-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            const g = (k: string) => String(fd.get(k) ?? "").trim() || undefined;
            contacts.run(
              "add",
              async () => {
                await call(
                  api.POST("/api/v1/companies/me/contacts", {
                    body: {
                      name: g("name")!,
                      designation: g("designation"),
                      email: g("email"),
                      phone: g("phone"),
                    },
                  }),
                );
                form.reset();
                await refresh();
              },
              "Contact added.",
            );
          }}
        >
          <Input name="name" required minLength={2} placeholder="Name *" aria-label="Contact name" />
          <Input name="designation" placeholder="Designation" aria-label="Contact designation" />
          <Input name="email" type="email" placeholder="Email" aria-label="Contact email" />
          <Input name="phone" type="tel" placeholder="Phone" aria-label="Contact phone" />
          <Button type="submit" variant="soft" icon="person_add" busy={contacts.busy === "add"} className="sm:col-span-2">
            Add Contact
          </Button>
        </form>
        <Notice msg={contacts.msg} />
      </div>
    </Modal>
  );
}

type FeedbackForm = Json<"/api/v1/feedback", "get">[number];
function FeedbackDialog({ forms, onClose }: { forms: FeedbackForm[]; onClose: () => void }) {
  const form = forms[0];
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const answers = Object.fromEntries(
      form.questions.map((q) => [q.id, q.kind === "rating" ? Number(fd.get(q.id)) : q.kind === "yes_no" ? fd.get(q.id) === "yes" : String(fd.get(q.id) ?? "")]),
    );
    setBusy(true);
    try {
      await call(
        api.POST("/api/v1/feedback/{id}", {
          params: { path: { id: form.id } },
          body: { answers } as never,
        }),
      );
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Modal title="Drive feedback for the T&P cell" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {form.questions.map((q) => (
          <Field key={q.id} label={q.label}>
            {q.kind === "rating" ? (
              <Select name={q.id} required defaultValue="">
                <option value="">Rate 1–5</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </Select>
            ) : q.kind === "yes_no" ? (
              <Select name={q.id} required defaultValue="">
                <option value="">Choose</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </Select>
            ) : (
              <Textarea name={q.id} rows={3} />
            )}
          </Field>
        ))}
        {err && <p className="text-body text-error">{err}</p>}
        <Button type="submit" busy={busy}>
          Submit Feedback
        </Button>
      </form>
    </Modal>
  );
}

function Dispatch() {
  const thread = useSWR("messages", () => call(api.GET("/api/v1/messages", { params: { query: { limit: 20 } } })));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = Object.fromEntries(new FormData(form)) as Record<string, string>;
    setBusy(true);
    setMsg(null);
    try {
      await call(
        api.POST("/api/v1/messages", {
          body: { subject: f.subject, body: f.body },
        }),
      );
      form.reset();
      setMsg({ tone: "ok", text: "Sent to the T&P cell." });
      thread.mutate();
    } catch (e) {
      setMsg({ tone: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex scroll-mt-24 flex-col gap-3 p-5">
      <span id="dispatch" />
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-title font-semibold text-primary">Liaison Dispatch: T&amp;P Admin &amp; Cohort Broadcast</h2>
          <p className="text-body text-muted">Send direct instructions to the Placement Cell; they relay schedules to candidates.</p>
        </div>
        <Icon name="hub" className="text-[20px] text-primary" />
      </div>
      <form onSubmit={send} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="TARGET RECIPIENT">
            <Input value="Central T&P Cell Office" readOnly className="bg-surface-low" />
          </Field>
          <Field label="DISPATCH PROTOCOL">
            <Input value="Portal message + email to T&P" readOnly className="bg-surface-low" />
          </Field>
        </div>
        <Field label="SUBJECT HEADER">
          <Input name="subject" required maxLength={200} className="bg-surface-low" placeholder="Interview Slot Allotment: Technical PI Round" />
        </Field>
        <Field label="DISPATCH CONTENT">
          <Textarea name="body" required rows={5} className="bg-surface-low" placeholder="Dear Placement Cell, …" />
        </Field>
        {msg && <p className={cx("text-body", msg.tone === "ok" ? "text-primary" : "text-error")}>{msg.text}</p>}
        <div className="flex justify-end">
          <Button type="submit" busy={busy} icon="send">
            Transmit Announcement
          </Button>
        </div>
      </form>
      <div className="flex flex-col gap-2 border-t border-surface pt-3">
        <p className="text-caption font-semibold text-muted uppercase">Recent thread</p>
        <State data={thread.data} error={thread.error} retry={() => thread.mutate()} rows={2}>
          {({ data }) =>
            data.length ? (
              data.slice(0, 4).map((m) => (
                <div key={m.id} className="rounded-xs bg-surface-low p-2">
                  <p className="flex justify-between text-label font-semibold text-ink">
                    {m.subject} <span className="text-caption font-normal text-muted">{fmtDate(m.created_at, true)}</span>
                  </p>
                  <p className="line-clamp-2 text-body text-muted">{m.body}</p>
                </div>
              ))
            ) : (
              <p className="text-body text-muted">No messages yet.</p>
            )
          }
        </State>
      </div>
    </Card>
  );
}

// Static: no backend source for on-campus logistics (user decision: keep Figma content).
function Logistics() {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-display text-title font-semibold text-primary">Campus Logistics &amp; Hospitality</h2>
          <p className="text-body text-muted">Tezpur University T&amp;P Support Node</p>
        </div>
        <Icon name="support_agent" className="text-[20px] text-tertiary" />
      </div>
      {[
        ["location_on", "Interview Venue Allocated", "Computer Center Lab 2 & Guest House Boardroom. Dedicated LAN 1 Gbps lease line enabled."],
        ["badge", "Student Coordinators Assigned", "Placement student coordinators are assigned per drive by the T&P cell."],
        ["schedule", "Catering & Transit", "Executive Lunch arranged at University Guest House, 1:00 PM – 2:00 PM daily."],
      ].map(([icon, t, d]) => (
        <div key={t} className="flex gap-2 rounded-xs bg-surface-low p-3">
          <Icon name={icon} className="text-[18px] text-primary" />
          <div>
            <p className="text-body font-semibold text-ink">{t}</p>
            <p className="text-body leading-[22px] text-muted">{d}</p>
          </div>
        </div>
      ))}
      <a href="tel:+913712273005" className="flex items-center justify-center gap-1 rounded-xs bg-surface-high py-2 text-body font-semibold text-primary">
        <Icon name="call" /> Emergency Hotline to Placement Director
      </a>
    </Card>
  );
}

const ROUNDS = [
  ["shortlist_from_resumes", "Resume Shortlisting"],
  ["online_test", "Online Aptitude & Coding"],
  ["written_test", "Written Test"],
  ["group_discussion", "Group Discussion"],
  ["technical_interview", "Technical Interview"],
  ["hr_interview", "HR Interview"],
] as const;
const PERKS = ["Comprehensive Health Insurance (₹5L)", "Relocation Allowance (₹75,000)", "Annual Certifications Reimbursement"];

/** Create a posting, or (with `initial`) edit a draft / returned posting, then (re)submit it for T&P approval. */
function PostingStudio({ onClose, onDone, initial }: { onClose: () => void; onDone: () => void; initial?: Posting }) {
  const progs = useSWR("programmes", () => call(api.GET("/api/v1/programmes")));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const year = new Date().getFullYear();
  // The draft survives a failed submit, so a retry updates it instead of creating a duplicate posting.
  const draft = useRef(initial?.id);
  // Edit keeps what the form can't show (several batches, the exact deadline time) unless the recruiter changes that field.
  const batches = initial?.eligibility.completion_years?.join(",");
  const initialDay = initial && ymd(new Date(initial.apply_deadline));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const g = (k: string) => String(fd.get(k) ?? "").trim();
    const programmes = fd.getAll("programmes").map(String);
    if (!programmes.length) return setErr("Pick at least one eligible programme.");
    const perks = fd.getAll("perks").map(String);
    const ctc = initial
      ? g("ctc_text")
      : [g("base") && `₹${g("base")} LPA base`, g("variable") && `₹${g("variable")} LPA variable`, ...perks].filter(Boolean).join(" + ");
    setBusy(true);
    setErr("");
    try {
      const body = {
        type: g("type") as Posting["type"],
        title: g("title"),
        designation: g("designation") || undefined,
        location: g("location") || undefined,
        description: g("description"),
        expected_hires: g("hires") ? Number(g("hires")) : undefined,
        ctc_benefits: ctc || undefined,
        bond_details: g("bond") || undefined,
        // A date-only string parses as UTC midnight; the deadline is the end of that day in the recruiter's time zone.
        apply_deadline: g("deadline") === initialDay ? initial!.apply_deadline : new Date(`${g("deadline")}T23:59:59`).toISOString(),
        eligibility: {
          ...initial?.eligibility,
          min_cgpa: Number(g("min_cgpa") || 0),
          programmes,
          completion_years: g("batch").split(",").map(Number),
        },
        selection_process: Object.fromEntries(ROUNDS.map(([k]) => [k, fd.has(k)])) as never,
      };
      if (draft.current) await call(api.PATCH("/api/v1/company/opportunities/{id}", { params: { path: { id: draft.current } }, body }));
      else draft.current = (await call(api.POST("/api/v1/company/opportunities", { body }))).id;
      await call(api.POST("/api/v1/company/opportunities/{id}/submit", { params: { path: { id: draft.current } } }));
      onDone();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  const label = "text-caption font-semibold tracking-[0.55px] text-muted uppercase";
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-primary/30" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal
        aria-label={initial ? "Edit posting" : "Job & Internship Posting Studio"}
        className="flex h-full w-full max-w-[544px] flex-col bg-white shadow-pop"
      >
        <div className="flex items-start justify-between gap-3 bg-primary px-5 py-5 text-white">
          <div className="flex gap-3">
            <Icon name="post_add" className="text-[22px]" />
            <div>
              <h2 className="font-display text-title font-semibold">{initial ? "Edit & Resubmit Posting" : "Job & Internship Posting Studio"}</h2>
              <p className="text-caption font-semibold text-surface-high">Launch targeted recruitment drives for Tezpur University batches</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="cursor-pointer">
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
          <div className="grid grid-cols-[1fr_140px] gap-3">
            <Field label="ROLE PROFILE / JOB TITLE *">
              <Input
                name="title"
                required
                defaultValue={initial?.title}
                className="bg-surface-low shadow-none"
                placeholder="Software Development Engineer - Cloud"
              />
            </Field>
            <Field label="TYPE *">
              <Select name="type" defaultValue={initial?.type} className="bg-surface-low shadow-none">
                <option value="job">Full-time Job</option>
                <option value="internship">Internship</option>
                <option value="competition">Competition</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="TENTATIVE WORK LOCATION *">
              <Input
                name="location"
                required
                defaultValue={initial?.location ?? ""}
                className="bg-surface-low shadow-none"
                placeholder="Bangalore / Pune / Remote Hybrid"
              />
            </Field>
            <Field label="DESIGNATION">
              <Input name="designation" defaultValue={initial?.designation ?? ""} className="bg-surface-low shadow-none" placeholder="Software Engineer" />
            </Field>
          </div>
          <Field label="JOB DESCRIPTION *">
            <Textarea name="description" required rows={3} defaultValue={initial?.description} className="bg-surface-low shadow-none" />
          </Field>
          <fieldset className="flex flex-col gap-2 rounded-xs bg-surface-low p-3">
            <legend className="sr-only">Compensation</legend>
            <p className="text-label font-bold text-ink uppercase">Compensation &amp; Benefits Breakdown</p>
            {initial ? (
              <Field label="CTC & Benefits">
                <Input name="ctc_text" defaultValue={initial.ctc_benefits ?? ""} />
              </Field>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Base Compensation (INR LPA)">
                    <Input name="base" type="number" step="0.1" min="0" placeholder="10.5" />
                  </Field>
                  <Field label="Variable / Performance Bonus">
                    <Input name="variable" type="number" step="0.1" min="0" placeholder="1.5" />
                  </Field>
                </div>
                <p className="text-label font-semibold text-ink">Additional Perks &amp; Coverage</p>
                <div className="flex flex-wrap gap-2">
                  {PERKS.map((p) => (
                    <label key={p} className="flex items-center gap-1 rounded-xs bg-white px-2 py-0.5 text-caption font-semibold text-ink">
                      <input type="checkbox" name="perks" value={p} className="accent-primary" /> {p}
                    </label>
                  ))}
                </div>
              </>
            )}
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <Field label="BOND / SERVICE AGREEMENT">
              <Input
                name="bond"
                className="bg-surface-low shadow-none"
                defaultValue={initial ? (initial.bond_details ?? "") : "None (Direct Employment Agreement)"}
              />
            </Field>
            <Field label="EXPECTED HIRES">
              <Input name="hires" type="number" min="1" defaultValue={initial?.expected_hires ?? ""} className="bg-surface-low shadow-none" placeholder="25" />
            </Field>
          </div>
          <fieldset className="flex flex-col gap-2 rounded-xs bg-surface-low p-3">
            <p className="text-label font-bold text-ink uppercase">Academic Eligibility Parameters</p>
            <p className={label}>Degrees Permitted to Apply *</p>
            <div className="flex flex-wrap gap-2">
              {progs.data?.map((p) => (
                <label key={p.id} className="flex items-center gap-1 rounded-xs bg-white px-2 py-1 text-label text-ink">
                  <input
                    type="checkbox"
                    name="programmes"
                    value={p.id}
                    defaultChecked={initial?.eligibility.programmes?.includes(p.id)}
                    className="accent-primary"
                  />{" "}
                  {p.name}
                </label>
              )) ?? <span className="text-body text-muted">Loading programmes…</span>}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Minimum Cutoff CGPA">
                <Input name="min_cgpa" type="number" step="0.1" min="0" max="10" defaultValue={initial?.eligibility.min_cgpa ?? 7.5} />
              </Field>
              <Field label="Passing-out Batch *">
                <Select name="batch" defaultValue={batches ?? year}>
                  {[...new Set([batches, year, year + 1, year + 2].filter(Boolean).map(String))].map((y) => (
                    <option key={y} value={y}>
                      {y.split(",").join(", ")}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Apply Deadline *">
                <Input name="deadline" type="date" required min={ymd(new Date())} defaultValue={initialDay} />
              </Field>
            </div>
          </fieldset>
          <fieldset>
            <p className={cx(label, "pb-2")}>Recruitment Rounds Architecture</p>
            <div className="grid grid-cols-2 gap-2">
              {ROUNDS.map(([k, l], i) => (
                <label key={k} className="flex items-center gap-2 text-body-lg text-ink">
                  <input type="checkbox" name={k} defaultChecked={initial ? initial.selection_process[k] : i < 2} className="size-4 accent-primary" /> {l}
                </label>
              ))}
            </div>
          </fieldset>
          {err && (
            <p role="alert" className="rounded-xs bg-error-container px-3 py-2 text-body text-on-error-container">
              {err}
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 bg-surface-low px-5 py-3">
          <span className="mr-auto text-caption text-muted">Goes to the T&amp;P cell for approval first.</span>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            {initial ? "Save & Resubmit for Approval" : "Publish Opening to Students"}
          </Button>
        </div>
      </form>
    </div>
  );
}
