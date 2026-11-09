"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Badge, Button, Card, Empty, Field, Input, Modal, Select, State, cx } from "@/components/ui";
import { api, call } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { fmtDate, initialsOf } from "@/lib/format";
import { CandidateDetail } from "./CandidateDetail";
import { FileButton } from "./FileButton";
import { STAGE_LABEL, type Applicant, type Posting } from "./model";

export function Candidates({
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
  const [noBacklogs, setNoBacklogs] = useState(false);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [iv, setIv] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [open, setOpen] = useState<Applicant | null>(null);
  const PER = 5;

  const rows = useMemo(
    () =>
      (q.data?.data ?? []).filter((a) => {
        const s = a.student;
        const hay = `${(s.user as { name?: string }).name ?? ""} ${s.enrolment_no} ${s.professional_interests ?? ""}`.toLowerCase();
        return (!prog || s.programme_id === prog) && (!minCgpa || (s.cgpa ?? 0) >= minCgpa) && (!noBacklogs || s.active_backlogs === 0) && (!kw || hay.includes(kw.toLowerCase()));
      }),
    [q.data, prog, minCgpa, kw, noBacklogs],
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
    const head = ["Name", "Email", "Enrolment", "Programme", "CGPA", "Active backlogs", "Cleared backlogs", "Applied", "Stage"];
    const lines = rows.map((a) => {
      const u = a.student.user as { name?: string; email?: string };
      return [u.name, u.email, a.student.enrolment_no, progName(a.student.programme_id), a.student.cgpa, a.student.active_backlogs, a.student.cleared_backlogs, a.created_at.slice(0, 10), STAGE_LABEL[a.status]];
    });
    downloadCsv(`${drive.title}-candidates.csv`, [head, ...lines]);
  }

  return (
    <Card className="flex scroll-mt-24 flex-col overflow-hidden">
      <span id="candidates" />
      <div className="flex flex-col justify-between gap-3 p-5 pb-3 md:flex-row md:items-start">
        <div>
          <h2 className="font-display text-title font-semibold text-primary">Candidates</h2>
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

      <div className="mx-5 grid gap-3 rounded-xs bg-surface-low p-3 sm:grid-cols-3">
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
        <label className="flex cursor-pointer items-center gap-2 text-label font-semibold text-ink">
          <input type="checkbox" checked={noBacklogs} onChange={(e) => (setNoBacklogs(e.target.checked), setPage(0))} className="size-4 accent-primary" />
          Only students who confirmed no active backlogs
        </label>
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
              <table className="w-full min-w-[900px] text-left">
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
                    <th className="px-2 py-3">Backlogs</th>
                    <th className="px-2 py-3">Technical Core</th>
                    <th className="px-2 py-3">Resume</th>
                    <th className="px-2 py-3">Applied Date</th>
                    <th className="px-2 py-3">Drive Stage</th>
                    <th className="px-2 py-3 pr-4">Profile</th>
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
                        <td className="px-2 py-3 whitespace-nowrap">{s.active_backlogs == null && s.cleared_backlogs == null ? "—" : `${s.active_backlogs ?? "—"} active • ${s.cleared_backlogs ?? "—"} cleared`}</td>
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
                            <FileButton id={s.resume_file_id} label={`View PDF: resume of ${u.name}`}>
                              View PDF
                            </FileButton>
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
                        <td className="px-2 py-3 pr-4">
                          <Button size="sm" variant="soft" icon="badge" onClick={() => setOpen(a)} aria-label={`View profile of ${u.name}`} className="min-h-7">
                            Profile{s.records.length > 0 && ` • ${s.records.length}`}
                          </Button>
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
      {open && <CandidateDetail a={open} programme={progName(open.student.programme_id)} onClose={() => setOpen(null)} />}
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
