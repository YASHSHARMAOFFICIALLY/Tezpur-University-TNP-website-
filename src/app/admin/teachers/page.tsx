"use client";

import { useState } from "react";
import useSWR from "swr";
import { AppShell } from "@/components/AppShell";
import { Badge, Button, Card, Empty, Field, Input, Notice, PageHead, SectionTitle, State, initials, useRun } from "@/components/ui";
import { api, call, useSession } from "@/lib/api";
import { ADMIN_NAV } from "../nav";

export default function TeachersPage() {
  const staff = useSWR("admin/teachers", () => call(api.GET("/api/v1/admin/teachers", { params: { query: { limit: 100 } } })));
  const add = useRun();
  const repair = useRun();
  const me = useSession()?.user.id;
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <AppShell role="admin" nav={ADMIN_NAV} active="/admin/teachers">
      <div className="mx-auto flex max-w-[976px] flex-col gap-5">
        <PageHead
          eyebrow="Access Control"
          title="Staff Accounts"
          sub="TPO and faculty logins. New accounts get a one-time password by email and must change it at first sign-in."
        />
        <Card className="flex flex-col gap-3 p-5">
          <SectionTitle icon="person_add" title="Create Teacher / Faculty Login" sub="Every admin account has full T&P console access." />
          <form
            className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const fd = new FormData(form);
              add.run(
                "add",
                async () => {
                  await call(api.POST("/api/v1/admin/teachers", { body: { name: String(fd.get("name")), email: String(fd.get("email")) } }));
                  form.reset();
                  staff.mutate();
                },
                "Account created; one-time password emailed.",
              );
            }}
          >
            <Field label="Full name *">
              <Input name="name" required minLength={2} placeholder="Dr. Ananya Baruah" />
            </Field>
            <Field label="University email *">
              <Input name="email" type="email" required placeholder="name@tezu.ernet.in" />
            </Field>
            <Button type="submit" busy={add.busy === "add"} icon="add">
              Create Login
            </Button>
          </form>
          <Notice msg={add.msg} />
        </Card>
        <Card className="flex flex-col gap-3 p-5">
          <SectionTitle icon="badge" title="Admin & Teacher Accounts" />
          <Notice msg={repair.msg} />
          <State data={staff.data} error={staff.error} retry={() => staff.mutate()} empty={(d) => !d.data.length}>
            {({ data }) =>
              data.length ? (
                <ul className="flex flex-col divide-y divide-surface">
                  {data.map((t) => (
                    <li key={t.id} className="flex flex-col justify-between gap-2 py-3 sm:flex-row sm:items-center">
                      <span className="flex items-center gap-3">
                        <span className="grid size-9 place-items-center rounded-xl bg-primary-container text-label font-bold text-white">
                          {initials(t.name)}
                        </span>
                        <span>
                          <span className="block text-body font-semibold text-ink">
                            {t.name} {t.id === me && <Badge tone="info">You</Badge>}
                          </span>
                          <span className="text-caption text-muted">{t.email}</span>
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge tone={t.status === "active" ? "info" : "muted"} className="capitalize">
                          {t.status}
                        </Badge>
                        {t.id !== me && (
                          <>
                            <Button
                              size="sm"
                              variant="white"
                              icon="lock_reset"
                              busy={repair.busy === `r${t.id}`}
                              onClick={() =>
                                repair.run(
                                  `r${t.id}`,
                                  () => call(api.POST("/api/v1/admin/users/{id}/reset-password", { params: { path: { id: t.id } } })),
                                  `One-time password emailed to ${t.email}.`,
                                )
                              }
                            >
                              Reset Password
                            </Button>
                            <Button
                              size="sm"
                              variant="white"
                              icon="lock_open"
                              busy={repair.busy === `u${t.id}`}
                              onClick={() =>
                                repair.run(
                                  `u${t.id}`,
                                  () => call(api.POST("/api/v1/admin/users/{id}/clear-rate-limit", { params: { path: { id: t.id } } })),
                                  "Sign-in lock cleared.",
                                )
                              }
                            >
                              Unlock
                            </Button>
                            {confirming === t.id ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="danger"
                                  icon="delete_forever"
                                  busy={repair.busy === `d${t.id}`}
                                  onClick={() =>
                                    repair
                                      .run(
                                        `d${t.id}`,
                                        async () => {
                                          await call(api.DELETE("/api/v1/admin/teachers/{id}", { params: { path: { id: t.id } } }));
                                          await staff.mutate();
                                        },
                                        `${t.name}'s account deleted.`,
                                      )
                                      .then(() => setConfirming(null))
                                  }
                                >
                                  Confirm Delete
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <Button size="sm" variant="danger" icon="delete" onClick={() => setConfirming(t.id)}>
                                Delete
                              </Button>
                            )}
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty />
              )
            }
          </State>
        </Card>
      </div>
    </AppShell>
  );
}
