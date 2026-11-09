"use client";

import { Button, Field, Icon, Input, Notice, Textarea, useRun } from "@/components/ui";
import { api, call } from "@/lib/api";
import type { Posting } from "./model";

/** Per-posting campus logistics. Saving works at any status and mails the posting's applicants. */
export function Logistics({ drive, reload }: { drive: Posting; reload: () => void }) {
  const save = useRun();
  return (
    <form
      aria-label="Campus logistics"
      className="flex flex-col gap-3 rounded-xs bg-surface-low p-3 sm:p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const g = (k: string) => String(fd.get(k) ?? "").trim() || undefined;
        save.run(
          "save",
          async () => {
            await call(
              api.PUT("/api/v1/company/opportunities/{id}/logistics", {
                params: { path: { id: drive.id } },
                body: { venue: g("venue"), logistics: g("logistics") },
              }),
            );
            reload();
          },
          "Logistics saved. Applicants still in the running were emailed.",
        );
      }}
    >
      <div className="flex gap-2">
        <Icon name="support_agent" className="pt-0.5 text-[20px] text-tertiary" />
        <div>
          <h3 className="font-display text-card font-semibold text-primary">Campus Logistics</h3>
          <p className="text-body text-muted">
            Only students who applied to this posting see these details, on their applications page. Each time you save, applicants still in the running get an
            email with the update.
          </p>
        </div>
      </div>
      <Field label="Venue">
        <Input name="venue" maxLength={300} defaultValue={drive.venue ?? ""} placeholder="Computer Centre Lab 2, Tezpur University" />
      </Field>
      <Field label="Logistics notes" hint="Reporting time, documents to bring, transport, contact on the day.">
        <Textarea name="logistics" rows={4} maxLength={5000} defaultValue={drive.logistics ?? ""} />
      </Field>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Notice msg={save.msg} />
        <Button type="submit" icon="save" busy={save.busy === "save"}>
          Save Logistics
        </Button>
      </div>
    </form>
  );
}
