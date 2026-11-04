"use client";

import { useState } from "react";
import { Button, Field, Input, Modal, Notice, Select, Textarea, useRun } from "@/components/ui";
import { api, call } from "@/lib/api";
import type { Company, FeedbackForm } from "./model";

const CATEGORIES = ["mnc", "private", "psu", "govt", "startup", "ngo", "other"] as const;

export function CompanyProfile({ c, onClose }: { c: Company; onClose: () => void }) {
  const save = useRun();
  const contacts = useRun();
  const [list, setList] = useState(c.contacts);
  const refresh = async () => setList((await call(api.GET("/api/v1/companies/me"))).contacts);
  return (
    <Modal title="Organisation Profile" onClose={onClose} wide>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const g = (k: string) => String(fd.get(k) ?? "").trim();
          save.run(
            "save",
            () =>
              call(
                api.PATCH("/api/v1/companies/me", {
                  body: {
                    name: g("name"),
                    website: g("website") || undefined,
                    category: g("category") as Company["category"],
                    sector: g("sector") || undefined,
                    postal_address: g("postal_address") || undefined,
                  },
                }),
              ),
            "Profile saved.",
          );
        }}
      >
        <Field label="Organisation Legal Name *">
          <Input name="name" required minLength={2} defaultValue={c.name} />
        </Field>
        <Field label="Official Website">
          <Input name="website" type="url" defaultValue={c.website ?? ""} />
        </Field>
        <Field label="Corporate Category">
          <Select name="category" defaultValue={c.category}>
            {CATEGORIES.map((x) => (
              <option key={x} value={x}>
                {x.toUpperCase()}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Industry Sector">
          <Input name="sector" defaultValue={c.sector ?? ""} />
        </Field>
        <Field label="Registered Office Address" className="sm:col-span-2">
          <Input name="postal_address" defaultValue={c.postal_address ?? ""} />
        </Field>
        <div className="flex items-center justify-end gap-2 sm:col-span-2">
          <Notice msg={save.msg} />
          <Button type="submit" busy={save.busy === "save"}>
            Save Profile
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-2 rounded-xs bg-surface-low p-3">
        <p className="text-label font-bold text-ink uppercase">Contact persons</p>
        {list.length ? (
          list.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-xs bg-white p-2 text-body">
              <span>
                <b className="text-ink">{p.name}</b> {p.designation && <span className="text-muted">• {p.designation}</span>}
                <span className="block text-caption text-muted">{[p.email, p.phone, p.mobile].filter(Boolean).join(" • ")}</span>
              </span>
              <Button
                size="sm"
                variant="danger"
                aria-label={`Remove ${p.name}`}
                busy={contacts.busy === p.id}
                onClick={() =>
                  contacts.run(
                    p.id,
                    async () => (
                      await call(
                        api.DELETE("/api/v1/companies/me/contacts/{id}", {
                          params: { path: { id: p.id } },
                        }),
                      ),
                      await refresh()
                    ),
                    "Contact removed.",
                  )
                }
              >
                Remove
              </Button>
            </div>
          ))
        ) : (
          <p className="text-body text-muted">No contact persons yet.</p>
        )}
        <form
          className="grid gap-2 pt-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            const g = (k: string) => String(fd.get(k) ?? "").trim() || undefined;
            contacts.run(
              "add",
              async () => {
                await call(
                  api.POST("/api/v1/companies/me/contacts", {
                    body: {
                      name: g("name")!,
                      designation: g("designation"),
                      email: g("email"),
                      phone: g("phone"),
                    },
                  }),
                );
                form.reset();
                await refresh();
              },
              "Contact added.",
            );
          }}
        >
          <Input name="name" required minLength={2} placeholder="Name *" aria-label="Contact name" />
          <Input name="designation" placeholder="Designation" aria-label="Contact designation" />
          <Input name="email" type="email" placeholder="Email" aria-label="Contact email" />
          <Input name="phone" type="tel" placeholder="Phone" aria-label="Contact phone" />
          <Button type="submit" variant="soft" icon="person_add" busy={contacts.busy === "add"} className="sm:col-span-2">
            Add Contact
          </Button>
        </form>
        <Notice msg={contacts.msg} />
      </div>
    </Modal>
  );
}


export function FeedbackDialog({ forms, onClose }: { forms: FeedbackForm[]; onClose: () => void }) {
  const form = forms[0];
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const answers = Object.fromEntries(
      form.questions.map((q) => [q.id, q.kind === "rating" ? Number(fd.get(q.id)) : q.kind === "yes_no" ? fd.get(q.id) === "yes" : String(fd.get(q.id) ?? "")]),
    );
    setBusy(true);
    try {
      await call(
        api.POST("/api/v1/feedback/{id}", {
          params: { path: { id: form.id } },
          body: { answers } as never,
        }),
      );
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Modal title="Drive feedback for the T&P cell" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {form.questions.map((q) => (
          <Field key={q.id} label={q.label}>
            {q.kind === "rating" ? (
              <Select name={q.id} required defaultValue="">
                <option value="">Rate 1–5</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </Select>
            ) : q.kind === "yes_no" ? (
              <Select name={q.id} required defaultValue="">
                <option value="">Choose</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </Select>
            ) : (
              <Textarea name={q.id} rows={3} />
            )}
          </Field>
        ))}
        {err && <p className="text-body text-error">{err}</p>}
        <Button type="submit" busy={busy}>
          Submit Feedback
        </Button>
      </form>
    </Modal>
  );
}
