"use client";

import { useState } from "react";
import useSWR from "swr";
import { AppShell } from "@/components/AppShell";
import { Badge, Button, Card, Empty, Field, Icon, Input, Modal, Notice, PageHead, SectionTitle, Select, State, cx, useRun } from "@/components/ui";
import { ApiError, api, call, fileBody, openFile } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import type { paths } from "@/lib/api-types";
import { fmtDate, initialsOf } from "@/lib/format";
import { ADMIN_NAV } from "../nav";
import { NoticeComposer } from "../NoticeComposer";
import { EMPTY_FILTER, FilterChips, StudentFilterFields, filterQuery, isTargeted, useProgrammes } from "../StudentFilterFields";

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

const YES_NO = "yes / no";
// Mirrors IMPORT_FIELDS in backend students.schemas.ts (every Editable field except name/programme_id), with an example each.
const IMPORT_COLUMNS: [name: string, need: "Required" | "Optional", rule: string, example: string | number][] = [
  ["enrolment_no", "Required", "3 letters + 5–6 digits", "CSB21045"],
  ["name", "Required", "Full name, at least 2 characters", "Priyanshu Sharma"],
  ["email", "Required", "University address", "csb21045@tezu.ac.in"],
  ["programme_code", "Optional", "Programme code (blank if unknown)", "CSB"],
  ["mobile", "Optional", "Phone number", "9876543210"],
  ["dob", "Optional", "Date of birth, YYYY-MM-DD", "2003-05-14"],
  ["gender", "Optional", "Text", "Female"],
  ["category", "Optional", "Text, e.g. General / OBC / SC / ST", "General"],
  ["minority", "Optional", YES_NO, "no"],
  ["specially_abled", "Optional", YES_NO, "no"],
  ["regional_diversity", "Optional", "Text", "North East"],
  ["jee_rank", "Optional", "Whole number", 15234],
  ["jee_score", "Optional", "Number", 182],
  ["jee_percentile", "Optional", "0–100", 97.5],
  ["gate_qualified", "Optional", YES_NO, "no"],
  ["gate_score", "Optional", "Number", ""],
  ["department", "Optional", "Department name", "Computer Science & Engineering"],
  ["year_of_admission", "Optional", "Year", 2022],
  ["year_of_completion", "Optional", "Graduation year (batch)", 2026],
  ["cgpa", "Optional", "0–10", 8.4],
  ["current_address", "Optional", "Text", "Hostel 3, Tezpur University"],
  ["permanent_address", "Optional", "Text", "Guwahati, Assam"],
  ["marks_10", "Optional", "Percent, 0–100", 92],
  ["yop_10", "Optional", "Year passed", 2019],
  ["marks_12", "Optional", "Percent, 0–100", 88],
  ["yop_12", "Optional", "Year passed", 2021],
  ["marks_ug", "Optional", "Percent, 0–100", ""],
  ["yop_ug", "Optional", "Year passed", ""],
  ["marks_pg", "Optional", "Percent, 0–100", ""],
  ["yop_pg", "Optional", "Year passed", ""],
  ["other_courses", "Optional", "Text", ""],
  ["professional_interests", "Optional", "Text", "Machine learning"],
  ["certifications", "Optional", "Text", ""],
  ["portfolio_url", "Optional", "Full URL", "https://example.dev"],
  ["linkedin_url", "Optional", "Full URL", "https://www.linkedin.com/in/example"],
  ["specialization", "Optional", "Text", "Machine learning"],
  ["technical_skills", "Optional", "Comma-separated", "Python, SQL, AWS"],
  ["career_interests", "Optional", "Comma-separated roles", "Software engineer, R&D"],
  ["extracurriculars", "Optional", "Text", "Placement committee member"],
  ["about_me", "Optional", "A few lines about the student", ""],
];
const IMPORT_TEMPLATE = [IMPORT_COLUMNS.map(([n]) => n), IMPORT_COLUMNS.map(([, , , ex]) => ex)];

type CsvProblem = { line: number; issues: string[] };

function ImportCard() {
  const { busy, msg, run } = useRun();
  const [jobId, setJobId] = useState<string | null>(null);
  const [problems, setProblems] = useState<{ list: CsvProblem[]; total: number } | null>(null);
  const progs = useSWR("programmes", () => call(api.GET("/api/v1/programmes")));
  const job = useSWR(jobId ? ["job", jobId] : null, () => call(api.GET("/api/v1/admin/jobs/{id}", { params: { path: { id: jobId! } } })), {
    refreshInterval: (j) => (j?.finished_at ? 0 : 1500),
  });
  const report = job.data?.result as { created?: number; updated?: number; skipped?: { enrolment_no: string; reason: string }[] } | null | undefined;

  return (
    <Card className="flex flex-col gap-4 p-5">
      <SectionTitle
        icon="upload_file"
        title="Bulk Import from CSV"
        sub="Add or update many students at once. New students start as active with no password: each sets their own through “Forgot password”, which also proves they own their university inbox. No emails are sent."
      >
        <Button variant="ghost" icon="download" onClick={() => downloadCsv("student-import-template.csv", IMPORT_TEMPLATE)}>
          Template
        </Button>
      </SectionTitle>

      <div className="overflow-hidden rounded-xs bg-surface-low text-caption">
        <div className="hidden grid-cols-[9.5rem_4.5rem_1fr] gap-x-3 px-3 py-1.5 font-bold text-muted uppercase sm:grid">
          <span>Column</span>
          <span>Needed</span>
          <span>Format</span>
        </div>
        {IMPORT_COLUMNS.slice(0, 4).map((c) => (
          <ColumnRow key={c[0]} c={c} />
        ))}
        <details className="group border-t border-outline-variant/40">
          <summary className="flex cursor-pointer list-none items-center gap-1 px-3 py-1.5 font-semibold text-primary [&::-webkit-details-marker]:hidden">
            <Icon name="expand_more" className="transition-transform group-open:rotate-180" />
            <span className="group-open:hidden">Show all {IMPORT_COLUMNS.length - 4} optional profile columns</span>
            <span className="hidden group-open:inline">Hide profile columns</span>
          </summary>
          {IMPORT_COLUMNS.slice(4).map((c) => (
            <ColumnRow key={c[0]} c={c} />
          ))}
        </details>
      </div>
      <ul className="list-disc space-y-0.5 pl-4 text-caption text-muted">
        <li>First row must be the column names above. Up to 10,000 rows per file.</li>
        <li>The whole file is checked first: if any row is wrong, nothing is imported and the problem lines are listed below.</li>
        <li>Only enrolment_no, name and email are required; include any other column you have. Blank cells leave the field unchanged.</li>
        <li>Re-uploading updates existing students (same enrolment number and email) with the file&apos;s values, so you can fill in profiles later.</li>
        <li>yes/no columns also accept true/false or 1/0. Dates are YYYY-MM-DD.</li>
        <li>
          The T&amp;P profile sheet can be uploaded as it is (Roll Number, Student Name, Programme, Project 1…). The university email is built from the roll
          number, rows with no roll number are skipped and listed in the report, and projects and internships are added to the student&apos;s records. Create
          the programmes first: a programme that does not exist skips that row.
        </li>
        {!!progs.data?.length && <li>Programme codes in use: {progs.data.map((p) => p.code).join(", ")}.</li>}
      </ul>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const file = new FormData(e.currentTarget).get("file") as File;
          setProblems(null);
          setJobId(null);
          run(
            "import",
            async () => {
              try {
                const r = await call(api.POST("/api/v1/admin/students/import", fileBody(file)));
                setJobId(r.job_id);
              } catch (err) {
                const d = err instanceof ApiError ? err.details : {};
                if (Array.isArray(d.csv_errors)) setProblems({ list: d.csv_errors as CsvProblem[], total: Number(d.error_count) || d.csv_errors.length });
                throw err;
              }
            },
            "Import started.",
          );
        }}
      >
        <Field label="CSV file" className="min-w-0 flex-1">
          <Input
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            className="py-1.5 file:mr-3 file:rounded-xs file:border-0 file:bg-surface file:px-3 file:py-1 file:text-label file:font-semibold file:text-primary hover:file:bg-surface-high"
          />
        </Field>
        <Button type="submit" busy={busy === "import"} icon="publish">
          Start Import
        </Button>
      </form>
      <Notice msg={msg} />

      {problems && (
        <div className="rounded-xs bg-error-container p-3 text-body text-on-error-container">
          <p className="font-semibold">
            {problems.total} row{problems.total === 1 ? "" : "s"} need fixing. Correct the file and upload it again.
          </p>
          <ul className="mt-1 space-y-0.5 text-caption">
            {problems.list.slice(0, 8).map((p) => (
              <li key={p.line}>
                <b>Line {p.line}:</b> {p.issues.join("; ")}
              </li>
            ))}
            {problems.total > 8 && <li>…and {problems.total - 8} more.</li>}
          </ul>
        </div>
      )}

      {job.data && (
        <div className="rounded-xs bg-surface-low p-3 text-body">
          {!job.data.finished_at ? (
            <p className="flex items-center gap-2 font-semibold text-ink">
              <Icon name="progress_activity" className="animate-spin" /> Importing…
            </p>
          ) : job.data.status === "failed" ? (
            <p className="text-error">Import failed: {job.data.last_error ?? "unknown error"}. Nothing was lost; you can upload the file again.</p>
          ) : (
            <>
              <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                Import finished
                <Badge tone="info">{report?.created ?? 0} added</Badge>
                <Badge tone="info">{report?.updated ?? 0} updated</Badge>
                <Badge>{report?.skipped?.length ?? 0} skipped</Badge>
              </p>
              {!!report?.skipped?.length && (
                <ul className="mt-2 max-h-40 overflow-auto rounded-xs bg-white p-2 text-caption text-muted">
                  {report.skipped.map((k) => (
                    <li key={k.enrolment_no}>
                      <b className="text-ink">{k.enrolment_no}</b>: {k.reason}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function ColumnRow({ c: [name, need, rule] }: { c: (typeof IMPORT_COLUMNS)[number] }) {
  return (
    <div className="grid gap-x-3 border-t border-outline-variant/40 px-3 py-1.5 first:border-t-0 sm:grid-cols-[9.5rem_4.5rem_1fr]">
      <code className="font-semibold break-all text-ink">{name}</code>
      <span className={need === "Required" ? "font-semibold text-tertiary" : "text-muted"}>{need}</span>
      <span className="min-w-0 break-words text-muted">{rule}</span>
    </div>
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
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const cursor = cursors.at(-1);
  const fq = filterQuery(filter);
  const list = useSWR(["admin/students", q, status, JSON.stringify(fq), cursor], () =>
    call(api.GET("/api/v1/admin/students", { params: { query: { q: q || undefined, status: status || undefined, ...fq, cursor, limit: 25 } } })),
  );
  const progs = useProgrammes();
  const [open, setOpen] = useState<Row | null>(null);
  const [notify, setNotify] = useState(false);
  const reset = () => setCursors([undefined]);

  return (
    <Card className="flex flex-col gap-3 p-5">
      <SectionTitle icon="groups" title="Roster" sub="Click a student to correct their record, change probation, or run account repairs.">
        <Button variant="soft" icon="campaign" onClick={() => setNotify(true)}>
          Send notice to these students
        </Button>
      </SectionTitle>
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
      <details className="group rounded-xs bg-surface-low p-3" open={isTargeted(filter)}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-label font-semibold text-ink [&::-webkit-details-marker]:hidden">
          <span className="flex flex-wrap items-center gap-2">
            <Icon name="filter_alt" /> Department, programme, batch, CGPA
            <FilterChips f={filter} programmes={progs.data} />
          </span>
          <Icon name="expand_more" className="transition-transform group-open:rotate-180" />
        </summary>
        <div className="flex flex-col gap-2 pt-3">
          <StudentFilterFields roster value={filter} onChange={(f) => (setFilter(f), reset())} />
          {isTargeted(filter) && (
            <Button size="sm" variant="ghost" icon="filter_alt_off" className="self-start" onClick={() => (setFilter(EMPTY_FILTER), reset())}>
              Clear filters
            </Button>
          )}
        </div>
      </details>
      <div className="overflow-x-auto">
        <State data={list.data} error={list.error} retry={() => list.mutate()} rows={5}>
          {({ data, page }) =>
            !data.length ? (
              <Empty icon="person_search" text="No students match." />
            ) : (
              <>
                <table className="w-full min-w-[840px] text-left text-body">
                  <thead className="bg-surface-low text-caption font-semibold tracking-[0.55px] text-muted uppercase">
                    <tr>
                      {["Enrolment", "Student", "Programme", "CGPA", "Batch", "Portal", "Status", ""].map((h) => (
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
                          <Badge tone={s.account_claimed ? "info" : "muted"}>{s.account_claimed ? "Joined" : "Not joined"}</Badge>
                        </td>
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
      {notify && (
        <Modal title="Notice to these students" onClose={() => setNotify(false)} wide>
          {(q || status) && (
            <p role="note" className="flex items-start gap-2 rounded-xs bg-tertiary-fixed px-3 py-2 text-body text-on-accent">
              <Icon name="info" />
              Notices target by department, programme, batch, CGPA and placement only. The{" "}
              {[q && "name search", status && "status filter"].filter(Boolean).join(" and ")} you set on the roster can&apos;t be applied, so this notice
              reaches every active student matching the other filters.
            </p>
          )}
          <NoticeComposer initial={filter} />
        </Modal>
      )}
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

      <StudentRecords id={s.id} />

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

const KIND = { certificate: "Certificate", internship: "Internship", project: "Project" } as const;

function StudentRecords({ id }: { id: string }) {
  const recs = useSWR(["admin/student-records", id], () => call(api.GET("/api/v1/admin/students/{id}/records", { params: { path: { id } } })));
  return (
    <div className="flex flex-col gap-2 rounded-xs bg-surface-low p-3">
      <p className="text-label font-bold text-ink uppercase">Certificates, internships &amp; projects</p>
      <State data={recs.data} error={recs.error} retry={() => recs.mutate()} rows={2}>
        {(rows) =>
          !rows.length ? (
            <p className="text-body text-muted">The student hasn&apos;t added any yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-col justify-between gap-2 rounded-xs bg-white p-2 sm:flex-row sm:items-center">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-body font-semibold text-ink">
                      <Badge tone="soft">{KIND[r.kind]}</Badge>
                      <span className="break-words">{r.title}</span>
                    </p>
                    <p className="text-caption break-words text-muted">
                      {[r.organisation, [r.start_month, r.end_month].filter(Boolean).join(" to ")].filter(Boolean).join(" • ")}
                    </p>
                    {r.description && <p className="text-caption break-words text-muted">{r.description}</p>}
                  </div>
                  <span className="flex shrink-0 gap-2">
                    {r.url && (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-xs px-2 py-1 text-caption font-semibold text-primary underline"
                      >
                        <Icon name="link" /> Link
                      </a>
                    )}
                    {r.file_id && (
                      <Button type="button" size="sm" variant="ghost" icon="attach_file" onClick={() => openFile(r.file_id!)}>
                        File
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )
        }
      </State>
    </div>
  );
}
