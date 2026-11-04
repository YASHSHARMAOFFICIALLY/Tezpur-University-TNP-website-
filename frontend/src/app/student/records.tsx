"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button, Card, Empty, Field, Input, Notice, SectionTitle, State, Tabs, Textarea, useRun } from "@/components/ui";
import { api, call, fileBody, openFile } from "@/lib/api";
import { fmtMonths, type StudentRecord } from "./data";

type Kind = StudentRecord["kind"];
const KINDS: Record<Kind, { label: string; one: string; icon: string; org: string }> = {
  certificate: { label: "Certificates", one: "certificate", icon: "workspace_premium", org: "Issued by" },
  internship: { label: "Internships", one: "internship", icon: "badge", org: "Organisation" },
  project: { label: "Projects", one: "project", icon: "code", org: "Guide / organisation" },
};
const ACCEPT = "application/pdf,image/jpeg,image/png";

const useRecords = () => useSWR("students/me/records", () => call(api.GET("/api/v1/students/me/records")));

export function Records() {
  const recs = useRecords();
  const [tab, setTab] = useState<Kind>("certificate");
  const [adding, setAdding] = useState(false);
  const count = (k: Kind) => recs.data?.filter((r) => r.kind === k).length;
  return (
    <Card className="flex scroll-mt-24 flex-col gap-4 p-5">
      <span id="records" />
      <SectionTitle icon="folder_shared" title="Certificates, internships & projects" sub="Recruiters see these with your application. Attach proof as PDF, JPEG or PNG (5 MB max).">
        {!adding && (
          <Button size="sm" icon="add" onClick={() => setAdding(true)}>
            Add {KINDS[tab].one}
          </Button>
        )}
      </SectionTitle>
      <Tabs
        value={tab}
        onChange={(k) => (setTab(k), setAdding(false))}
        tabs={(Object.keys(KINDS) as Kind[]).map((k) => ({ id: k, label: KINDS[k].label, icon: KINDS[k].icon, count: count(k) }))}
      />
      {adding && <AddRecord key={tab} kind={tab} onDone={() => (setAdding(false), recs.mutate())} />}
      <State data={recs.data} error={recs.error} retry={() => recs.mutate()}>
        {(all) => {
          const list = all.filter((r) => r.kind === tab);
          return list.length ? (
            <ul className="flex flex-col gap-3">
              {list.map((r) => (
                <RecordItem key={r.id} r={r} onChange={() => recs.mutate()} />
              ))}
            </ul>
          ) : (
            <Empty icon={KINDS[tab].icon} text={`No ${KINDS[tab].label.toLowerCase()} added yet.`} />
          );
        }}
      </State>
    </Card>
  );
}

function AddRecord({ kind, onDone }: { kind: Kind; onDone: () => void }) {
  const { busy, msg, run } = useRun();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const g = (k: string) => String(fd.get(k) ?? "").trim() || undefined;
    const file = fd.get("file") as File | null;
    const ok = await run("add", async () => {
      const r = await call(
        api.POST("/api/v1/students/me/records", {
          body: { kind, title: g("title")!, organisation: g("organisation"), description: g("description"), start_month: g("start_month"), end_month: g("end_month"), url: g("url") },
        }),
      );
      if (file?.size) await call(api.POST("/api/v1/students/me/records/{id}/file", { params: { path: { id: r.id } }, ...fileBody(file) }));
    });
    if (ok) onDone();
  }
  return (
    <form onSubmit={submit} aria-label={`New ${KINDS[kind].one}`} className="grid gap-3 rounded-sm bg-surface-low p-4 sm:grid-cols-2">
      <Field label="Title *">
        <Input name="title" required minLength={2} maxLength={200} />
      </Field>
      <Field label={KINDS[kind].org}>
        <Input name="organisation" maxLength={200} />
      </Field>
      <Field label="Start month">
        <Input name="start_month" type="month" />
      </Field>
      <Field label="End month">
        <Input name="end_month" type="month" />
      </Field>
      <Field label="Description" className="sm:col-span-2">
        <Textarea name="description" rows={3} maxLength={2000} />
      </Field>
      <Field label="Link" hint="Credential, repository or demo URL.">
        <Input name="url" type="url" placeholder="https://" maxLength={500} />
      </Field>
      <Field label="Attachment" hint="PDF, JPEG or PNG, 5 MB max.">
        <Input name="file" type="file" accept={ACCEPT} className="py-1.5" />
      </Field>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Notice msg={msg} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" busy={busy === "add"}>
            Save {KINDS[kind].one}
          </Button>
        </div>
      </div>
    </form>
  );
}

function RecordItem({ r, onChange }: { r: StudentRecord; onChange: () => void }) {
  const { busy, msg, run } = useRun();
  const [confirm, setConfirm] = useState(false);
  const when = fmtMonths(r.start_month, r.end_month);
  const upload = (file?: File) =>
    file && run("file", () => call(api.POST("/api/v1/students/me/records/{id}/file", { params: { path: { id: r.id } }, ...fileBody(file) })).then(onChange));
  return (
    <li aria-label={r.title} className="flex flex-col gap-2 rounded-sm bg-surface-low p-4">
      <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <h3 className="text-card font-semibold break-words text-primary">{r.title}</h3>
          {r.organisation && <p className="text-body text-muted">{r.organisation}</p>}
        </div>
        {when && <p className="shrink-0 text-label font-semibold text-tertiary">{when}</p>}
      </div>
      {r.description && <p className="text-body whitespace-pre-line text-ink">{r.description}</p>}
      {r.url && (
        <a href={r.url} target="_blank" rel="noreferrer" className="w-fit text-label font-semibold break-all text-primary underline">
          {r.url}
        </a>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {r.file_id && (
          <Button size="sm" variant="white" icon="attach_file" onClick={() => openFile(r.file_id!)}>
            View attachment
          </Button>
        )}
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-xs bg-surface-high px-2 py-1 text-caption font-semibold text-ink focus-within:outline-2 focus-within:outline-accent hover:bg-surface-highest">
          {busy === "file" ? "Uploading…" : r.file_id ? "Replace attachment" : "Attach file"}
          <input type="file" accept={ACCEPT} className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
        </label>
        {confirm ? (
          <>
            <Button size="sm" variant="danger" busy={busy === "del"} onClick={() => run("del", () => call(api.DELETE("/api/v1/students/me/records/{id}", { params: { path: { id: r.id } } })).then(onChange))}>
              Confirm remove
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
              Keep
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" icon="delete" onClick={() => setConfirm(true)}>
            Remove
          </Button>
        )}
      </div>
      <Notice msg={msg} />
    </li>
  );
}
