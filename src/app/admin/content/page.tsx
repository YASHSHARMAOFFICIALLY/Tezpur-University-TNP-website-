"use client";

import { useState } from "react";
import useSWR from "swr";
import { AppShell } from "@/components/AppShell";
import { Badge, Button, Card, Empty, Field, Icon, Input, Notice, PageHead, SectionTitle, State, Textarea, useRun } from "@/components/ui";
import { api, call, fileBody, openFile } from "@/lib/api";
import type { paths } from "@/lib/api-types";
import { ADMIN_NAV } from "../nav";
import { SCHOOL_DEFAULTS, SITE_DEFAULTS, TEXT_FIELDS, type Site } from "../../site-defaults";

type Programme = paths["/api/v1/programmes"]["get"]["responses"]["200"]["content"]["application/json"][number];
type Uni = NonNullable<paths["/api/v1/university"]["get"]["responses"]["200"]["content"]["application/json"]>;
type PlacementRecord = paths["/api/v1/placement-records"]["get"]["responses"]["200"]["content"]["application/json"][number];

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
        <LandingText />
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
      <SectionTitle
        icon="account_balance"
        title="University Profile"
        sub="Shown on the public page: address, first contact email and mobile, and the ranking (as the hero badge when the landing text leaves it blank)."
      />
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
                  await uni.mutate();
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

const blank = (v: string) => v.trim() || undefined;

function LandingText() {
  const uni = useSWR("university", () => call(api.GET("/api/v1/university")));
  const progs = useSWR("programmes", () => call(api.GET("/api/v1/programmes")));
  return (
    <Card className="flex flex-col gap-3 p-5">
      <SectionTitle
        icon="web"
        title="Landing page text"
        sub="Every text block on the public home page. Leave a field blank to show the built-in text (shown as the placeholder)."
      />
      <State data={uni.isLoading || !progs.data ? undefined : (uni.data ?? null)} error={uni.error ?? progs.error} retry={() => (uni.mutate(), progs.mutate())} rows={4}>
        {(u) =>
          u ? (
            <LandingForm u={u} departments={[...new Set(progs.data!.map((p) => p.department))]} onSaved={() => uni.mutate()} />
          ) : (
            <Empty icon="account_balance" text="Save the University Profile first; the landing text is stored with it." />
          )
        }
      </State>
    </Card>
  );
}

type ContactRow = { key: number; name: string; role: string; line: string };

function LandingForm({ u, departments, onSaved }: { u: Uni; departments: string[]; onSaved: () => Promise<unknown> }) {
  const site: Site = u.site ?? {};
  const { busy, msg, run } = useRun();
  const [contacts, setContacts] = useState<ContactRow[]>(() => (site.contacts ?? []).map((c, i) => ({ key: i, ...c })));
  const setContact = (key: number, patch: Partial<ContactRow>) => setContacts(contacts.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  // Saved rows for departments no longer offered stay in the list so their copy isn't silently dropped.
  const schoolDepts = [...new Set([...departments, ...(site.schools ?? []).map((s) => s.department)])];

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const g = (k: string) => String(fd.get(k) ?? "");
        const next: Site = {
          ...Object.fromEntries(TEXT_FIELDS.map(({ key }) => [key, blank(g(key))])),
          contacts: contacts.filter((c) => c.name.trim()).map(({ name, role, line }) => ({ name: name.trim(), role: role.trim(), line: line.trim() })),
          schools: schoolDepts
            .map((department, i) => ({ department, tag: blank(g(`tag_${i}`)), foot: blank(g(`foot_${i}`)) }))
            .filter((s) => s.tag || s.foot),
        };
        run(
          "save",
          async () => {
            const { name, address, website, est_year, ranking, achievements, contact_emails, admin_mobiles } = u;
            await call(
              api.PUT("/api/v1/admin/university", { body: { name, address, website, est_year, ranking, achievements, contact_emails, admin_mobiles, site: next } }),
            );
            await onSaved();
          },
          "Landing page text saved. The public page shows it now.",
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {TEXT_FIELDS.map(({ key, label, long, hint }) => (
          <Field key={key} label={label} hint={hint} className={long ? "sm:col-span-2" : undefined}>
            {long ? (
              <Textarea name={key} rows={key === "hero_title" ? 2 : 3} defaultValue={site[key] ?? ""} placeholder={SITE_DEFAULTS[key]} />
            ) : (
              <Input name={key} defaultValue={site[key] ?? ""} placeholder={key === "hero_badge" ? (u.ranking ?? SITE_DEFAULTS[key]) : SITE_DEFAULTS[key]} />
            )}
          </Field>
        ))}
      </div>

      <fieldset className="flex flex-col gap-2 rounded-xs bg-surface-low p-3">
        <legend className="sr-only">Directorate contacts</legend>
        <div className="flex items-center justify-between gap-2">
          <p className="text-label font-bold text-ink uppercase">Directorate contacts</p>
          <Button
            type="button"
            size="sm"
            variant="white"
            icon="person_add"
            disabled={contacts.length >= 10}
            onClick={() => setContacts([...contacts, { key: Date.now(), name: "", role: "", line: "" }])}
          >
            Add contact
          </Button>
        </div>
        {!contacts.length && <p className="text-caption text-muted">No contacts saved: the page shows the built-in director and placement officer.</p>}
        {contacts.map((c, i) => (
          <div key={c.key} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_1.3fr_auto]">
            <Field label={`Name ${i + 1}`}>
              <Input value={c.name} onChange={(e) => setContact(c.key, { name: e.target.value })} required maxLength={200} placeholder="Ms. Deena Davy" />
            </Field>
            <Field label="Role">
              <Input value={c.role} onChange={(e) => setContact(c.key, { role: e.target.value })} maxLength={200} placeholder="Director & In-Charge, T&P Cell" />
            </Field>
            <Field label="Contact line">
              <Input value={c.line} onChange={(e) => setContact(c.key, { line: e.target.value })} maxLength={200} placeholder="Email: adtp@tezu.ernet.in" />
            </Field>
            <Button type="button" size="md" variant="danger" icon="delete" aria-label={`Remove contact ${i + 1}`} onClick={() => setContacts(contacts.filter((x) => x.key !== c.key))}>
              <span className="sm:sr-only">Remove</span>
            </Button>
          </div>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2 rounded-xs bg-surface-low p-3">
        <legend className="sr-only">School cards</legend>
        <p className="text-label font-bold text-ink uppercase">School cards</p>
        {!schoolDepts.length && <p className="text-caption text-muted">Add programmes below; each school gets a card.</p>}
        {schoolDepts.map((d, i) => {
          const own = site.schools?.find((s) => s.department === d);
          return (
            <div key={d} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr] sm:items-end">
              <p className="text-body font-semibold break-words text-ink sm:pb-2">{d}</p>
              <Field label="Tag line">
                <Input name={`tag_${i}`} defaultValue={own?.tag ?? ""} maxLength={200} placeholder={SCHOOL_DEFAULTS[d]?.tag ?? "Number of programmes"} />
              </Field>
              <Field label="Footer">
                <Input name={`foot_${i}`} defaultValue={own?.foot ?? ""} maxLength={200} placeholder={SCHOOL_DEFAULTS[d]?.foot ?? "Number of students"} />
              </Field>
            </div>
          );
        })}
      </fieldset>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Notice msg={msg} />
        <Button type="submit" busy={busy === "save"} icon="save">
          Save Landing Text
        </Button>
      </div>
    </form>
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

function RecordForm({ r, onDone, onCancel }: { r?: PlacementRecord; onDone: () => Promise<unknown>; onCancel?: () => void }) {
  const { busy, msg, run } = useRun();
  const old = (r?.data ?? {}) as Record<string, unknown>;
  return (
    <form
      className="grid gap-3 rounded-xs bg-surface-low p-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const g = (k: string) => String(fd.get(k) ?? "").trim();
        // Keys this form doesn't know about survive an edit.
        const data: Record<string, unknown> = { ...old };
        for (const [k] of METRICS) {
          if (g(k)) data[k] = Number(g(k));
          else delete data[k];
        }
        if (g("cohort")) data.cohort = g("cohort");
        else delete data.cohort;
        const body = { year: Number(g("year")), data };
        run(
          "save",
          async () => {
            if (r) await call(api.PATCH("/api/v1/admin/placement-records/{id}", { params: { path: { id: r.id } }, body }));
            else await call(api.POST("/api/v1/admin/placement-records", { body }));
            if (!r) form.reset();
            await onDone();
          },
          r ? undefined : "Record added.",
        );
      }}
    >
      <p className="text-label font-bold text-ink uppercase sm:col-span-3">{r ? `Edit ${r.year}` : "Add a year"}</p>
      <Field label="Year *">
        <Input name="year" type="number" required min="2000" max="2100" defaultValue={r?.year} />
      </Field>
      {METRICS.map(([k, l]) => (
        <Field key={k} label={l}>
          <Input name={k} type="number" step="0.1" min="0" defaultValue={old[k] === undefined ? "" : String(old[k])} />
        </Field>
      ))}
      <Field label="Cohort label">
        <Input name="cohort" placeholder="Academic Cohort 2024-25" defaultValue={typeof old.cohort === "string" ? old.cohort : ""} />
      </Field>
      <div className="flex flex-wrap items-end justify-end gap-2 sm:col-span-3">
        <Notice msg={msg} />
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" busy={busy === "save"} icon={r ? "check" : "add"}>
          {r ? "Save Record" : "Add Record"}
        </Button>
      </div>
    </form>
  );
}

function PlacementRecords() {
  const recs = useSWR("placement-records", () => call(api.GET("/api/v1/placement-records")));
  const up = useRun();
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  return (
    <Card className="flex flex-col gap-3 p-5">
      <SectionTitle
        icon="monitoring"
        title="Placement Records & Brochures"
        sub="The newest year feeds the public hero metrics and the brochure download button."
      />
      <RecordForm onDone={() => recs.mutate()} />
      <Notice msg={up.msg} />
      <State data={recs.data} error={recs.error} retry={() => recs.mutate()} empty={(d) => !d.length}>
        {(rows) => (
          <ul className="flex flex-col divide-y divide-surface">
            {rows
              .toSorted((a, b) => b.year - a.year)
              .map((r) =>
                editing === r.id ? (
                  <li key={r.id} className="py-3">
                    <RecordForm r={r} onDone={async () => (await recs.mutate(), setEditing(null))} onCancel={() => setEditing(null)} />
                  </li>
                ) : (
                  <li key={r.id} className="flex flex-col justify-between gap-2 py-3 sm:flex-row sm:items-center">
                    <div className="min-w-0">
                      <p className="font-display text-title font-bold text-primary">{r.year}</p>
                      <p className="text-caption break-words text-muted">
                        {Object.entries(r.data as Record<string, unknown>)
                          .map(([k, v]) => `${METRICS.find((m) => m[0] === k)?.[1] ?? k}: ${v}`)
                          .join(" • ") || "No metrics"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {r.brochure_file_id && (
                        <Button size="sm" variant="ghost" icon="picture_as_pdf" onClick={() => openFile(r.brochure_file_id!)}>
                          View Brochure
                        </Button>
                      )}
                      <label className="inline-flex cursor-pointer items-center gap-1 rounded-xs bg-surface-high px-2 py-1 text-caption font-semibold text-ink focus-within:outline-2 focus-within:outline-accent">
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
                                  await recs.mutate();
                                },
                                `Brochure uploaded for ${r.year}.`,
                              );
                          }}
                        />
                      </label>
                      <Button size="sm" variant="soft" icon="edit" onClick={() => setEditing(r.id)}>
                        Edit
                      </Button>
                      {deleting === r.id ? (
                        <>
                          <Button
                            size="sm"
                            variant="danger"
                            icon="delete_forever"
                            busy={up.busy === `d${r.id}`}
                            onClick={() =>
                              up
                                .run(
                                  `d${r.id}`,
                                  async () => {
                                    await call(api.DELETE("/api/v1/admin/placement-records/{id}", { params: { path: { id: r.id } } }));
                                    await recs.mutate();
                                  },
                                  `Record for ${r.year} deleted.`,
                                )
                                .then(() => setDeleting(null))
                            }
                          >
                            Confirm Delete {r.year}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDeleting(null)}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="danger" icon="delete" onClick={() => setDeleting(r.id)}>
                          Delete
                        </Button>
                      )}
                    </div>
                  </li>
                ),
              )}
          </ul>
        )}
      </State>
    </Card>
  );
}
