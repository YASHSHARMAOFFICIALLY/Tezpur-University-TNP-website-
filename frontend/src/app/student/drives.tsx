"use client";

import { useState } from "react";
import useSWR from "swr";
import { Badge, Button, Card, Field, Icon, Notice, SectionTitle, State, Tabs, Textarea, cx, useRun } from "@/components/ui";
import { ApiError, api, call, listAll, openFile } from "@/lib/api";
import { APP_STATUS, fmtDate, initialsOf, reasonText, timeLeft } from "@/lib/format";
import { DRIVE_MODE, fmtMonths, useApps, usePlacement, type App, type Opp, type Placement } from "./data";

/** Why Apply is closed for a placed student, or null when applying is open. */
const placedText = (p?: Placement) => (p?.placed ? `You are placed at ${[...new Set(p.selections.map((s) => s.company))].join(", ")}` : null);

export function PlacementStatus() {
  const p = usePlacement();
  const { busy, msg, run } = useRun();
  const [reason, setReason] = useState("");
  if (!p.data) return null;
  const { placed, selections, appeal, appeal_note } = p.data;
  if (!placed && !appeal_note) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await run("appeal", () => call(api.POST("/api/v1/students/me/appeal", { body: { reason } })).then((d) => p.mutate(d, false)));
    if (ok) setReason("");
  }

  return (
    <div className={cx("flex flex-col gap-3 rounded-sm p-4", placed ? "bg-tertiary-fixed/60" : "bg-primary-fixed")}>
      {placed ? (
        <>
          <p className="flex items-start gap-2 text-body-lg font-semibold text-on-accent">
            <Icon name="lock" className="pt-0.5 text-[20px]" />
            {placedText(p.data)}. Applying to new drives is closed.
          </p>
          <ul className="flex flex-col gap-0.5 pl-7 text-body text-ink">
            {selections.map((s) => (
              <li key={s.opportunity_id}>
                {s.company}: {s.title} (result published {fmtDate(s.published_at)})
              </li>
            ))}
          </ul>
          {appeal_note && (
            <p className="pl-7 text-body text-ink">
              <b className="font-semibold">Note from the T&amp;P cell on your last appeal:</b> {appeal_note}
            </p>
          )}
          {appeal ? (
            <div className="ml-7 flex flex-col gap-1 rounded-xs bg-white p-3">
              <Badge tone="warn" icon="hourglass_top" className="w-fit">
                Appeal pending
              </Badge>
              <p className="text-body text-ink">{appeal.reason}</p>
              <p className="text-caption text-muted">Sent {fmtDate(appeal.at, true)}. The T&amp;P cell will email you its decision.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="ml-7 flex flex-col gap-2">
              <Field label="Ask the T&P cell to let you apply again" hint="At least 10 characters. Say why, e.g. a core-role offer you want to pursue.">
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} minLength={10} maxLength={2000} required />
              </Field>
              <Button type="submit" busy={busy === "appeal"} disabled={reason.trim().length < 10} className="w-fit">
                Send appeal
              </Button>
            </form>
          )}
        </>
      ) : (
        <p className="flex items-start gap-2 text-body text-primary">
          <Icon name="lock_open" className="text-[20px]" />
          <span>
            <b className="font-semibold">Your appeal was granted. You can apply again.</b> Note from the T&amp;P cell: {appeal_note}
          </span>
        </p>
      )}
      <Notice msg={msg} />
    </div>
  );
}

type Kind = "job" | "internship";

export function Drives() {
  const [tab, setTab] = useState<Kind>("job");
  const opps = useSWR("opportunities", () => listAll((cursor) => call(api.GET("/api/v1/opportunities", { params: { query: { limit: 100, cursor } } }))));
  const apps = useApps();
  const placement = usePlacement();
  const list = opps.data?.data ?? [];
  const count = (t: Kind) => list.filter((o) => o.type === t).length;

  return (
    <Card className="flex scroll-mt-24 flex-col gap-4 p-5">
      <span id="drives" />
      <SectionTitle icon="work" title="Open drives" sub="Postings approved by the T&P cell. Eligibility is checked against your profile." />
      <PlacementStatus />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "job", label: "Final placements", icon: "work", count: count("job") },
          { id: "internship", label: "Internships", icon: "school", count: count("internship") },
        ]}
      />
      <State data={opps.data} error={opps.error} retry={() => opps.mutate()} empty={() => count(tab) === 0}>
        {() => (
          <div className="flex flex-col gap-3">
            {list
              .filter((o) => o.type === tab)
              .map((o) => (
                <OppCard
                  key={o.id}
                  o={o}
                  app={apps.data?.data.find((a) => a.opportunity.id === o.id)}
                  locked={placedText(placement.data)}
                  onApplied={() => (apps.mutate(), opps.mutate())}
                  onPlaced={() => placement.mutate()}
                />
              ))}
          </div>
        )}
      </State>
    </Card>
  );
}

export function DriveFacts({ mode, from, to }: { mode: keyof typeof DRIVE_MODE | null; from: string | null; to: string | null }) {
  const hiring = fmtMonths(from, to);
  if (!mode && !hiring) return null;
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-label font-semibold text-ink">
      {mode && (
        <span className="flex items-center gap-1">
          <Icon name={mode === "online" ? "videocam" : mode === "hybrid" ? "devices" : "apartment"} className="text-primary" /> {DRIVE_MODE[mode]}
        </span>
      )}
      {hiring && (
        <span className="flex items-center gap-1">
          <Icon name="calendar_month" className="text-primary" /> Hiring {from && to && from !== to ? "period" : "month"}: {hiring}
        </span>
      )}
    </p>
  );
}

function OppCard({ o, app, locked, onApplied, onPlaced }: { o: Opp; app?: App; locked: string | null; onApplied: () => void; onPlaced: () => void }) {
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
      if (x.code === "PLACED") onPlaced();
      setErr(
        x.code === "PROFILE_INCOMPLETE"
          ? "Complete your profile (photo, resume, CGPA, DOB, programme) before applying."
          : x.code === "PLACED"
            ? "You are already placed. Send an appeal above to apply again."
            : x.message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      className={cx(
        "flex flex-col justify-between gap-3 rounded-sm p-3 shadow-card sm:flex-row sm:items-center",
        !eligible && !app ? "bg-surface-low" : "bg-white",
      )}
    >
      <div className="flex min-w-0 gap-3">
        <span
          className={cx(
            "grid size-12 shrink-0 place-items-center rounded-xs font-display text-title font-bold",
            app ? "bg-surface text-primary" : eligible ? "bg-accent/20 text-on-accent" : "bg-surface-highest text-muted",
          )}
        >
          {initialsOf(o.company.name)}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="font-display text-title font-semibold text-primary">
            {o.title}
            {o.designation && o.designation !== o.title && <span className="font-normal text-muted"> · {o.designation}</span>}
          </h3>
          <p className="text-body text-muted">
            {o.company.name}
            {o.location && ` · ${o.location}`}
          </p>
          {o.ctc_benefits && <p className="text-label font-semibold text-ink">CTC: {o.ctc_benefits}</p>}
          <DriveFacts mode={o.drive_mode} from={o.hiring_from} to={o.hiring_to} />
          {!app && closes !== "closed" && (
            <p className="flex items-center gap-1 text-label font-semibold text-tertiary">
              <Icon name="timer" /> Applications close {closes} ({fmtDate(o.apply_deadline, true)})
            </p>
          )}
          {err && (
            <p role="alert" className="text-label text-error">
              {err}
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
        {app ? (
          <>
            <Badge tone={APP_STATUS[app.status].tone} icon="event_available">
              {APP_STATUS[app.status].label}
            </Badge>
            <span className="text-caption text-muted">Applied {fmtDate(app.created_at)}</span>
          </>
        ) : !eligible ? (
          <Badge tone="error" icon="warning">
            Ineligible: {o.my_eligibility.reasons.map((r) => reasonText(r)).join("; ")}
          </Badge>
        ) : (
          <>
            {/* the placed banner above says why once; the card only needs to show applying is off */}
            <Button variant="tertiary" busy={busy} disabled={closes === "closed" || !!locked} title={locked ?? undefined} onClick={apply}>
              {closes === "closed" ? "Applications Closed" : locked ? "Applying closed" : "Apply Now"}
            </Button>
          </>
        )}
        {o.jd_file_id && (
          <Button size="sm" variant="ghost" icon="description" onClick={() => openFile(o.jd_file_id!)}>
            JD
          </Button>
        )}
      </div>
    </article>
  );
}
