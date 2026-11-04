"use client";

import { Badge, Button, Card, Empty, Icon, SectionTitle, State, cx } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { FileButton } from "./FileButton";
import { DRIVE_MODE, POSTING_TONE, hiringPeriod, postingLabel, type Posting } from "./model";

const SHOWN = 4;

export function Postings({
  postings,
  current,
  onOpen,
  onCreate,
  error,
  reload,
}: {
  postings?: Posting[];
  current?: string;
  onOpen: (id: string) => void;
  onCreate: () => void;
  error?: unknown;
  reload: () => void;
}) {
  const card = (p: Posting) => <PostingCard key={p.id} p={p} active={p.id === current} onOpen={() => onOpen(p.id)} />;
  return (
    <Card className="flex scroll-mt-24 flex-col gap-4 p-4 sm:p-5">
      <span id="postings" />
      <SectionTitle icon="work" title="Your Postings" sub="Every job, internship and competition you have posted, newest first, with its drive schedule." />
      <State data={postings} error={error} retry={reload} rows={2}>
        {(all) => {
          const list = all.toSorted((a, b) => b.created_at.localeCompare(a.created_at));
          return list.length ? (
            <div className="flex flex-col gap-3">
              <ul className="grid gap-3 md:grid-cols-2">{list.slice(0, SHOWN).map(card)}</ul>
              {list.length > SHOWN && (
                <details className="group flex flex-col gap-3">
                  <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-xs px-1 text-label font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
                    <span className="group-open:hidden">Show all {list.length} postings</span>
                    <span className="hidden group-open:inline">Show fewer</span>
                    <Icon name="expand_more" className="transition-transform group-open:rotate-180" />
                  </summary>
                  <ul className="grid gap-3 pt-3 md:grid-cols-2">{list.slice(SHOWN).map(card)}</ul>
                </details>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Empty icon="work_outline" text="No postings yet. Create one and the T&P cell reviews it before students see it." />
              <Button icon="add_circle" onClick={onCreate}>
                Create First Posting
              </Button>
            </div>
          );
        }}
      </State>
    </Card>
  );
}

function PostingCard({ p, active, onOpen }: { p: Posting; active: boolean; onOpen: () => void }) {
  const period = hiringPeriod(p);
  return (
    <li className={cx("flex min-w-0 flex-col gap-2 rounded-xs bg-surface-low p-3", active && "outline-2 outline-primary")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-caption font-bold text-muted uppercase">
            {p.type}
            {p.location && ` • ${p.location}`}
          </p>
          <h3 className="font-display text-card font-semibold break-words text-primary">{p.title}</h3>
        </div>
        <Badge tone={POSTING_TONE[p.status]} className="shrink-0">
          {postingLabel(p)}
        </Badge>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-body">
        <Meta icon="hub" label="Drive mode" value={p.drive_mode ? DRIVE_MODE[p.drive_mode] : "Not set"} muted={!p.drive_mode} />
        <Meta icon="date_range" label="Hiring period" value={period ?? "Not set"} muted={!period} />
        <Meta icon="event" label="Apply by" value={fmtDate(p.apply_deadline)} />
        <Meta icon="location_on" label="Campus venue" value={p.venue ?? "Not set"} muted={!p.venue} />
      </dl>
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        <Button size="sm" variant={active ? "primary" : "soft"} icon="timeline" onClick={onOpen} aria-pressed={active} className="min-h-7">
          {active ? "Open in Drive Desk" : "Open Drive"}
        </Button>
        {p.jd_file_id && (
          <FileButton id={p.jd_file_id} label={`View JD: ${p.title}`}>
            View JD
          </FileButton>
        )}
      </div>
    </li>
  );
}

function Meta({ icon, label, value, muted }: { icon: string; label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="flex items-center gap-1 text-caption font-semibold text-muted">
        <Icon name={icon} /> {label}
      </dt>
      <dd className={cx("truncate font-semibold", muted ? "text-muted" : "text-ink")} title={value}>
        {value}
      </dd>
    </div>
  );
}
