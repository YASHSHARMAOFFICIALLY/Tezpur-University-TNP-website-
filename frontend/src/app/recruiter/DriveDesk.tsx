"use client";

import { useState } from "react";
import { Badge, Button, Card, Empty, Icon, Notice, Select, State, cx, useRun } from "@/components/ui";
import { api, call, fileBody } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { FileButton } from "./FileButton";
import { Logistics } from "./Logistics";
import { PostingStudio } from "./PostingStudio";
import { DRIVE_MODE, POSTING_TONE, ROUNDS, ROUND_LABEL, hiringPeriod, postingLabel, type Applicant, type Posting } from "./model";

/** The selected posting: schedule, progress counts, actions and campus logistics. */
export function DriveDesk({
  postings,
  drive,
  onPick,
  applicants,
  reload,
  error,
}: {
  postings?: Posting[];
  drive?: Posting;
  onPick: (id: string) => void;
  applicants?: Applicant[];
  reload: () => void;
  error?: unknown;
}) {
  return (
    <Card className="flex scroll-mt-24 flex-col gap-4 p-4 sm:p-5">
      <span id="drive" />
      <State data={postings} error={error} retry={reload} rows={3}>
        {(list) =>
          drive ? (
            <>
              <Timeline postings={list} drive={drive} onPick={onPick} applicants={applicants} reload={reload} />
              <Logistics key={drive.id} drive={drive} reload={reload} />
            </>
          ) : (
            <Empty icon="timeline" text="Create a posting to see its drive timeline and campus logistics here." />
          )
        }
      </State>
    </Card>
  );
}

function Timeline({
  postings,
  drive,
  onPick,
  applicants,
  reload,
}: {
  postings: Posting[];
  drive: Posting;
  onPick: (id: string) => void;
  applicants?: Applicant[];
  reload: () => void;
}) {
  const act = useRun();
  const [editing, setEditing] = useState(false);
  const a = applicants ?? [];
  const n = (f: (x: Applicant) => boolean) => a.filter(f).length;
  const steps: [string, number][] = [
    ["Released by T&P", a.length],
    ["Shortlisted", n((x) => x.status === "shortlisted" || x.status === "selected")],
    ["Interview scheduled", n((x) => x.interviews.length > 0)],
    ["Selected", n((x) => x.status === "selected")],
  ];
  const current = steps.findLastIndex(([, v]) => v > 0);
  const rounds = ROUNDS.filter((k) => drive.selection_process[k]);
  const period = hiringPeriod(drive);

  const move = (to: "submit" | "close") =>
    act.run(to, async () => {
      const opts = { params: { path: { id: drive.id } } };
      await call(
        to === "submit" ? api.POST("/api/v1/company/opportunities/{id}/submit", opts) : api.POST("/api/v1/company/opportunities/{id}/close", opts),
      );
      reload();
    });
  const uploadJd = (f?: File) =>
    f &&
    act.run(
      "jd",
      async () => {
        await call(api.POST("/api/v1/company/opportunities/{id}/jd", { params: { path: { id: drive.id } }, ...fileBody(f) }));
        reload();
      },
      "JD uploaded.",
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-caption font-semibold tracking-[0.55px] text-muted uppercase">
            <Icon name="timeline" /> Drive Desk
          </p>
          <h2 className="font-display text-title font-semibold break-words text-primary">{drive.title}</h2>
          <p className="text-body text-muted">
            {[drive.designation ?? drive.job_profile ?? drive.type, drive.location, `Apply by ${fmtDate(drive.apply_deadline)}`].filter(Boolean).join(" • ")}
          </p>
          {drive.review_note && drive.status === "draft" && (
            <p className="pt-1 text-label font-semibold text-error">
              <Icon name="feedback" /> T&amp;P note: {drive.review_note}
            </p>
          )}
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <Badge tone={POSTING_TONE[drive.status]}>{postingLabel(drive)}</Badge>
          {postings.length > 1 && (
            <Select aria-label="Choose drive" value={drive.id} onChange={(e) => onPick(e.target.value)} className="h-8 w-full py-1 text-label sm:w-60">
              {postings.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({postingLabel(p)})
                </option>
              ))}
            </Select>
          )}
        </div>
      </div>

      <dl className="grid gap-2 rounded-xs bg-surface-low p-3 sm:grid-cols-3">
        <div>
          <dt className="text-caption font-semibold text-muted uppercase">Drive mode</dt>
          <dd className="text-body font-semibold text-ink">{drive.drive_mode ? DRIVE_MODE[drive.drive_mode] : "Not set"}</dd>
        </div>
        <div>
          <dt className="text-caption font-semibold text-muted uppercase">Probable hiring period</dt>
          <dd className="text-body font-semibold text-ink">{period ?? "Not set"}</dd>
        </div>
        <div>
          <dt className="text-caption font-semibold text-muted uppercase">Selection rounds</dt>
          <dd className="flex flex-wrap gap-1 pt-0.5">
            {rounds.length ? (
              rounds.map((k) => (
                <Badge key={k} tone="soft">
                  {ROUND_LABEL[k]}
                </Badge>
              ))
            ) : (
              <span className="text-body text-muted">None listed</span>
            )}
          </dd>
        </div>
      </dl>

      <ol className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Candidate progress">
        {steps.map(([t, v], i) => (
          <li
            key={t}
            className={cx("flex justify-between gap-1 rounded-xs p-2", i === current ? "bg-primary text-white" : "bg-surface-low", i > current && "opacity-70")}
          >
            <div>
              <p className={cx("text-caption font-semibold", i === current ? "text-surface-high" : "text-muted")}>
                {String(i + 1).padStart(2, "0")}. {t}
              </p>
              <p className={cx("font-display text-title font-bold tabular-nums", i === current ? "text-white" : "text-ink")}>{v}</p>
            </div>
            {i === current ? <span className="mt-1 size-2 rounded-xl bg-accent" /> : <Icon name={v > 0 ? "check_circle" : "pending"} className="text-muted" />}
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        {drive.status === "draft" && (
          <>
            <Button size="sm" variant="soft" icon="edit" onClick={() => setEditing(true)}>
              Edit Posting
            </Button>
            <Button size="sm" busy={act.busy === "submit"} onClick={() => move("submit")} icon="send">
              Submit for T&amp;P Approval
            </Button>
          </>
        )}
        {drive.status === "approved" && (
          <Button size="sm" variant="ghost" busy={act.busy === "close"} onClick={() => move("close")} icon="block">
            Stop Accepting Applications
          </Button>
        )}
        <label
          className={cx(
            "inline-flex min-h-7 cursor-pointer items-center gap-1 rounded-xs bg-surface-high px-2 py-1 text-caption font-semibold text-ink focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent hover:bg-surface-highest",
            act.busy === "jd" && "opacity-50",
          )}
        >
          <Icon name="upload_file" /> {drive.jd_file_id ? "Replace JD PDF" : "Upload JD PDF"}
          <input type="file" accept="application/pdf" className="sr-only" disabled={act.busy === "jd"} onChange={(e) => uploadJd(e.target.files?.[0])} />
        </label>
        {drive.jd_file_id && <FileButton id={drive.jd_file_id}>View JD</FileButton>}
      </div>
      <Notice msg={act.msg} />
      {editing && <PostingStudio initial={drive} onClose={() => setEditing(false)} onDone={() => (setEditing(false), reload())} />}
    </div>
  );
}
