"use client";

import { useState, type ReactNode } from "react";
import { Badge, Card, Empty, Icon, State, cx } from "@/components/ui";
import { NavLink as Link } from "@/components/AppShell";
import { useSession } from "@/lib/api";
import { fmtDate, timeLeft } from "@/lib/format";
import { useApps, useNotices, useOpps, usePlacement, useProfile, useRecords, type App, type Metrics, type Opp } from "./data";
import { REQUIRED } from "./profile";

/** Everything on this screen is derived from the student's own records; nothing is typed in here. */
export function Home() {
  const profile = useProfile();
  const apps = useApps();
  const placement = usePlacement();
  const opps = useOpps();
  const [now] = useState(Date.now);
  const first = useSession()?.user.name.split(/\s+/)[0];

  const failed = [profile, apps, placement, opps].find((r) => r.error);
  const ready = profile.data && apps.data && placement.data && opps.data;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-headline font-bold text-primary">{first ? `Welcome back, ${first}` : "Welcome back"}</h1>
      <State
        data={ready ? { p: profile.data!, apps: apps.data!.data, pl: placement.data!, opps: opps.data!.data } : undefined}
        error={failed?.error}
        retry={() => [profile, apps, placement, opps].forEach((r) => r.mutate())}
        rows={4}
      >
        {({ p, apps, pl, opps }) => {
          const missing = REQUIRED.filter((r) => p[r.key] == null);
          const open = opps
            .filter((o) => o.my_eligibility.eligible && +new Date(o.apply_deadline) > now && !apps.some((a) => a.opportunity.id === o.id))
            .sort((a, b) => +new Date(a.apply_deadline) - +new Date(b.apply_deadline));
          const interview = apps
            .flatMap((a) => a.interviews.map((iv) => ({ a, iv })))
            .filter(({ iv }) => +new Date(iv.at) >= now)
            .sort((x, y) => +new Date(x.iv.at) - +new Date(y.iv.at))[0];
          const steps = [
            { label: "Profile", done: REQUIRED.filter((r) => r.key !== "resume_file_id").every((r) => p[r.key] != null) },
            { label: "Resume", done: p.resume_file_id != null },
            { label: "Applied", done: apps.length > 0, note: apps.length ? String(apps.length) : undefined },
            { label: "Interview", done: apps.some((a) => a.interviews.length > 0 || a.status === "shortlisted" || a.status === "selected") },
            { label: "Offer", done: pl.placed || apps.some((a) => a.status === "selected") },
          ];
          const current = steps.findIndex((s) => !s.done);
          return (
            <>
              <Journey steps={steps} current={current} />
              <NextStep
                placed={pl.placed ? [...new Set(pl.selections.map((s) => s.company))].join(", ") : null}
                missing={missing[0]?.action}
                interview={interview}
                open={open}
                inFlight={apps.some((a) => a.status === "applied" || a.status === "released_to_recruiter" || a.status === "shortlisted")}
              />
              <div className="grid gap-5 lg:grid-cols-3">
                <Deadlines open={open} />
                <LatestNotices />
                <Stats />
              </div>
            </>
          );
        }}
      </State>
    </div>
  );
}

function Journey({ steps, current }: { steps: { label: string; done: boolean; note?: string }[]; current: number }) {
  return (
    <Card className="p-5">
      <h2 className="pb-3 font-display text-title font-semibold text-primary">Your placement journey</h2>
      <ol className="grid grid-cols-5 gap-2">
        {steps.map((s, i) => (
          <li key={s.label} aria-current={i === current ? "step" : undefined} className="flex flex-col gap-1.5">
            <span className={cx("h-2 rounded-xl", s.done ? "bg-primary" : i === current ? "bg-accent" : "bg-surface-highest")} />
            <span className={cx("flex items-center gap-1 text-body", i === current ? "font-bold text-ink" : s.done ? "font-semibold text-primary" : "text-muted")}>
              {s.done && <Icon name="check_circle" filled className="text-[16px]" />}
              <span className="truncate">{s.label}</span>
              {s.note && <span className="rounded-xs bg-surface-high px-1.5 text-caption tabular-nums">{s.note}</span>}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

type Interview = { a: App; iv: App["interviews"][number] } | undefined;

/** One sentence about the single most useful thing to do now, in priority order. */
function NextStep({ placed, missing, interview, open, inFlight }: { placed: string | null; missing?: string; interview: Interview; open: Opp[]; inFlight: boolean }) {
  let title: string;
  let body: ReactNode = null;
  let cta: { label: string; href: string } | null = null;
  if (placed) {
    title = `You are placed at ${placed}`;
    body = "Applying is closed. If you want to apply again, send an appeal to the T&P cell from Open drives.";
    cta = { label: "Open drives", href: "#drives" };
  } else if (interview) {
    title = `${interview.a.opportunity.company.name}: ${interview.iv.round}`;
    body = `${fmtDate(interview.iv.at, true)} • ${interview.iv.venue_or_link}`;
    cta = { label: "View application", href: "#applications" };
  } else if (missing) {
    title = missing;
    body = "Recruiters see your profile exactly as you fill it in, and you can't apply until it is complete.";
    cta = { label: "Complete profile", href: "#profile" };
  } else if (open.length) {
    title = `${open.length} ${open.length === 1 ? "drive is" : "drives are"} open for you`;
    body = `${open[0].company.name} closes ${fmtDate(open[0].apply_deadline, true)} (${timeLeft(open[0].apply_deadline)}).`;
    cta = { label: "See drives", href: "#drives" };
  } else if (inFlight) {
    title = "Your applications are with the recruiters";
    body = "You'll get an email and a notice here when a stage changes.";
    cta = { label: "My applications", href: "#applications" };
  } else {
    title = "No drives are open for you right now";
    body = "New drives appear here as soon as the T&P cell approves them.";
  }
  return (
    <section aria-label="Next step" className="flex flex-col justify-between gap-4 rounded-lg bg-primary-container p-6 text-white shadow-card sm:flex-row sm:items-center">
      <div className="min-w-0">
        <p className="text-label font-semibold text-on-primary-container">Next step for you</p>
        <h2 className="pt-1 font-display text-headline font-bold">{title}</h2>
        {body && <p className="pt-1 text-body-lg text-on-primary-container">{body}</p>}
      </div>
      {cta && (
        <Link
          href={cta.href}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-1 rounded-xs bg-accent px-5 text-body-lg font-semibold text-on-accent hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {cta.label}
          <Icon name="arrow_forward" />
        </Link>
      )}
    </section>
  );
}

function Panel({ title, icon, href, linkLabel, children }: { title: string; icon: string; href: string; linkLabel: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="flex items-center gap-2 font-display text-card font-semibold text-primary">
        <Icon name={icon} className="text-[20px]" />
        {title}
      </h2>
      <div className="flex-1">{children}</div>
      <Link href={href} className="w-fit text-label font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent">
        {linkLabel}
      </Link>
    </Card>
  );
}

function Deadlines({ open }: { open: Opp[] }) {
  return (
    <Panel title="Apply before" icon="alarm" href="#drives" linkLabel="All open drives">
      {open.length ? (
        <ul className="flex flex-col gap-2">
          {open.slice(0, 4).map((o) => (
            <li key={o.id} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-body font-semibold text-ink">{o.company.name}</span>
              <Badge tone="warn" className="shrink-0">
                {timeLeft(o.apply_deadline)}
              </Badge>
            </li>
          ))}
        </ul>
      ) : (
        <Empty icon="event_available" text="No open deadlines for you." />
      )}
    </Panel>
  );
}

function LatestNotices() {
  const n = useNotices();
  return (
    <Panel title="Notices" icon="campaign" href="#notices" linkLabel={n.data ? `All ${n.data.data.length} notices` : "All notices"}>
      <State data={n.data} error={n.error} retry={() => n.mutate()} empty={(d) => d.data.length === 0} rows={2}>
        {(d) => (
          <ul className="flex flex-col gap-2">
            {d.data.slice(0, 3).map((x) => (
              <li key={x.id}>
                <p className="truncate text-body font-semibold text-ink">{x.title}</p>
                <p className="text-caption text-muted">{fmtDate(x.published_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </State>
    </Panel>
  );
}

const STATS: { key: keyof Metrics; label: string; unit: string }[] = [
  { key: "placement_rate", label: "Placed", unit: "%" },
  { key: "highest_ctc_lpa", label: "Highest package", unit: " LPA" },
  { key: "corporate_partners", label: "Recruiters", unit: "+" },
];

function Stats() {
  const r = useRecords();
  return (
    <Panel title="Last placement season" icon="monitoring" href="#placement" linkLabel="All years">
      <State data={r.data} error={r.error} retry={() => r.mutate()} empty={(d) => d.length === 0} rows={2}>
        {(d) => {
          const latest = d.toSorted((a, b) => b.year - a.year)[0];
          const m = latest.data as Metrics;
          const shown = STATS.filter((s) => typeof m[s.key] === "number");
          return shown.length ? (
            <dl className="flex flex-col gap-2">
              <p className="text-caption text-muted">{m.cohort ?? `${latest.year}`}</p>
              {shown.map((s) => (
                <div key={s.key} className="flex items-baseline justify-between gap-3">
                  <dt className="text-body text-muted">{s.label}</dt>
                  <dd className="font-display text-title font-bold text-primary tabular-nums">
                    {(m[s.key] as number).toLocaleString("en-IN")}
                    {s.unit}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <Empty icon="monitoring" text="The T&P cell hasn't published figures yet." />
          );
        }}
      </State>
    </Panel>
  );
}
