"use client";

import { useState } from "react";
import { Badge, Button, Card, Empty, Icon, Input, Notice, SectionTitle, State, cx, useRun } from "@/components/ui";
import { api, call, openFile } from "@/lib/api";
import { APP_STATUS, fmtDate } from "@/lib/format";
import { DriveFacts } from "./drives";
import { useApps, useFeedback, type App, type Feedback } from "./data";

const STAGES = ["Applied", "With recruiter", "Shortlisted", "Interview", "Selected"];
const stageOf = (a: App) => ({ applied: 0, released_to_recruiter: 1, shortlisted: a.interviews.length ? 3 : 2, selected: 4, rejected: -1 })[a.status];

export function Applications() {
  const apps = useApps();
  const fb = useFeedback();
  return (
    <Card className="flex scroll-mt-24 flex-col gap-4 p-5">
      <span id="applications" />
      <SectionTitle icon="conversion_path" title="My applications" sub="Every drive you applied to, its stage, and the logistics the recruiter shared." />
      <State data={apps.data} error={apps.error} retry={() => apps.mutate()}>
        {({ data }) =>
          data.length ? (
            <ul className="flex flex-col gap-3">
              {data.map((a) => (
                <AppCard key={a.id} a={a} given={fb.data && (fb.data.find((f) => f.target === "opportunity" && f.target_id === a.opportunity.id) ?? null)} />
              ))}
            </ul>
          ) : (
            <Empty icon="conversion_path" text="You haven't applied to a drive yet. Open drives are listed below." />
          )
        }
      </State>
    </Card>
  );
}

/** `given` is undefined while feedback loads, null when none was given yet. */
function AppCard({ a, given }: { a: App; given?: Feedback | null }) {
  const at = stageOf(a);
  const o = a.opportunity;
  return (
    <li aria-label={`Application: ${o.company.name}, ${o.title}`} className="flex flex-col gap-3 rounded-sm bg-surface-low p-4">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <h3 className="font-display text-title font-semibold text-primary">{o.title}</h3>
          <p className="text-body text-muted">
            {o.company.name} • <span className="capitalize">{o.type}</span> • applied {fmtDate(a.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={APP_STATUS[a.status].tone}>{APP_STATUS[a.status].label}</Badge>
          {o.jd_file_id && (
            <Button size="sm" variant="white" icon="description" onClick={() => openFile(o.jd_file_id!)}>
              JD
            </Button>
          )}
        </div>
      </div>

      {at >= 0 && (
        <ol aria-label="Stage" className="grid grid-cols-5 gap-1">
          {STAGES.map((s, i) => (
            <li key={s} className="flex flex-col gap-1">
              <span className={cx("h-1.5 rounded-xl", i < at ? "bg-primary" : i === at ? "bg-accent" : "bg-surface-highest")} />
              <span className={cx("text-caption", i === at ? "font-bold whitespace-nowrap text-ink" : "hidden text-muted sm:block")}>{s}</span>
            </li>
          ))}
        </ol>
      )}

      <DriveFacts mode={o.drive_mode} from={o.hiring_from} to={o.hiring_to} />

      <div className="flex flex-col gap-1 rounded-xs bg-white p-3">
        <p className="text-caption font-semibold text-muted">Venue &amp; logistics (shared only with applicants)</p>
        {o.venue || o.logistics ? (
          <>
            {o.venue && (
              <p className="flex items-start gap-1.5 text-body text-ink">
                <Icon name="location_on" className="text-primary" /> {o.venue}
              </p>
            )}
            {o.logistics && <p className="text-body whitespace-pre-line text-ink">{o.logistics}</p>}
          </>
        ) : (
          <p className="text-body text-muted">The recruiter hasn&apos;t shared the venue or logistics yet.</p>
        )}
        {a.interviews.map((iv) => (
          <p key={iv.id} className="flex items-start gap-1.5 text-body text-ink">
            <Icon name="event" className="text-primary" />
            <span>
              <b className="font-semibold">{iv.round}</b> • {fmtDate(iv.at, true)} • {iv.venue_or_link}
            </span>
          </p>
        ))}
      </div>

      {given !== undefined && <Rate target="opportunity" id={o.id} given={given} label={`Rate ${o.company.name} as a recruiter`} />}
    </li>
  );
}

/** 1–5 stars and an optional comment; re-sending replaces the earlier rating. */
export function Rate({ target, id, given, label }: { target: "event" | "opportunity"; id: string; given: Feedback | null; label: string }) {
  const fb = useFeedback();
  const [rating, setRating] = useState(given?.rating ?? 0);
  const [comment, setComment] = useState(given?.comment ?? "");
  const { busy, msg, run } = useRun();
  const save = () =>
    run(
      "rate",
      async () => {
        await call(api.POST("/api/v1/students/me/feedback", { body: { target, target_id: id, rating, comment: comment.trim() || undefined } }));
        await fb.mutate();
      },
      "Thanks, your rating is saved.",
    );
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="pb-1 text-label font-semibold text-ink">{label}</legend>
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Rating" className="flex">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              onClick={() => setRating(n)}
              className="grid size-8 place-items-center text-accent cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Icon name="star" filled={n <= rating} className="text-[22px]" />
            </button>
          ))}
        </div>
        <Input
          aria-label="Comment (optional)"
          placeholder="Comment (optional)"
          value={comment}
          maxLength={2000}
          onChange={(e) => setComment(e.target.value)}
          className="min-w-0 flex-1 basis-48"
        />
        <Button size="sm" variant="soft" busy={busy === "rate"} disabled={!rating} onClick={save}>
          {given ? "Update rating" : "Save rating"}
        </Button>
      </div>
      <Notice msg={msg} />
    </fieldset>
  );
}
