"use client";

import Link from "next/link";
import useSWR from "swr";
import { Card, Icon, State } from "@/components/ui";
import { api, call } from "@/lib/api";

export function TalentPool({ onExplore }: { onExplore: (programmeId: string) => void }) {
  const progs = useSWR("programmes", () => call(api.GET("/api/v1/programmes")));
  const uni = useSWR("university", () => call(api.GET("/api/v1/university")));
  const u = uni.data;
  const chevron = <Icon name="expand_more" className="transition-transform group-open:rotate-180" />;
  return (
    <div className="grid scroll-mt-24 gap-4" id="talent">
      {u && (
        <details className="group rounded-lg bg-primary text-surface-high shadow-pop">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
            <span className="min-w-0">
              <span className="flex items-center gap-1 text-caption font-semibold">
                <Icon name="account_balance" /> About the university
              </span>
              <span className="block truncate font-display text-title font-bold text-white">{u.name}</span>
              {u.ranking && <span className="block text-caption font-semibold">{u.ranking}</span>}
            </span>
            {chevron}
          </summary>
          <div className="flex flex-col gap-3 px-4 pb-4">
            {u.est_year != null && <p className="text-body">Estd. {u.est_year}</p>}
            {u.achievements && <p className="text-body">{u.achievements}</p>}
            <div className="flex flex-wrap justify-between gap-2 text-caption font-semibold">
              {u.address && <span>{u.address}</span>}
              <Link href="/#brochure" className="flex items-center gap-1 text-white">
                View Institutional Brochure <Icon name="arrow_forward" />
              </Link>
            </div>
          </div>
        </details>
      )}
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-title font-semibold text-primary">Students on campus</h2>
            <p className="text-body text-muted">Departmental clusters and batch strength from the university programme register.</p>
          </div>
        </div>
        <State data={progs.data} error={progs.error} retry={() => progs.mutate()} empty={(d) => !d.length}>
          {(ps) => {
            const card = (p: (typeof ps)[number]) => (
              <div key={p.id} className="flex flex-col gap-2 rounded-xs bg-surface-low p-3">
                <p className="text-caption font-bold text-muted">{p.department}</p>
                <p className="font-display text-title font-bold text-primary">{p.name}</p>
                <p className="text-body text-muted">
                  <b className="font-display text-title text-ink">{p.student_count ?? "—"}</b> Students in batch
                </p>
                <a href="#candidates" onClick={() => onExplore(p.id)} className="flex items-center justify-between py-2 text-label font-semibold text-tertiary">
                  Show these candidates <Icon name="arrow_forward" />
                </a>
              </div>
            );
            return (
              <div className="flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">{ps.slice(0, 2).map(card)}</div>
                {ps.length > 2 && (
                  <details className="group flex flex-col gap-3">
                    <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-xs px-1 text-label font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
                      <span className="group-open:hidden">Show all {ps.length} programmes</span>
                      <span className="hidden group-open:inline">Show fewer</span>
                      {chevron}
                    </summary>
                    <div className="grid gap-3 sm:grid-cols-2">{ps.slice(2).map(card)}</div>
                  </details>
                )}
              </div>
            );
          }}
        </State>
      </Card>
    </div>
  );
}
