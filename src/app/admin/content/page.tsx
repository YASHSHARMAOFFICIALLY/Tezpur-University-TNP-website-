"use client";

import { useState } from "react";
import useSWR from "swr";
import { AppShell } from "@/components/AppShell";
import { Badge, Button, Card, Empty, Field, Icon, Input, Notice, PageHead, SectionTitle, State, Textarea, useRun } from "@/components/ui";
import { api, call, fileBody, openFile } from "@/lib/api";
import type { paths } from "@/lib/api-types";
import { ADMIN_NAV } from "../nav";

type Programme = paths["/api/v1/programmes"]["get"]["responses"]["200"]["content"]["application/json"][number];

export default function ContentPage() {
  return (
    <AppShell role="admin" nav={ADMIN_NAV} active="/admin/content">
      <div className="mx-auto flex max-w-[976px] flex-col gap-5">
        <PageHead
          eyebrow="Institutional Records"
          title="Content & Records"
          sub="Everything the public portal shows: university profile, programmes and year-wise placement records with brochures."
        />
        <University />
        <Programmes />
        <PlacementRecords />
      </div>
    </AppShell>
  );
}

const list = (s: string) =>
  s
    .split(/[\n,]/)
    .map((x) => x.trim())
    .filter(Boolean);

function University() {
  const uni = useSWR("university", () => call(api.GET("/api/v1/university")));
  const { busy, msg, run } = useRun();
  return (
    <Card className="flex flex-col gap-3 p-5">
      <SectionTitle icon="account_balance" title="University Profile" sub="Shown on the public page (contacts, address)." />
      <State data={uni.isLoading ? undefined : (uni.data ?? null)} error={uni.error} retry={() => uni.mutate()} rows={3}>
        {(u) => (
          <form
            key={u?.name ?? "new"}
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const g = (k: string) => String(fd.get(k) ?? "").trim();
              run(
                "save",
                async () => {
                  await call(
                    api.PUT("/api/v1/admin/university", {
                      body: {
                        name: g("name"),
                        address: g("address") || null,
                        website: g("website") || null,
                        est_year: g("est_year") ? Number(g("est_year")) : null,
                        ranking: g("ranking") || null,
                        achievements: g("achievements") || null,
                        contact_emails: list(g("contact_emails")),
                        admin_mobiles: list(g("admin_mobiles")),
                      },
                    }),
                  );
                  uni.mutate();
                },
                "University profile saved.",
              );
            }}
          >
            <Field label="Name *">
              <Input name="name" required defaultValue={u?.name ?? "Tezpur University"} />
            </Field>
            <Field label="Website">
              <Input name="website" type="url" defaultValue={u?.website ?? ""} />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <Input name="address" defaultValue={u?.address ?? ""} />
            </Field>
            <Field label="Established (year)">
              <Input name="est_year" type="number" min="1800" max="2100" defaultValue={u?.est_year ?? ""} />
            </Field>
            <Field label="Ranking / Accreditation">
              <Input name="ranking" defaultValue={u?.ranking ?? ""} />
            </Field>
            <Field label="Achievements" className="sm:col-span-2">
              <Textarea name="achievements" rows={2} defaultValue={u?.achievements ?? ""} />
            </Field>
            <Field label="Contact emails" hint="Comma or line separated.">
              <Textarea name="contact_emails" rows={2} defaultValue={u?.contact_emails.join("\n") ?? ""} />
            </Field>
            <Field label="Admin mobiles" hint="Comma or line separated.">
              <Textarea name="admin_mobiles" rows={2} defaultValue={u?.admin_mobiles.join("\n") ?? ""} />
            </Field>
            <div className="flex items-center justify-end gap-3 sm:col-span-2">
              <Notice msg={msg} />
              <Button type="submit" busy={busy === "save"}>
                Save Profile
              </Button>
            </div>
          </form>
        )}
      </State>
    </Card>
  );
}

function ProgrammeForm({ p, onDone }: { p?: Programme; onDone: () => void }) {
  const { busy, msg, run } = useRun();
  return (
    <form
      className="grid items-end gap-2 sm:grid-cols-[1.2fr_1.6fr_90px_70px_90px_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const g = (k: string) => String(fd.get(k) ?? "").trim();
        const body = {
          department: g("department"),
          name: g("name"),
          code: g("code").toUpperCase(),
          year: g("year") ? Number(g("year")) : null,
          student_count: g("count") ? Number(g("count")) : null,
        };
        run("save", async () => {
          if (p) await call(api.PATCH("/api/v1/admin/programmes/{id}", { params: { path: { id: p.id } }, body }));
          else await call(api.POST("/api/v1/admin/programmes", { body }));
          if (!p) form.reset();
          onDone();
        });
      }}
    >
      <Field label="School / Department">
        <Input name="department" required defaultValue={p?.department} placeholder="School of Engineering" />
      </Field>
      <Field label="Programme">
        <Input name="name" required defaultValue={p?.name} placeholder="B.Tech Computer Science & Engg" />
      </Field>
      <Field label="Code">
        <Input name="code" required maxLength={10} defaultValue={p?.code} placeholder="CSB" />
      </Field>
      <Field label="Years">
        <Input name="year" type="number" min="1" max="6" defaultValue={p?.year ?? ""} />
      </Field>
      <Field label="Students">
        <Input name="count" type="number" min="0" defaultValue={p?.student_count ?? ""} />
      </Field>
      <Button type="submit" busy={busy === "save"} icon={p ? "check" : "add"}>
        {p ? "Save" : "Add"}
      </Button>
      {msg && (
        <div className="sm:col-span-6">
          <Notice msg={msg} />
        </div>
      )}
    </form>
  );
}

function Programmes() {
  const progs = useSWR("programmes", () => call(api.GET("/api/v1/programmes")));
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <Card className="flex flex-col gap-3 p-5">
      <SectionTitle icon="school" title="Programmes" sub="Drives eligibility, the public “Schools & Disciplines” cards and the recruiter talent pool." />
      <div className="rounded-xs bg-surface-low p-3">
        <p className="pb-2 text-label font-bold text-ink uppercase">Add programme</p>
        <ProgrammeForm onDone={() => progs.mutate()} />
      </div>
      <State data={progs.data} error={progs.error} retry={() => progs.mutate()} empty={(d) => !d.length}>
        {(ps) => (
          <ul className="flex flex-col divide-y divide-surface">
            {ps.map((p) =>
              editing === p.id ? (
                <li key={p.id} className="py-3">
                  <ProgrammeForm p={p} onDone={() => (setEditing(null), progs.mutate())} />
                </li>
              ) : (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-body">
                  <span>
                    <b className="text-ink">{p.name}</b> <Badge tone="muted">{p.code}</Badge>
                    <span className="block text-caption text-muted">
                      {p.department} • {p.year ?? "—"} yrs • {p.student_count ?? "—"} students
                    </span>
                  </span>
                  <Button size="sm" variant="soft" icon="edit" onClick={() => setEditing(p.id)}>
                    Edit
                  </Button>
                </li>
              ),
            )}
          </ul>
        )}
      </State>
    </Card>
  );
}

// The public hero reads these keys from the latest record's `data`.
const METRICS = [
  ["placement_rate", "Placement rate (%)"],
  ["corporate_partners", "Corporate partners"],
  ["highest_ctc_lpa", "Highest CTC (LPA)"],
  ["summer_internships", "Summer internships"],
] as const;

function PlacementRecords() {
  const recs = useSWR("placement-records", () => call(api.GET("/api/v1/placement-records")));
  const add = useRun();
  const up = useRun();
  return (
    <Card className="flex flex-col gap-3 p-5">
      <SectionTitle
        icon="monitoring"
        title="Placement Records & Brochures"
        sub="The newest year feeds the public hero metrics and the brochure download button."
      />
      <form
        className="grid gap-3 rounded-xs bg-surface-low p-3 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          const g = (k: string) => String(fd.get(k) ?? "").trim();
          const data: Record<string, number | string> = {};
          for (const [k] of METRICS) if (g(k)) data[k] = Number(g(k));
          if (g("cohort")) data.cohort = g("cohort");
          add.run(
            "add",
            async () => {
              await call(api.POST("/api/v1/admin/placement-records", { body: { year: Number(g("year")), data } }));
              form.reset();
              recs.mutate();
            },
            "Record added.",
          );
        }}
      >
        <p className="text-label font-bold text-ink uppercase sm:col-span-3">Add a year</p>
        <Field label="Year *">
          <Input name="year" type="number" required min="2000" max="2100" />
        </Field>
        {METRICS.map(([k, l]) => (
          <Field key={k} label={l}>
            <Input name={k} type="number" step="0.1" min="0" />
          </Field>
        ))}
        <Field label="Cohort label">
          <Input name="cohort" placeholder="Academic Cohort 2024-25" />
        </Field>
        <div className="flex items-end justify-end gap-2 sm:col-span-3">
          <Notice msg={add.msg} />
          <Button type="submit" busy={add.busy === "add"} icon="add">
            Add Record
          </Button>
        </div>
      </form>
      <Notice msg={up.msg} />
      <State data={recs.data} error={recs.error} retry={() => recs.mutate()} empty={(d) => !d.length}>
        {(rows) =>
          rows.length ? (
            <ul className="flex flex-col divide-y divide-surface">
              {rows
                .toSorted((a, b) => b.year - a.year)
                .map((r) => (
                  <li key={r.id} className="flex flex-col justify-between gap-2 py-3 sm:flex-row sm:items-center">
                    <div>
                      <p className="font-display text-title font-bold text-primary">{r.year}</p>
                      <p className="text-caption text-muted">
                        {Object.entries(r.data as Record<string, unknown>)
                          .map(([k, v]) => `${METRICS.find((m) => m[0] === k)?.[1] ?? k}: ${v}`)
                          .join(" • ") || "No metrics"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {r.brochure_file_id && (
                        <Button size="sm" variant="ghost" icon="picture_as_pdf" onClick={() => openFile(r.brochure_file_id!)}>
                          View Brochure
                        </Button>
                      )}
                      <label className="inline-flex cursor-pointer items-center gap-1 rounded-xs bg-surface-high px-2 py-1 text-caption font-semibold text-ink">
                        <Icon name="upload" /> {r.brochure_file_id ? "Replace" : "Upload"} Brochure PDF
                        <input
                          type="file"
                          accept="application/pdf"
                          className="sr-only"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f)
                              up.run(
                                r.id,
                                async () => {
                                  await call(api.POST("/api/v1/admin/placement-records/{id}/brochure", { params: { path: { id: r.id } }, ...fileBody(f) }));
                                  recs.mutate();
                                },
                                `Brochure uploaded for ${r.year}.`,
                              );
                          }}
                        />
                      </label>
                    </div>
                  </li>
                ))}
            </ul>
          ) : (
            <Empty />
          )
        }
      </State>
    </Card>
  );
}
