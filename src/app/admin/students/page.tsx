"use client";

import { useState } from "react";
import useSWR from "swr";
import { AppShell } from "@/components/AppShell";
import { Badge, Button, Card, Empty, Field, Icon, Input, Modal, Notice, PageHead, SectionTitle, Select, State, cx, useRun } from "@/components/ui";
import { api, call, fileBody, openFile } from "@/lib/api";
import type { paths } from "@/lib/api-types";
import { fmtDate, initialsOf } from "@/lib/format";
import { ADMIN_NAV } from "../nav";

type Row = paths["/api/v1/admin/students"]["get"]["responses"]["200"]["content"]["application/json"]["data"][number];
type Status = NonNullable<NonNullable<paths["/api/v1/admin/students"]["get"]["parameters"]["query"]>["status"]>;

const STATUS: Record<Status, string> = {
  pending_email_verify: "Email not verified",
  pending_admin: "Awaiting approval",
  active: "Active",
  rejected: "Rejected",
  alumni: "Alumni",
};

export default function StudentsPage() {
  return (
    <AppShell role="admin" nav={ADMIN_NAV} active="/admin/students">
      <div className="mx-auto flex max-w-[976px] flex-col gap-5">
        <PageHead
          eyebrow="Academic Records Desk"
          title="Student Roster"
          sub="Search, correct records, manage probation, bulk-import from CSV and fix account problems."
        />
        <div className="grid gap-5 lg:grid-cols-2">
          <ImportCard />
          <GraduateCard />
        </div>
        <Roster />
      </div>
    </AppShell>
  );
}

function ImportCard() {
  const { busy, msg, run } = useRun();
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useSWR(jobId ? ["job", jobId] : null, () => call(api.GET("/api/v1/admin/jobs/{id}", { params: { path: { id: jobId! } } })), {
    refreshInterval: (j) => (j?.finished_at ? 0 : 1500),
  });

  return (
    <Card className="flex flex-col gap-3 p-5">
      <SectionTitle
        icon="upload_file"
        title="Bulk Import from CSV"
        sub="Columns: enrolment_no, name, email [, programme_code, year_of_completion, mobile]. Imported students set their first password via “Forgot password”."
      />
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const file = new FormData(e.currentTarget).get("file") as File;
          run(
            "import",
            async () => {
              const r = await call(api.POST("/api/v1/admin/students/import", fileBody(file)));
              setJobId(r.job_id);
            },
            "Import queued.",
          );
        }}
      >
        <Field label="CSV file" className="flex-1">
          <Input name="file" type="file" accept=".csv,text/csv" required className="py-1.5" />
        </Field>
        <Button type="submit" busy={busy === "import"} icon="publish">
          Start Import
        </Button>
      </form>
      <Notice msg={msg} />
      {job.data && (
        <div className="rounded-xs bg-surface-low p-3 text-body">
          <p className="flex items-center justify-between font-semibold text-ink">
            Job {job.data.id.slice(0, 8)} <Badge tone={job.data.status === "failed" ? "error" : "info"}>{job.data.status}</Badge>
          </p>
          {job.data.last_error && <p className="text-error">{job.data.last_error}</p>}
          {job.data.result != null && (
            <pre className="mt-2 max-h-48 overflow-auto rounded-xs bg-white p-2 text-caption whitespace-pre-wrap">
              {JSON.stringify(job.data.result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </Card>
  );
}

function GraduateCard() {
  const { busy, msg, run } = useRun();
  const [confirm, setConfirm] = useState(false);
  return (
    <Card className="flex flex-col gap-3 p-5">
      <SectionTitle
        icon="school"
        title="Alumni Transition"
        sub="Students move to read-only alumni after their year of completion (cut-off date in System settings). Runs daily; run it now if needed."
      />
      {confirm ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xs bg-tertiary-fixed p-3 text-body text-on-accent">
          <Icon name="warning" /> Graduating students lose the ability to apply or register. Continue?
          <Button
            size="sm"
            variant="tertiary"
            busy={busy === "grad"}
            onClick={() => run("grad", () => call(api.POST("/api/v1/admin/students/graduate")), "Alumni transition finished.").then(() => setConfirm(false))}
          >
            Yes, run now
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button variant="soft" icon="published_with_changes" onClick={() => setConfirm(true)} className="w-fit">
          Run Alumni Transition Now
        </Button>
      )}
      <Notice msg={msg} />
    </Card>
  );
}

function Roster() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status | "">("");
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const cursor = cursors.at(-1);
  const list = useSWR(["admin/students", q, status, cursor], () =>
    call(api.GET("/api/v1/admin/students", { params: { query: { q: q || undefined, status: status || undefined, cursor, limit: 25 } } })),
  );
  const progs = useSWR("programmes", () => call(api.GET("/api/v1/programmes")));
  const [open, setOpen] = useState<Row | null>(null);
  const reset = () => setCursors([undefined]);

  return (
    <Card className="flex flex-col gap-3 p-5">
      <SectionTitle icon="groups" title="Roster" sub="Click a student to correct their record, change probation, or run account repairs." />
      <div className="flex flex-wrap gap-2">
        <label className="relative flex-1">
          <Icon name="search" className="absolute top-2.5 left-2 text-muted" />
          <Input
            value={q}
            onChange={(e) => (setQ(e.target.value), reset())}
            placeholder="Search name or enrolment no."
            className="pl-8"
            aria-label="Search students"
          />
        </label>
        <Select value={status} onChange={(e) => (setStatus(e.target.value as Status | ""), reset())} className="w-52" aria-label="Status filter">
          <option value="">All statuses</option>
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </div>
      <div className="overflow-x-auto">
        <State data={list.data} error={list.error} retry={() => list.mutate()} rows={5}>
          {({ data, page }) =>
            !data.length ? (
              <Empty icon="person_search" text="No students match." />
            ) : (
              <>
                <table className="w-full min-w-[760px] text-left text-body">
                  <thead className="bg-surface-low text-caption font-semibold tracking-[0.55px] text-muted uppercase">
                    <tr>
                      {["Enrolment", "Student", "Programme", "CGPA", "Batch", "Status", ""].map((h) => (
                        <th key={h} className="px-3 py-2">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((s) => (
                      <tr key={s.id} className="border-t border-surface">
                        <td className="px-3 py-2.5 font-bold">{s.enrolment_no}</td>
                        <td className="px-3 py-2.5">
                          <span className="flex items-center gap-2">
                            <span className="grid size-7 shrink-0 place-items-center rounded-xl bg-surface-high text-caption font-bold">
                              {initialsOf(s.user.name)}
                            </span>
                            <span>
                              <span className="block font-semibold">{s.user.name}</span>
                              <span className="text-caption text-muted">{s.user.email}</span>
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-muted">{progs.data?.find((p) => p.id === s.programme_id)?.name ?? s.department ?? "—"}</td>
                        <td className="px-3 py-2.5 font-bold">{s.cgpa ?? "—"}</td>
                        <td className="px-3 py-2.5">{s.year_of_completion ?? "—"}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            <Badge tone={s.user.status === "active" ? "info" : s.user.status === "rejected" ? "error" : "muted"}>
                              {STATUS[s.user.status as Status] ?? s.user.status}
                            </Badge>
                            {s.academic_standing === "probation" && <Badge tone="error">Probation</Badge>}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Button size="sm" variant="soft" onClick={() => setOpen(s)}>
                            Manage
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-end gap-2 pt-3">
                  <Button size="sm" variant="ghost" disabled={cursors.length < 2} onClick={() => setCursors(cursors.slice(0, -1))}>
                    Previous
                  </Button>
                  <Button size="sm" variant="ghost" disabled={!page.has_more} onClick={() => setCursors([...cursors, page.cursor ?? undefined])}>
                    Next
                  </Button>
                </div>
              </>
            )
          }
        </State>
      </div>
      {open && <ManageStudent s={open} programmes={progs.data ?? []} onClose={() => (setOpen(null), list.mutate())} />}
    </Card>
  );
}

type Programme = paths["/api/v1/programmes"]["get"]["responses"]["200"]["content"]["application/json"][number];

function ManageStudent({ s, programmes, onClose }: { s: Row; programmes: Programme[]; onClose: () => void }) {
  const edit = useRun();
  const repair = useRun();
  const [probation, setProbation] = useState(s.academic_standing === "probation");
  const [reason, setReason] = useState("");
  const [danger, setDanger] = useState(false);
  const u = s.user_id;

  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const g = (k: string) => String(fd.get(k) ?? "").trim();
    const num = (k: string) => (g(k) ? Number(g(k)) : undefined);
    edit.run(
      "save",
      () =>
        call(
          api.PATCH("/api/v1/admin/students/{id}", {
            params: { path: { id: s.id } },
            body: {
              name: g("name") || undefined,
              mobile: g("mobile") || undefined,
              dob: g("dob") || undefined,
              programme_id: g("programme_id") || undefined,
              year_of_completion: num("year_of_completion"),
              cgpa: num("cgpa"),
            },
          }),
        ),
      "Record updated (audited).",
    );
  }

  return (
    <Modal title={`${s.user.name} • ${s.enrolment_no}`} onClose={onClose} wide>
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <Input name="name" defaultValue={s.user.name} minLength={2} />
        </Field>
        <Field label="Mobile">
          <Input name="mobile" defaultValue={s.mobile ?? ""} pattern="\+?\d{10,13}" />
        </Field>
        <Field label="Date of Birth">
          <Input name="dob" type="date" defaultValue={s.dob?.slice(0, 10)} />
        </Field>
        <Field label="CGPA">
          <Input name="cgpa" type="number" step="0.01" min="0" max="10" defaultValue={s.cgpa ?? ""} />
        </Field>
        <Field label="Programme">
          <Select name="programme_id" defaultValue={s.programme_id ?? ""}>
            <option value="">—</option>
            {programmes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Year of Completion">
          <Input name="year_of_completion" type="number" min="2000" max="2100" defaultValue={s.year_of_completion ?? ""} />
        </Field>
        <div className="flex items-center justify-between gap-2 sm:col-span-2">
          <span className="flex gap-2">
            {s.resume_file_id && (
              <Button type="button" size="sm" variant="ghost" icon="description" onClick={() => openFile(s.resume_file_id!)}>
                Resume
              </Button>
            )}
            {s.photo_file_id && (
              <Button type="button" size="sm" variant="ghost" icon="image" onClick={() => openFile(s.photo_file_id!)}>
                Photo
              </Button>
            )}
          </span>
          <Button type="submit" busy={edit.busy === "save"}>
            Save Record
          </Button>
        </div>
        <div className="sm:col-span-2">
          <Notice msg={edit.msg} />
        </div>
      </form>

      <div className="flex flex-col gap-2 rounded-xs bg-surface-low p-3">
        <p className="text-label font-bold text-ink uppercase">Academic probation</p>
        <p className="text-body text-muted">Probation blocks applying to drives and registering for events.</p>
        <div className="flex flex-wrap items-center gap-2">
          {!probation && (
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required to put on probation)" className="flex-1" />
          )}
          <Button
            size="sm"
            variant={probation ? "soft" : "danger"}
            busy={repair.busy === "prob"}
            disabled={!probation && reason.trim().length < 3}
            onClick={() =>
              repair
                .run(
                  "prob",
                  () =>
                    call(
                      api.POST("/api/v1/admin/students/{id}/probation", {
                        params: { path: { id: s.id } },
                        body: probation ? { on: false } : { on: true, reason },
                      }),
                    ),
                  probation ? "Probation lifted." : "Student put on probation.",
                )
                .then((ok) => ok && setProbation(!probation))
            }
          >
            {probation ? "Lift Probation" : "Put on Probation"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-xs bg-surface-low p-3">
        <p className="text-label font-bold text-ink uppercase">Account repairs</p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="white"
            icon="lock_reset"
            busy={repair.busy === "reset"}
            onClick={() =>
              repair.run(
                "reset",
                () => call(api.POST("/api/v1/admin/users/{id}/reset-password", { params: { path: { id: u } } })),
                "One-time password emailed; they must change it at next login.",
              )
            }
          >
            Email One-time Password
          </Button>
          <Button
            size="sm"
            variant="white"
            icon="lock_open"
            busy={repair.busy === "unlock"}
            onClick={() =>
              repair.run("unlock", () => call(api.POST("/api/v1/admin/users/{id}/clear-rate-limit", { params: { path: { id: u } } })), "Sign-in limit cleared.")
            }
          >
            Clear Sign-in Lock
          </Button>
          {s.user.status === "pending_email_verify" && (
            <>
              <Button
                size="sm"
                variant="white"
                icon="mark_email_unread"
                busy={repair.busy === "otp"}
                onClick={() =>
                  repair.run("otp", () => call(api.POST("/api/v1/admin/users/{id}/resend-otp", { params: { path: { id: u } } })), "Verification code re-sent.")
                }
              >
                Resend Verification Code
              </Button>
              {danger ? (
                <Button
                  size="sm"
                  variant="danger"
                  busy={repair.busy === "del"}
                  onClick={() =>
                    repair
                      .run(
                        "del",
                        () => call(api.POST("/api/v1/admin/users/{id}/delete-unverified", { params: { path: { id: u } } })),
                        "Unverified account deleted.",
                      )
                      .then((ok) => ok && onClose())
                  }
                >
                  Confirm Permanent Delete
                </Button>
              ) : (
                <Button size="sm" variant="danger" icon="delete" onClick={() => setDanger(true)}>
                  Delete Unverified Account
                </Button>
              )}
            </>
          )}
        </div>
        <Notice msg={repair.msg} />
      </div>
      <p className={cx("text-caption text-muted")}>
        Enrolled {s.year_of_admission ?? "—"} • DOB {fmtDate(s.dob)}
      </p>
    </Modal>
  );
}
