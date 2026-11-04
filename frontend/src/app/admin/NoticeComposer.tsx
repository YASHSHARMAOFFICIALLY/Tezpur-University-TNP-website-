"use client";

import { useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { Button, Field, Icon, Input, Notice, Select, Textarea, useRun } from "@/components/ui";
import { api, call, fileBody } from "@/lib/api";
import { EMPTY_FILTER, StudentFilterFields, filterQuery, isTargeted, type StudentFilter } from "./StudentFilterFields";

type Audience = "students" | "companies" | "all";

/** Notice form with student targeting, a live reach count and an optional PDF. Used on Comms and from the roster. */
export function NoticeComposer({ initial = EMPTY_FILTER, onPosted }: { initial?: StudentFilter; onPosted?: () => void }) {
  const { busy, msg, run } = useRun();
  const { mutate } = useSWRConfig();
  const [audience, setAudience] = useState<Audience>("students");
  const [filter, setFilter] = useState(initial);
  // The reach query trails typing by 400 ms so CGPA keystrokes don't fire one request each.
  const [reachFilter, setReachFilter] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const reach = useSWR(audience === "students" ? ["admin/notices/reach", JSON.stringify(reachFilter)] : null, () =>
    call(api.GET("/api/v1/admin/notices/reach", { params: { query: filterQuery(reachFilter) } })),
  );

  function changeFilter(f: StudentFilter) {
    setFilter(f);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setReachFilter(f), 400);
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const file = fd.get("pdf") as File | null;
        run(
          "post",
          async () => {
            const n = await call(
              api.POST("/api/v1/admin/notices", {
                body: {
                  audience,
                  title: String(fd.get("title")),
                  body: String(fd.get("body")),
                  email: fd.has("email"),
                  ...(audience === "students" ? filter : EMPTY_FILTER),
                },
              }),
            );
            if (file?.size) await call(api.POST("/api/v1/admin/notices/{id}/attachment", { params: { path: { id: n.id } }, ...fileBody(file) }));
            form.reset();
            void mutate((k) => Array.isArray(k) && k[0] === "admin/notices");
            onPosted?.();
          },
          file?.size ? "Notice published with its PDF." : "Notice published.",
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <Field label="Audience">
          <Select name="audience" value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
            <option value="students">Students</option>
            <option value="companies">Recruiters</option>
            <option value="all">Everyone</option>
          </Select>
        </Field>
        <Field label="Title *">
          <Input name="title" required minLength={3} maxLength={200} placeholder="Interview schedule for Batch 2026" />
        </Field>
      </div>
      <Field label="Message *">
        <Textarea name="body" required rows={5} />
      </Field>
      {audience === "students" ? (
        <details open={isTargeted(initial)} className="group rounded-xs bg-surface-low p-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-label font-semibold text-ink [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-1">
              <Icon name="filter_alt" /> Target students {isTargeted(filter) ? "(filtered)" : "(all active students)"}
            </span>
            <Icon name="expand_more" className="transition-transform group-open:rotate-180" />
          </summary>
          <div className="pt-3">
            <StudentFilterFields value={filter} onChange={changeFilter} />
          </div>
        </details>
      ) : (
        <p className="text-caption text-muted">Department, batch and CGPA targeting is only available for student notices.</p>
      )}
      {audience === "students" && (
        <p role="status" aria-live="polite" className="flex items-center gap-1 text-body font-semibold text-primary" data-testid="reach">
          <Icon name="groups" />
          {reach.error ? "Couldn't count the audience." : reach.data ? `Reaches ${reach.data.students} active student${reach.data.students === 1 ? "" : "s"}` : "Counting…"}
        </p>
      )}
      <Field label="PDF attachment (optional)" hint="Up to 10 MB.">
        <Input
          name="pdf"
          type="file"
          accept="application/pdf"
          className="py-1.5 file:mr-3 file:rounded-xs file:border-0 file:bg-surface file:px-3 file:py-1 file:text-label file:font-semibold file:text-primary"
        />
      </Field>
      <label className="flex items-center gap-2 text-body text-ink">
        <input type="checkbox" name="email" className="accent-primary" /> Also email the audience
      </label>
      <Notice msg={msg} />
      <Button type="submit" busy={busy === "post"} icon="send" className="self-end">
        Publish Notice
      </Button>
    </form>
  );
}
