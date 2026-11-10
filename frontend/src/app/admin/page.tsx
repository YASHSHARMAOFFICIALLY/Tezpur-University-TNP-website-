"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import useSWR from "swr";
import { AppShell } from "@/components/AppShell";
import { ADMIN_NAV } from "./nav";
import { Badge, Button, Card, Empty, Field, Icon, Input, Notice, Select, State, Tabs, cx, useRun } from "@/components/ui";
import { api, call, listAll, openFile } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import type { paths } from "@/lib/api-types";
import { fmtDate, initialsOf } from "@/lib/format";

type Json<P extends keyof paths> = paths[P] extends { get: { responses: { 200: { content: { "application/json": infer T } } } } } ? T : never;

const usePending = () => useSWR("admin/pending", () => call(api.GET("/api/v1/admin/pending")));
const useOpps = () => useSWR("admin/opportunities", () => call(api.GET("/api/v1/admin/opportunities", { params: { query: { limit: 100 } } })));
const useCompanies = () => useSWR("admin/companies", () => call(api.GET("/api/v1/admin/companies", { params: { query: { limit: 100 } } })));

export default function AdminPage() {
  return (
    <AppShell role="admin" nav={ADMIN_NAV} active="/admin">
      <div className="mx-auto flex max-w-[976px] flex-col gap-5">
        <Header />
        <Stats />
        <Queue />
        <Appeals />
        <div className="grid items-start gap-5 lg:grid-cols-[1fr_385px]">
          <EventCreator />
          <div className="flex flex-col gap-5">
            <PublishResults />
          </div>
        </div>
        <StudentFeedback />
        <Reports />
      </div>
    </AppShell>
  );
}

function Header() {
  return (
    <div id="console" className="flex scroll-mt-24 flex-col justify-between gap-3 pb-1 md:flex-row md:items-end">
      <div>
        <h1 className="font-display text-headline font-bold text-primary">TPO Administrative Control Center</h1>
        <p className="text-[14px] leading-5 text-muted">Recruiter and posting approvals, appeals, sessions, results and student feedback.</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap md:max-w-[370px] md:justify-end">
        <Link href="/admin/content" className="flex items-center justify-center gap-1 rounded-xs bg-surface-high px-3 py-1 max-sm:py-2.5 text-label font-semibold text-ink">
          <Icon name="tune" /> Edit Landing Page &amp; Records
        </Link>
        <a href="#events" className="flex items-center justify-center gap-1 rounded-xs bg-surface-high px-3 py-1 max-sm:py-2.5 text-label font-semibold text-ink">
          <Icon name="event_available" /> Host New Session
        </a>
        <a href="#results" className="flex items-center justify-center gap-1 rounded-xs bg-primary px-3 py-1 max-sm:py-2.5 text-label font-semibold text-white shadow-pop">
          <Icon name="campaign" /> Publish Select List
        </a>
      </div>
    </div>
  );
}

function StatCard({ label, icon, children }: { label: string; icon: string; children: React.ReactNode }) {
  return (
    <Card className="flex min-h-[168px] flex-col gap-1.5 p-5">
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-xs bg-surface text-primary">
          <Icon name={icon} className="text-[18px]" />
        </span>
        <p className="text-label font-semibold text-muted">{label}</p>
      </div>
      {children}
    </Card>
  );
}
const Big = ({ v, unit, tone = "text-primary" }: { v: string | number; unit: string; tone?: string }) => (
  <p className="flex items-baseline gap-1">
    <span className={cx("font-display text-display font-bold tracking-[-0.8px]", tone)}>{v}</span>
    <span className="text-body text-muted">{unit}</span>
  </p>
);

function Stats() {
  const pending = usePending();
  const opps = useOpps();
  const companies = useSWR("admin/companies?active", () => call(api.GET("/api/v1/admin/companies", { params: { query: { limit: 100, status: "active" } } })));
  const students = useSWR("admin/students?active", () => call(api.GET("/api/v1/admin/students", { params: { query: { limit: 100, status: "active" } } })));
  const report = useSWR("reports/placements", () => call(api.GET("/api/v1/admin/reports/placements")));

  const live = opps.data?.data.filter((o) => o.status === "approved") ?? [];
  const nStudents = students.data ? `${students.data.data.length}${students.data.page.has_more ? "+" : ""}` : "…";
  const cos = companies.data?.data ?? [];
  const share = (cats: string[]) => (cos.length ? Math.round((cos.filter((c) => cats.includes(c.category)).length / cos.length) * 100) : 0);
  const offers = report.data?.reduce((n, r) => n + r.selected, 0) ?? 0;
  const applied = report.data?.reduce((n, r) => n + r.applied, 0) ?? 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Live Recruitment Drives" icon="corporate_fare">
        <Big v={live.length} unit="Ongoing" />
        <div className="flex gap-1">
          <Badge tone="info">{pending.data?.opportunities.length ?? 0} Awaiting Approval</Badge>
        </div>
      </StatCard>
      <StatCard label="Registered Candidates" icon="badge">
        <Big v={nStudents} unit="Active" />
        <p className="text-caption text-muted">Students activate themselves by verifying the emailed code.</p>
        {!!pending.data?.students.length && (
          <Badge tone="warn" icon="pending" className="w-fit">
            {pending.data.students.length} older sign-up{pending.data.students.length === 1 ? "" : "s"} to approve
          </Badge>
        )}
      </StatCard>
      <StatCard label="Approved Recruiters" icon="handshake">
        <Big v={cos.length} unit="Active Partners" />
        <Badge tone="info" icon="domain" className="w-fit">
          {pending.data?.recruiters.length ?? 0} Awaiting Approval
        </Badge>
        <p className="mt-auto flex justify-between text-caption text-muted">
          <span>MNC: {share(["mnc"])}%</span>
          <span>PSU: {share(["psu", "govt"])}%</span>
          <span>Startups: {share(["startup"])}%</span>
        </p>
      </StatCard>
      <StatCard label="Batch Offers" icon="verified">
        <Big v={offers} unit="Placed" tone="text-tertiary" />
        <p className="text-caption text-muted tabular-nums">
          {applied} applications • {applied ? Math.round((offers / applied) * 100) : 0}% placed
        </p>
        <span className="mt-auto h-1.5 rounded-xl bg-surface-high">
          <span className="block h-1.5 rounded-xl bg-accent" style={{ width: `${applied ? (offers / applied) * 100 : 0}%` }} />
        </span>
      </StatCard>
    </div>
  );
}

type QTab = "students" | "recruiters" | "opportunities";

function Queue() {
  const pending = usePending();
  const [tab, setTab] = useState<QTab>("recruiters");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const d = pending.data;

  async function decide(id: string, decision: "approve" | "reject" | "return", note?: string) {
    setBusy(id);
    setErr("");
    try {
      const body = decision === "approve" ? { decision } : { decision, reason: note! };
      if (tab === "opportunities") await call(api.POST("/api/v1/admin/opportunities/{id}/decision", { params: { path: { id } }, body: body as never }));
      else await call(api.POST("/api/v1/admin/users/{id}/decision", { params: { path: { id } }, body: body as never }));
      setRejecting(null);
      setReason("");
      await pending.mutate();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const match = (s: string) => !q || s.toLowerCase().includes(q.toLowerCase());
  const students = d?.students.filter((s) => match(`${s.name} ${s.email} ${s.student?.enrolment_no ?? ""}`)) ?? [];
  const recruiters = d?.recruiters.filter((r) => match(`${r.name} ${r.email} ${(r.company as { name?: string } | null)?.name ?? ""}`)) ?? [];
  const opps = d?.opportunities.filter((o) => match(`${o.title} ${o.company.name}`)) ?? [];
  const visible = { students, recruiters, opportunities: opps }[tab];

  async function batchApprove() {
    for (const x of visible) await decide(x.id, "approve");
  }

  function exportCsv() {
    const rows = visible.map((x) => Object.values(x).map((v) => (typeof v === "object" ? JSON.stringify(v) : v)));
    downloadCsv(`pending-${tab}.csv`, [Object.keys(visible[0] ?? {}), ...rows]);
  }

  const actions = (id: string) =>
    rejecting === id ? (
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          decide(id, tab === "opportunities" ? "return" : "reject", reason);
        }}
      >
        <Input
          autoFocus
          required
          minLength={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (sent to user)"
          className="h-7 w-40 py-1 text-label"
        />
        <Button size="sm" variant="tertiary" busy={busy === id}>
          Send
        </Button>
        <button type="button" onClick={() => setRejecting(null)} aria-label="Cancel" className="text-muted cursor-pointer">
          <Icon name="close" />
        </button>
      </form>
    ) : (
      <div className="flex items-center justify-end gap-1">
        <Button size="sm" busy={busy === id} onClick={() => decide(id, "approve")} className="px-2.5">
          Approve
        </Button>
        <Button size="sm" variant="danger" onClick={() => (setRejecting(id), setReason(""))} className="px-2.5">
          {tab === "opportunities" ? "Return" : "Reject"}
        </Button>
      </div>
    );

  return (
    <Card className="scroll-mt-24 overflow-hidden">
      <span id="queue" />
      <div className="flex flex-col justify-between gap-3 bg-surface-low px-5 pt-3 md:flex-row md:items-center">
        <div role="tablist" className="flex gap-1 overflow-x-auto">
          {(
            [
              ["recruiters", "corporate_fare", "Recruiter Onboarding", d?.recruiters.length],
              ["opportunities", "work", "Job & Internship Postings", d?.opportunities.length],
              ["students", "school", "Older Student Sign-ups", d?.students.length],
            ] as const
          ).map(([id, icon, label, n]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => (setTab(id), setRejecting(null))}
              className={cx(
                "flex shrink-0 items-center gap-1.5 rounded-t-xs px-3 py-2.5 text-body font-semibold cursor-pointer",
                tab === id ? "bg-white text-ink" : "text-muted",
              )}
            >
              <Icon name={icon} />
              {label}
              <span className={cx("rounded-xl px-1.5 text-caption font-bold", tab === id ? "bg-accent text-on-accent" : "bg-surface-high text-ink")}>
                {n ?? "…"}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 pb-2 md:pb-0">
          <label className="relative">
            <Icon name="search" className="absolute top-2.5 left-2 text-muted" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter by Enrollment / Org…"
              className="h-8 w-56 pl-8 text-body"
              aria-label="Filter queue"
            />
          </label>
          <button
            onClick={exportCsv}
            disabled={!visible.length}
            aria-label="Export CSV"
            className="grid size-8 place-items-center rounded-xs bg-white text-primary shadow-card disabled:opacity-40 cursor-pointer"
          >
            <Icon name="download" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 p-5">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
          <div>
            <h2 className="font-display text-title font-bold text-primary">
              {
                {
                  students: "Student Sign-ups from Before Email Verification",
                  recruiters: "Recruiter KYC & Organisation Audit",
                  opportunities: "Posting Review: JNF / INF Compliance",
                }[tab]
              }
            </h2>
            <p className="text-body text-muted">
              {
                {
                  students:
                    "New students need no approval: verifying the code emailed to their university inbox activates them. Only accounts created before that change wait here.",
                  recruiters: "Confirm corporate identity before granting drive access.",
                  opportunities: "Approve postings to make them visible to eligible students.",
                }[tab]
              }
            </p>
          </div>
          <Button size="sm" variant="soft" disabled={!visible.length || !!busy} onClick={batchApprove} className="shrink-0">
            Batch Verify All Filtered ({visible.length})
          </Button>
        </div>
        {err && (
          <p role="alert" className="rounded-xs bg-error-container px-3 py-2 text-body text-on-error-container">
            {err}
          </p>
        )}
        <div className="overflow-x-auto">
          <State data={d} error={pending.error} retry={() => pending.mutate()} rows={4}>
            {() =>
              !visible.length ? (
                <Empty icon="task_alt" text="Queue is clear. Nothing awaiting a decision." />
              ) : tab === "students" ? (
                <table className="w-full min-w-[820px] text-left text-body">
                  <thead className="bg-surface-low text-caption font-semibold tracking-[0.55px] text-muted uppercase">
                    <tr>
                      {["Enrollment No", "Candidate Name", "Department", "CGPA", "Official Email", "Resume", "Actions"].map(
                        (h, i) => (
                          <th key={h} className={cx("px-3 py-2", i === 6 && "text-right")}>
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => {
                      const st = s.student;
                      return (
                        <tr key={s.id} className="border-t border-surface">
                          <td className="px-3 py-3 font-bold">{st?.enrolment_no ?? "—"}</td>
                          <td className="px-3 py-3">
                            <span className="flex items-center gap-2">
                              <span className="grid size-6 shrink-0 place-items-center rounded-xl bg-surface-high text-caption font-bold">
                                {initialsOf(s.name)}
                              </span>
                              <span className="font-semibold">{s.name}</span>
                            </span>
                          </td>
                          <td className="px-3 py-3 text-muted">
                            {st?.department ?? st?.programme?.department ?? "—"}
                            {st?.programme && <p className="text-caption">{st.programme.name}</p>}
                          </td>
                          <td className="px-3 py-3 font-bold">{st?.cgpa?.toFixed(2) ?? "—"}</td>
                          <td className="px-3 py-3 text-muted">{s.email}</td>
                          <td className="px-3 py-3">
                            {st?.resume_file_id ? (
                              <button
                                onClick={() => openFile(st.resume_file_id!)}
                                className="flex items-center gap-1 rounded-xs bg-surface-high px-2 py-1 text-caption font-semibold cursor-pointer"
                              >
                                <Icon name="description" /> View PDF
                              </button>
                            ) : (
                              <Badge tone="error" icon="warning">
                                Not uploaded
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-3">{actions(s.id)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : tab === "recruiters" ? (
                <table className="w-full min-w-[720px] text-left text-body">
                  <thead className="bg-surface-low text-caption font-semibold tracking-[0.55px] text-muted uppercase">
                    <tr>
                      {["Organisation", "Category", "Contact", "Official Email", "Registered", "Actions"].map((h, i) => (
                        <th key={h} className={cx("px-3 py-2", i === 5 && "text-right")}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recruiters.map((r) => {
                      const c = (r.company ?? {}) as { name?: string; category?: string; website?: string };
                      return (
                        <tr key={r.id} className="border-t border-surface">
                          <td className="px-3 py-3">
                            <p className="font-semibold">{c.name ?? "—"}</p>
                            {c.website && (
                              <a href={c.website} target="_blank" rel="noreferrer" className="text-caption text-primary underline">
                                {c.website}
                              </a>
                            )}
                            {r.review_note && <p className="text-caption text-tertiary">Resubmitted after: {r.review_note}</p>}
                          </td>
                          <td className="px-3 py-3 uppercase">{c.category ?? "—"}</td>
                          <td className="px-3 py-3">{r.name}</td>
                          <td className="px-3 py-3 text-muted">{r.email}</td>
                          <td className="px-3 py-3 text-muted">{fmtDate(r.created_at)}</td>
                          <td className="px-3 py-3">{actions(r.id)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <table className="w-full min-w-[720px] text-left text-body">
                  <thead className="bg-surface-low text-caption font-semibold tracking-[0.55px] text-muted uppercase">
                    <tr>
                      {["Posting", "Company", "Type", "Min CGPA", "Deadline", "Actions"].map((h, i) => (
                        <th key={h} className={cx("px-3 py-2", i === 5 && "text-right")}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {opps.map((o) => (
                      <tr key={o.id} className="border-t border-surface">
                        <td className="px-3 py-3">
                          <p className="font-semibold">{o.title}</p>
                          <p className="text-caption text-muted">
                            {o.location} {o.ctc_benefits && `• ${o.ctc_benefits}`}
                          </p>
                        </td>
                        <td className="px-3 py-3">{o.company.name}</td>
                        <td className="px-3 py-3 capitalize">{o.type}</td>
                        <td className="px-3 py-3 font-bold">{o.eligibility.min_cgpa ?? "—"}</td>
                        <td className="px-3 py-3 text-muted">{fmtDate(o.apply_deadline)}</td>
                        <td className="px-3 py-3">{actions(o.id)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          </State>
        </div>
      </div>
    </Card>
  );
}

const EVENT_TYPES = [
  ["training", "Training Programme (Technical/Soft Skills)"],
  ["expert_session", "Expert Session"],
  ["workshop", "Workshop"],
  ["awareness", "Awareness Programme"],
] as const;

function EventCreator() {
  const events = useSWR("admin/events", () => call(api.GET("/api/v1/admin/events", { params: { query: { limit: 100 } } })));
  const [chargeable, setChargeable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  // Set while a created event is still unpublished, so a retry updates and publishes it instead of creating another.
  const draftId = useRef<string | null>(null);
  const field = "bg-surface-low shadow-none";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const g = (k: string) => String(new FormData(form).get(k) ?? "").trim();
    const startsAt = new Date(`${g("date")}T${g("start") || "10:00"}`);
    const closes = new Date(`${g("rsvp")}T23:59`);
    if (closes > startsAt) return setMsg({ tone: "err", text: "RSVP cut-off must be before the session date." });
    setBusy(true);
    setMsg(null);
    try {
      const body = {
        type: g("type") as (typeof EVENT_TYPES)[number][0],
        name: g("topic"),
        topic: g("cohort"),
        resource_person: [g("speaker"), g("org")].filter(Boolean).join(", ") || undefined,
        starts_at: startsAt.toISOString(),
        venue: g("venue") || undefined,
        chargeable,
        fee: chargeable ? 150 : undefined,
        registration_opens_at: new Date().toISOString(),
        registration_closes_at: closes.toISOString(),
      };
      const id = draftId.current;
      if (id) await call(api.PATCH("/api/v1/admin/events/{id}", { params: { path: { id } }, body }));
      else draftId.current = (await call(api.POST("/api/v1/admin/events", { body }))).id;
      await call(api.POST("/api/v1/admin/events/{id}/publish", { params: { path: { id: draftId.current! } } }));
      draftId.current = null;
      form.reset();
      setChargeable(false);
      setMsg({ tone: "ok", text: "Session published. Students can register now." });
      events.mutate();
    } catch (e) {
      setMsg({ tone: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex scroll-mt-24 flex-col gap-4 p-8">
      <span id="events" />
      <details className="group flex flex-col gap-4">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-2 rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
          <div>
            <h2 className="font-display text-title font-bold text-primary">Event &amp; Training Creator Studio</h2>
            <p className="text-body text-muted">Design and broadcast soft-skill cohorts, mock drives, and corporate masterclasses.</p>
          </div>
          <Icon name="expand_more" className="shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        <form onSubmit={submit} className="flex flex-col gap-4 pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Program Type">
              <Select name="type" className={field}>
                {EVENT_TYPES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Target Eligibility Cohort">
              <Select name="cohort" className={field}>
                <option>Open to All Enrolled TU Students</option>
                <option>Final Year Students</option>
                <option>Pre-final Year Students</option>
              </Select>
            </Field>
          </div>
          <Field label="Workshop / Session Topic">
            <Input name="topic" required className={field} placeholder="e.g. Mastering Technical Case Interviews for Consulting & FinTech" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Resource Person / Speaker">
              <Input name="speaker" className={field} placeholder="e.g. Dr. Rajesh Goswami" />
            </Field>
            <Field label="Designation & Organisation">
              <Input name="org" className={field} placeholder="e.g. VP Engineering, Microsoft IDC" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Venue Location">
              <Input name="venue" className={field} defaultValue="KBR Auditorium (Tezpur)" />
            </Field>
            <Field label="Date">
              <Input name="date" type="date" required className={field} />
            </Field>
            <Field label="Start Time">
              <Input name="start" type="time" className={field} defaultValue="15:00" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <fieldset className="flex flex-col gap-1.5">
              <legend className="pb-1.5 text-label font-semibold text-ink">Student Fee Policy</legend>
              <label className="flex items-start gap-2 text-body text-muted">
                <input type="radio" name="fee" checked={!chargeable} onChange={() => setChargeable(false)} className="mt-0.5 accent-primary" /> Non-Chargeable
                (Free T&amp;P Cell Spons.)
              </label>
              <label className="flex items-start gap-2 text-body text-muted">
                <input type="radio" name="fee" checked={chargeable} onChange={() => setChargeable(true)} className="mt-0.5 accent-primary" /> Chargeable (₹150
                Cert. Fee)
              </label>
            </fieldset>
            <Field label="RSVP Cut-off Date">
              <Input name="rsvp" type="date" required className={field} />
            </Field>
          </div>
          {msg && (
            <p
              className={cx(
                "rounded-xs px-3 py-2 text-body",
                msg.tone === "ok" ? "bg-primary-fixed text-primary" : "bg-error-container text-on-error-container",
              )}
            >
              {msg.text}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="reset"
              variant="soft"
              onClick={() => {
                draftId.current = null;
                setChargeable(false);
                setMsg(null);
              }}
            >
              Clear Draft
            </Button>
            <Button type="submit" icon="podcasts" busy={busy}>
              Broadcast &amp; Enlist Session
            </Button>
          </div>
        </form>
      </details>
      <div className="flex flex-col gap-2 border-t border-surface pt-3">
        <p className="text-caption font-semibold text-muted">Scheduled sessions</p>
        <State data={events.data} error={events.error} retry={() => events.mutate()} rows={2}>
          {({ data }) =>
            data.length ? (
              <>
                {data.slice(0, 3).map((ev) => (
                  <EventRow key={ev.id} ev={ev} reload={() => events.mutate()} />
                ))}
                {data.length > 3 && (
                  <details className="group flex flex-col gap-2">
                    <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-xs px-1 text-label font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
                      <span className="group-open:hidden">Show all {data.length} sessions</span>
                      <span className="hidden group-open:inline">Show fewer</span>
                      <Icon name="expand_more" className="transition-transform group-open:rotate-180" />
                    </summary>
                    {data.slice(3).map((ev) => (
                      <EventRow key={ev.id} ev={ev} reload={() => events.mutate()} />
                    ))}
                  </details>
                )}
              </>
            ) : (
              <p className="text-body text-muted">No sessions yet.</p>
            )
          }
        </State>
      </div>
    </Card>
  );
}

type AdminEvent = Json<"/api/v1/admin/events">["data"][number];
function EventRow({ ev, reload }: { ev: AdminEvent; reload: () => void }) {
  const [open, setOpen] = useState(false);
  const regs = useSWR(open ? ["regs", ev.id] : null, () =>
    call(api.GET("/api/v1/admin/events/{id}/registrations", { params: { path: { id: ev.id }, query: { limit: 100 } } })),
  );
  const { busy, msg, run } = useRun();
  const move = (kind: "publish" | "complete" | "cancel") =>
    run(kind, async () => {
      if (kind === "publish") await call(api.POST("/api/v1/admin/events/{id}/publish", { params: { path: { id: ev.id } } }));
      if (kind === "complete") await call(api.POST("/api/v1/admin/events/{id}/complete", { params: { path: { id: ev.id } } }));
      if (kind === "cancel") await call(api.POST("/api/v1/admin/events/{id}/cancel", { params: { path: { id: ev.id } } }));
      reload();
    });
  const mark = (kind: "confirm" | "attend", ids: string[]) =>
    run(kind, async () => {
      if (kind === "confirm") await call(api.POST("/api/v1/admin/registrations/confirm", { body: { registration_ids: ids } }));
      else await call(api.POST("/api/v1/admin/registrations/attend", { body: { registration_ids: ids } }));
      regs.mutate();
    });
  return (
    <div className="rounded-xs bg-surface-low p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-left text-body font-semibold text-ink cursor-pointer">
          <Icon name={open ? "expand_less" : "expand_more"} /> {ev.name}
          <span className="font-normal text-muted">• {fmtDate(ev.starts_at, true)}</span>
        </button>
        <div className="flex items-center gap-1">
          <Badge tone={ev.status === "published" ? "info" : ev.status === "cancelled" ? "error" : "muted"} className="capitalize">
            {ev.status}
          </Badge>
          {ev.status === "draft" && (
            <Button size="sm" busy={busy === "publish"} onClick={() => move("publish")}>
              Publish
            </Button>
          )}
          {ev.status === "published" && (
            <>
              <Button size="sm" variant="soft" busy={busy === "complete"} onClick={() => move("complete")}>
                Complete
              </Button>
              <Button size="sm" variant="danger" busy={busy === "cancel"} onClick={() => move("cancel")}>
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>
      <Notice msg={msg} />
      {open && (
        <div className="pt-2">
          <State data={regs.data} error={regs.error} rows={1}>
            {({ data }) =>
              data.length ? (
                <>
                  <ul className="flex flex-col gap-1 text-body">
                    {data.map((r) => (
                      <li key={r.id} className="flex justify-between">
                        <span>
                          {r.student.user.name} • {r.student.enrolment_no}
                        </span>
                        <Badge className="capitalize">{r.status}</Badge>
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-1 pt-2">
                    <Button
                      size="sm"
                      variant="soft"
                      busy={busy === "confirm"}
                      onClick={() =>
                        mark(
                          "confirm",
                          data.filter((r) => r.status === "registered").map((r) => r.id),
                        )
                      }
                    >
                      Confirm all registered
                    </Button>
                    <Button
                      size="sm"
                      variant="soft"
                      busy={busy === "attend"}
                      onClick={() =>
                        mark(
                          "attend",
                          data.filter((r) => r.status === "confirmed").map((r) => r.id),
                        )
                      }
                    >
                      Mark confirmed as attended
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-body text-muted">No registrations yet.</p>
              )
            }
          </State>
        </div>
      )}
    </div>
  );
}

function PublishResults() {
  const opps = useSWR("admin/opportunities/all", () =>
    listAll((cursor) => call(api.GET("/api/v1/admin/opportunities", { params: { query: { limit: 100, cursor } } }))),
  );
  const companies = useCompanies();
  const [id, setId] = useState("");
  const [busy, setBusy] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const drives = opps.data?.data.filter((o) => o.status === "approved" || o.status === "closed") ?? [];
  const drive = drives.find((o) => o.id === id) ?? drives[0];
  const apps = useSWR(drive ? ["admin-apps", drive.id] : null, () =>
    listAll((cursor) => call(api.GET("/api/v1/admin/opportunities/{id}/applications", { params: { path: { id: drive!.id }, query: { limit: 100, cursor } } }))),
  );
  const coName = (cid: string) => companies.data?.data.find((c) => c.id === cid)?.name ?? "Company";
  const count = (s: string) => apps.data?.data.filter((a) => a.status === s).length ?? 0;

  async function act(kind: "release" | "publish" | "close") {
    if (!drive) return;
    setBusy(kind);
    setMsg(null);
    try {
      if (kind === "release") await call(api.POST("/api/v1/admin/opportunities/{id}/release", { params: { path: { id: drive.id } }, body: {} }));
      else if (kind === "close") await call(api.POST("/api/v1/admin/opportunities/{id}/close", { params: { path: { id: drive.id } } }));
      else await call(api.POST("/api/v1/admin/opportunities/{id}/results/publish", { params: { path: { id: drive.id } } }));
      setMsg({
        tone: "ok",
        text:
          kind === "release"
            ? "Applicants released to the recruiter."
            : kind === "close"
              ? "Drive closed. Students can no longer apply."
              : "Results published to the noticeboard; candidates notified.",
      });
      setConfirmClose(false);
      apps.mutate();
      opps.mutate();
    } catch (e) {
      setMsg({ tone: "err", text: (e as Error).message });
    } finally {
      setBusy("");
    }
  }

  return (
    <Card className="flex scroll-mt-24 flex-col gap-3 p-8">
      <span id="results" />
      <div>
        <h2 className="font-display text-title font-bold text-primary">Publish Drive Results</h2>
        <p className="text-body text-muted">Release applicants to recruiters, then publish their confirmed selections and update placement records.</p>
      </div>
      <State data={opps.data} error={opps.error} retry={() => opps.mutate()} rows={2}>
        {() =>
          !drive ? (
            <Empty icon="work_off" text="No approved drives yet." />
          ) : (
            <>
              <Field label="Select Concluded Drive">
                <Select value={drive.id} onChange={(e) => setId(e.target.value)} className="bg-surface-low shadow-none">
                  {drives.map((o) => (
                    <option key={o.id} value={o.id}>
                      {coName(o.company_id)} - {o.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-2 rounded-sm bg-surface-low p-3 text-center sm:grid-cols-4 lg:grid-cols-2">
                {[
                  ["Applied", count("applied")],
                  ["Released", count("released_to_recruiter")],
                  ["Shortlisted", count("shortlisted")],
                  ["Selected", count("selected")],
                ].map(([l, n]) => (
                  <div key={l}>
                    <p className="font-display text-title font-bold text-primary">{n}</p>
                    <p className="text-caption font-semibold text-muted">{l}</p>
                  </div>
                ))}
              </div>
              <p className="text-caption text-muted">Publishing posts the result on the noticeboard, emails the candidates and updates the placement report.</p>
              {msg && (
                <p
                  className={cx(
                    "rounded-xs px-3 py-2 text-body",
                    msg.tone === "ok" ? "bg-primary-fixed text-primary" : "bg-error-container text-on-error-container",
                  )}
                >
                  {msg.text}
                </p>
              )}
              <Button variant="soft" icon="group_add" busy={busy === "release"} disabled={!count("applied")} onClick={() => act("release")}>
                Release {count("applied")} Applicant(s) to Recruiter
              </Button>
              <Button
                variant="tertiary"
                icon="send"
                busy={busy === "publish"}
                disabled={!count("shortlisted")}
                title="Publishes the selections the recruiter submitted"
                onClick={() => act("publish")}
                className="py-2.5"
              >
                Execute Select Rollout &amp; Notify Candidates
              </Button>
              {drive.status === "approved" &&
                (confirmClose ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-xs bg-error-container p-3 text-body text-on-error-container">
                    <span className="min-w-0 flex-1">Close this drive? Students can no longer apply. Existing applications are kept.</span>
                    <Button size="sm" variant="white" onClick={() => setConfirmClose(false)}>
                      Keep open
                    </Button>
                    <Button size="sm" variant="danger" busy={busy === "close"} onClick={() => act("close")}>
                      Close drive
                    </Button>
                  </div>
                ) : (
                  <Button variant="ghost" icon="block" onClick={() => setConfirmClose(true)}>
                    Close drive to new applicants
                  </Button>
                ))}
            </>
          )
        }
      </State>
    </Card>
  );
}

function Reports() {
  const report = useSWR("reports/placements", () => call(api.GET("/api/v1/admin/reports/placements")));
  const events = useSWR("reports/events", () => call(api.GET("/api/v1/admin/reports/events")));
  return (
    <div id="reports" className="grid scroll-mt-24 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <State data={report.data} error={report.error} retry={() => report.mutate()} empty={(d) => !d.length}>
        {(rows) =>
          rows.slice(0, 2).map((r) => {
            const rate = r.students ? (r.selected / r.students) * 100 : 0;
            return (
              <Card key={r.year ?? "na"} className="flex flex-col gap-1 p-5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-label font-bold text-ink">Batch of {r.year ?? "Unknown year"}</p>
                  <Badge tone="info">{rate.toFixed(1)}% Placed</Badge>
                </div>
                <p className="text-body text-muted">
                  {r.selected} of {r.students} eligible students secured confirmed letters.
                </p>
                <dl className="flex flex-col gap-1 pt-2 text-caption font-semibold text-ink">
                  {[
                    ["Students", r.students],
                    ["Applications", r.applied],
                    ["Selections", r.selected],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            );
          })
        }
      </State>
      <Card className="flex flex-col gap-1 p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-label font-bold text-ink">Event Participation</p>
          <Badge tone="info">{events.data?.length ?? 0} sessions</Badge>
        </div>
        <State data={events.data} error={events.error} rows={2} empty={(d) => !d.length}>
          {(rows) => (
            <dl className="flex flex-col gap-1 pt-2 text-caption font-semibold text-ink">
              {rows.slice(0, 4).map((r) => (
                <div key={r.id} className="flex justify-between gap-2">
                  <dt className="truncate">{r.name}</dt>
                  <dd>
                    {r.attended} attended / {r.registered} registered
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </State>
      </Card>
    </div>
  );
}

function Appeals() {
  const appeals = useSWR("admin/appeals", () => call(api.GET("/api/v1/admin/appeals")));
  const [notes, setNotes] = useState<Record<string, string>>({});
  const { busy, msg, run } = useRun();
  const decide = (a: { student_id: string; name: string }, grant: boolean) =>
    run(
      `${grant ? "g" : "r"}${a.student_id}`,
      async () => {
        await call(
          api.POST("/api/v1/admin/students/{id}/appeal", {
            params: { path: { id: a.student_id } },
            body: { grant, note: notes[a.student_id]?.trim() || undefined },
          }),
        );
        await appeals.mutate();
      },
      grant ? `${a.name} can apply again.` : `${a.name}'s appeal rejected.`,
    );
  return (
    <Card className="flex flex-col gap-3 p-5" >
      <div id="appeals" className="flex scroll-mt-24 items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-title font-bold text-primary">Appeals to Apply Again</h2>
          <p className="text-body text-muted">Placed students can&apos;t apply to new drives. Granting an appeal reopens applying for that student.</p>
        </div>
        <Badge tone={appeals.data?.length ? "warn" : "muted"}>{appeals.data?.length ?? "…"}</Badge>
      </div>
      <Notice msg={msg} />
      <State data={appeals.data} error={appeals.error} retry={() => appeals.mutate()} rows={2}>
        {(rows) =>
          !rows.length ? (
            <Empty icon="task_alt" text="No open appeals." />
          ) : (
            <ul className="flex flex-col gap-3">
              {rows.map((a) => (
                <li key={a.student_id} className="flex flex-col gap-2 rounded-xs bg-surface-low p-3">
                  <p className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-body font-semibold text-ink">
                      {a.name} <span className="font-normal text-muted">• {a.enrolment_no}</span>
                    </span>
                    <span className="text-caption text-muted">{fmtDate(a.at, true)}</span>
                  </p>
                  <p className="text-body break-words whitespace-pre-line text-ink">{a.reason}</p>
                  {!!a.selections.length && (
                    <p className="flex flex-wrap items-center gap-1 text-caption text-muted">
                      Selected in:
                      {a.selections.map((x) => (
                        <Badge key={x.opportunity_id} tone="info">
                          {x.title} • {x.company}
                        </Badge>
                      ))}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={notes[a.student_id] ?? ""}
                      onChange={(e) => setNotes({ ...notes, [a.student_id]: e.target.value })}
                      maxLength={1000}
                      placeholder="Note to the student (optional)"
                      aria-label={`Note to ${a.name}`}
                      className="min-w-0 flex-1 basis-56"
                    />
                    <Button size="sm" icon="lock_open" busy={busy === `g${a.student_id}`} disabled={!!busy} onClick={() => decide(a, true)}>
                      Grant
                    </Button>
                    <Button size="sm" variant="danger" busy={busy === `r${a.student_id}`} disabled={!!busy} onClick={() => decide(a, false)}>
                      Reject
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )
        }
      </State>
    </Card>
  );
}

type Rating = Json<"/api/v1/admin/student-feedback">[number];

function StudentFeedback() {
  const [target, setTarget] = useState<"event" | "opportunity">("event");
  const fb = useSWR(["admin/student-feedback", target], () => call(api.GET("/api/v1/admin/student-feedback", { params: { query: { target } } })));
  const groups = Object.values(Object.groupBy(fb.data ?? [], (r) => r.target_id)).map((rs) => {
    const list = rs as Rating[];
    return { id: list[0].target_id, name: list[0].target_name, avg: list.reduce((n, r) => n + r.rating, 0) / list.length, list };
  });
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div id="feedback" className="flex scroll-mt-24 flex-col justify-between gap-2 sm:flex-row sm:items-start">
        <div>
          <h2 className="font-display text-title font-bold text-primary">Student Feedback</h2>
          <p className="text-body text-muted">Ratings (1 to 5) students gave to trainings they attended and recruiters they applied to.</p>
        </div>
        <Tabs
          value={target}
          onChange={setTarget}
          tabs={[
            { id: "event", label: "Trainings", icon: "school" },
            { id: "opportunity", label: "Recruiters", icon: "corporate_fare" },
          ]}
        />
      </div>
      <State data={fb.data} error={fb.error} retry={() => fb.mutate()} rows={2}>
        {() =>
          !groups.length ? (
            <Empty icon="star" text={target === "event" ? "No training ratings yet." : "No recruiter ratings yet."} />
          ) : (
            <ul className="flex flex-col gap-2">
              {groups
                .toSorted((a, b) => b.list.length - a.list.length)
                .map((g) => (
                  <li key={g.id} className="rounded-xs bg-surface-low p-3">
                    <details className="group">
                      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                        <span className="min-w-0 text-body font-semibold break-words text-ink">{g.name}</span>
                        <span className="flex items-center gap-2 text-body">
                          <span className="flex items-center gap-0.5 font-bold text-tertiary" aria-label={`Average ${g.avg.toFixed(1)} out of 5`}>
                            <Icon name="star" filled /> {g.avg.toFixed(1)}
                          </span>
                          <span className="text-caption text-muted">
                            {g.list.length} rating{g.list.length === 1 ? "" : "s"}
                          </span>
                          <Icon name="expand_more" className="text-muted transition-transform group-open:rotate-180" />
                        </span>
                      </summary>
                      <ul className="flex flex-col gap-1 pt-2">
                        {g.list.map((r) => (
                          <li key={r.id} className="flex flex-col gap-0.5 rounded-xs bg-white p-2 text-body">
                            <span className="flex flex-wrap justify-between gap-2 text-caption text-muted">
                              <span>
                                {r.student.name} • {r.student.enrolment_no}
                              </span>
                              <span>
                                {r.rating}/5 • {fmtDate(r.created_at)}
                              </span>
                            </span>
                            {r.comment ? <span className="break-words text-ink">{r.comment}</span> : <span className="text-muted">No comment.</span>}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ))}
            </ul>
          )
        }
      </State>
    </Card>
  );
}
