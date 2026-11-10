"use client";

import { Button, Card, Icon, SectionTitle, State } from "@/components/ui";
import { openFile } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { useNotices } from "./data";

export function Notices() {
  const n = useNotices();
  return (
    <Card className="flex scroll-mt-24 flex-col gap-4 p-5">
      <span id="notices" />
      <SectionTitle icon="campaign" title="Notices" sub="Messages from the T&P cell that are meant for you, newest first." />
      <State data={n.data} error={n.error} retry={() => n.mutate()} empty={(d) => d.data.length === 0}>
        {(d) => (
          <ul className="flex flex-col gap-3">
            {d.data.map((x) => (
              <li key={x.id} className="flex flex-col gap-1.5 rounded-sm bg-surface-low p-4">
                <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-baseline">
                  <h3 className="font-display text-title font-semibold text-primary">{x.title}</h3>
                  <p className="flex shrink-0 items-center gap-1 text-label font-semibold text-muted">
                    <Icon name="schedule" /> {fmtDate(x.published_at, true)}
                  </p>
                </div>
                <p className="text-body-lg whitespace-pre-line text-ink">{x.body}</p>
                {x.file_id && (
                  <Button size="sm" variant="white" icon="picture_as_pdf" className="mt-1 w-fit" onClick={() => openFile(x.file_id!)}>
                    Open attachment
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </State>
    </Card>
  );
}
