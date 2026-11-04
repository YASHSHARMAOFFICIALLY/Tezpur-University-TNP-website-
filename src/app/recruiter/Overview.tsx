"use client";

import { useState } from "react";
import useSWR from "swr";
import { Badge, Button, Card, Icon, State, cx } from "@/components/ui";
import { api, call } from "@/lib/api";
import { CompanyProfile, FeedbackDialog } from "./OrgDialogs";
import type { Posting } from "./model";

export function Overview({ postings, onCreate }: { postings: Posting[]; onCreate: () => void }) {
  const co = useSWR("companies/me", () => call(api.GET("/api/v1/companies/me")));
  const feedback = useSWR("feedback", () => call(api.GET("/api/v1/feedback")));
  const pendingFeedback = feedback.data?.filter((f) => !f.submitted) ?? [];
  const [fbOpen, setFbOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const count = (s: Posting["status"]) => postings.filter((p) => p.status === s).length;
  const returned = postings.filter((p) => p.status === "draft" && p.review_note).length;

  return (
    <Card className="flex scroll-mt-24 flex-col gap-4 p-4 sm:p-5">
      <span id="overview" />
      <State data={co.data} error={co.error} retry={() => co.mutate()} rows={2}>
        {(c) => (
          <div className="flex flex-col gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-12 shrink-0 place-items-center rounded-sm bg-surface text-primary">
                <Icon name="apartment" className="text-[26px]" />
              </span>
              <div className="min-w-0">
                <h1 className="truncate font-display text-[22px] leading-7 font-semibold text-primary" title={c.name}>
                  {c.name}
                </h1>
                <p className="truncate text-body text-muted">
                  {[c.category.toUpperCase(), c.sector, c.postal_address].filter(Boolean).join(" • ")}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Badge tone="warn" icon="verified">
                Verified by the T&amp;P cell
              </Badge>
              {c.contacts[0] && <p className="min-w-0 text-body text-muted">Contact: {c.contacts[0].name}</p>}
            </div>
            <div className="flex flex-wrap gap-2 [&>button]:max-sm:w-full">
              <Button icon="add_circle" onClick={onCreate} className="px-4 py-2.5 text-center">
                Create New Job Opening
              </Button>
              <Button variant="ghost" icon="edit" onClick={() => setProfileOpen(true)} className="px-4 py-2.5">
                Edit Organisation Profile
              </Button>
              <Button
                variant="ghost"
                icon="rate_review"
                disabled={!pendingFeedback.length}
                title={pendingFeedback.length ? undefined : "No feedback form from the T&P cell yet"}
                onClick={() => setFbOpen(true)}
                className="px-4 py-2.5"
              >
                Submit Drive Feedback
              </Button>
            </div>
          </div>
        )}
      </State>
      <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="Live to students" icon="campaign" value={count("approved")} />
        <Stat label="Awaiting T&P approval" icon="hourglass_top" value={count("pending_admin")} />
        <Stat label="Drafts" icon="edit_note" value={count("draft")} note={returned ? `${returned} returned for edits` : undefined} accent={returned > 0} />
        <Stat label="Closed" icon="block" value={count("closed") + count("rejected")} />
      </dl>
      {fbOpen && <FeedbackDialog forms={pendingFeedback} onClose={() => (setFbOpen(false), feedback.mutate())} />}
      {profileOpen && co.data && <CompanyProfile c={co.data} onClose={() => (setProfileOpen(false), co.mutate())} />}
    </Card>
  );
}

function Stat({ label, icon, value, note, accent }: { label: string; icon: string; value: number; note?: string; accent?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xs bg-surface-low p-2.5">
      <dt className="flex items-center justify-between gap-1 text-caption font-semibold tracking-[0.55px] text-muted uppercase">
        {label} <Icon name={icon} className={accent ? "text-tertiary" : "text-primary"} />
      </dt>
      <dd className={cx("font-display text-headline font-bold tabular-nums", accent ? "text-tertiary" : "text-primary")}>{String(value).padStart(2, "0")}</dd>
      {note && <dd className="text-caption font-semibold text-tertiary">{note}</dd>}
    </div>
  );
}
