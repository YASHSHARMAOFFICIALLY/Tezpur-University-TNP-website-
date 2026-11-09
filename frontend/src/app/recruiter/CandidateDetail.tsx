"use client";

import { Badge, Icon, Modal } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { FileButton } from "./FileButton";
import { STAGE_LABEL, monthRange, type Applicant } from "./model";

type StudentRecord = Applicant["student"]["records"][number];
const KINDS: [StudentRecord["kind"], string, string][] = [
  ["internship", "Internships", "work_history"],
  ["project", "Projects", "code_blocks"],
  ["certificate", "Certificates", "workspace_premium"],
];

export function CandidateDetail({ a, programme, onClose }: { a: Applicant; programme: string; onClose: () => void }) {
  const s = a.student;
  const u = s.user as { name?: string; email?: string };
  const facts: [string, string | number | null][] = [
    ["Enrolment", s.enrolment_no],
    ["Programme", programme],
    ["CGPA", s.cgpa?.toFixed(2) ?? null],
    ["Backlogs", s.active_backlogs == null && s.cleared_backlogs == null ? null : `${s.active_backlogs ?? "—"} active • ${s.cleared_backlogs ?? "—"} cleared`],
    ["Batch", s.year_of_completion],
    ["Mobile", s.mobile],
    ["Applied", fmtDate(a.created_at)],
  ];
  return (
    <Modal title={u.name ?? "Candidate"} onClose={onClose} wide>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="info">{STAGE_LABEL[a.status]}</Badge>
        {u.email && <span className="text-body text-muted">{u.email}</span>}
      </div>
      <dl className="grid grid-cols-2 gap-2 rounded-xs bg-surface-low p-3 sm:grid-cols-3">
        {facts.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-caption font-semibold text-muted">{k}</dt>
            <dd className="truncate text-body font-semibold text-ink">{v ?? "—"}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2">
        {s.resume_file_id && <FileButton id={s.resume_file_id}>Resume</FileButton>}
        {s.linkedin_url && <ExtLink href={s.linkedin_url}>LinkedIn</ExtLink>}
        {s.portfolio_url && <ExtLink href={s.portfolio_url}>Portfolio</ExtLink>}
      </div>
      {s.professional_interests && (
        <p className="text-body text-ink">
          <b className="text-caption font-semibold text-muted">Interests</b> {s.professional_interests}
        </p>
      )}
      {s.records.length ? (
        KINDS.map(([kind, title, icon]) => {
          const rows = s.records.filter((r) => r.kind === kind);
          return (
            rows.length > 0 && (
              <section key={kind} className="flex flex-col gap-2">
                <h3 className="flex items-center gap-1 text-label font-bold text-ink">
                  <Icon name={icon} className="text-primary" /> {title} ({rows.length})
                </h3>
                <ul className="flex flex-col gap-2">
                  {rows.map((r) => (
                    <RecordRow key={r.id} r={r} />
                  ))}
                </ul>
              </section>
            )
          );
        })
      ) : (
        <p className="rounded-xs bg-surface-low px-3 py-4 text-center text-body text-muted">No certificates, internships or projects added by this student.</p>
      )}
    </Modal>
  );
}

function RecordRow({ r }: { r: StudentRecord }) {
  const months = monthRange(r.start_month, r.end_month);
  return (
    <li className="flex flex-col gap-1 rounded-xs bg-surface-low p-3">
      <p className="text-body font-semibold text-ink">{r.title}</p>
      {(r.organisation || months) && <p className="text-caption text-muted">{[r.organisation, months].filter(Boolean).join(" • ")}</p>}
      {r.description && <p className="text-body text-muted">{r.description}</p>}
      {(r.file_id || r.url) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {r.file_id && (
            <FileButton id={r.file_id} label={`View file: ${r.title}`}>
              View File
            </FileButton>
          )}
          {r.url && <ExtLink href={r.url}>Link</ExtLink>}
        </div>
      )}
    </li>
  );
}

function ExtLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-7 items-center gap-1 rounded-xs bg-surface-high px-2 py-1 text-caption font-semibold text-primary hover:bg-surface-highest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <Icon name="open_in_new" /> {children}
    </a>
  );
}
