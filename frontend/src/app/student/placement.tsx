"use client";

import { Button, Card, Icon, SectionTitle, State } from "@/components/ui";
import { openFile } from "@/lib/api";
import { useRecords, type Metrics } from "./data";

const COLS: { key: Exclude<keyof Metrics, "cohort">; label: string; unit: string }[] = [
  { key: "placement_rate", label: "Placed", unit: "%" },
  { key: "highest_ctc_lpa", label: "Highest package", unit: " LPA" },
  { key: "corporate_partners", label: "Recruiters", unit: "+" },
  { key: "summer_internships", label: "Internships", unit: "+" },
];

export function PlacementStats() {
  const r = useRecords();
  return (
    <Card className="flex scroll-mt-24 flex-col gap-4 p-5">
      <span id="placement" />
      <SectionTitle icon="monitoring" title="Placement statistics" sub="Year-wise figures published by the T&P cell, with the brochure for each year." />
      <State data={r.data} error={r.error} retry={() => r.mutate()} empty={(d) => d.length === 0}>
        {(d) => (
          <ul className="flex flex-col gap-3">
            {d
              .toSorted((a, b) => b.year - a.year)
              .map((rec) => {
                const m = rec.data as Metrics;
                return (
                  <li key={rec.id} className="flex flex-col gap-3 rounded-sm bg-surface-low p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-display text-title font-semibold text-primary">{m.cohort ?? `${rec.year}–${String(rec.year + 1).slice(-2)}`}</h3>
                      {rec.brochure_file_id && (
                        <Button size="sm" variant="white" icon="download" onClick={() => openFile(rec.brochure_file_id!)}>
                          Brochure
                        </Button>
                      )}
                    </div>
                    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {COLS.map((c) => (
                        <div key={c.key} className="flex flex-col">
                          <dt className="text-label text-muted">{c.label}</dt>
                          <dd className="font-display text-headline font-bold text-primary tabular-nums">
                            {typeof m[c.key] === "number" ? `${(m[c.key] as number).toLocaleString("en-IN")}${c.unit}` : <Icon name="remove" className="text-muted" />}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                );
              })}
          </ul>
        )}
      </State>
    </Card>
  );
}
