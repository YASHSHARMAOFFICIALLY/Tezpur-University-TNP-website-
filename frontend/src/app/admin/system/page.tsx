"use client";

import { useState } from "react";
import useSWR from "swr";
import { AppShell } from "@/components/AppShell";
import { Badge, Button, Card, Empty, Icon, Input, Notice, PageHead, SectionTitle, Select, State, cx, useRun } from "@/components/ui";
import { api, call } from "@/lib/api";
import type { paths } from "@/lib/api-types";
import { fmtDate } from "@/lib/format";
import { ADMIN_NAV } from "../nav";

type Setting = paths["/api/v1/admin/settings"]["get"]["responses"]["200"]["content"]["application/json"][number];

export default function SystemPage() {
  return (
    <AppShell role="admin" nav={ADMIN_NAV} active="/admin/system">
      <div className="mx-auto flex max-w-[976px] flex-col gap-5">
        <PageHead
          eyebrow="Run It Without a Developer"
          title="System & Audit"
          sub="Health, mail queue, settings, server errors with what-to-do hints, and the audit trail of every status change."
        />
        <Health />
        <Settings />
        <Errors />
        <Audit />
        <ErrorCodes />
      </div>
    </AppShell>
  );
}

const gb = (b: number) => `${(b / 1e9).toFixed(1)} GB`;

function Health() {
  const h = useSWR("system-health", () => call(api.GET("/api/v1/admin/system-health")), { refreshInterval: 30_000 });
  const retry = useRun();
  const tone = { ok: "bg-primary-fixed text-primary", warning: "bg-tertiary-fixed text-on-accent", problem: "bg-error-container text-on-error-container" };
  return (
    <Card className="flex flex-col gap-3 p-5">
      <SectionTitle icon="monitor_heart" title="System Health" sub="Refreshes every 30 seconds.">
        <Button size="sm" variant="ghost" icon="refresh" onClick={() => h.mutate()}>
          Refresh
        </Button>
      </SectionTitle>
      <State data={h.data} error={h.error} retry={() => h.mutate()} rows={3}>
        {(d) => (
          <>
            <div className={cx("flex items-start gap-3 rounded-sm p-3", tone[d.status])}>
              <Icon name={d.status === "ok" ? "check_circle" : d.status === "warning" ? "warning" : "error"} className="text-[22px]" />
              <div>
                <p className="text-card font-bold capitalize">{d.status === "ok" ? "Everything is working" : d.status}</p>
                {d.problems.length ? (
                  <ul className="list-disc pl-4 text-body">
                    {d.problems.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-body">No problems detected.</p>
                )}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["database", "Database", d.database.ok ? `OK • ${d.database.latency_ms} ms` : "Down", d.database.ok],
                ["memory", "Worker", d.worker.alive ? `Alive${d.worker.busy_with ? ` • ${d.worker.busy_with}` : ""}` : "Not running", d.worker.alive],
                ["work_history", "Background jobs", `${d.jobs.queued} queued • ${d.jobs.failed} failed`, d.jobs.failed === 0],
                [
                  "mail",
                  "Email",
                  `${d.email.queued} queued • ${d.email.sent_24h} sent/24h • ${d.email.failed} failed${d.email.daily_cap ? ` • cap ${d.email.daily_cap}/day` : ""}`,
                  d.email.failed === 0,
                ],
                [
                  "backup",
                  "Last backup",
                  d.backup.last_status === "never" ? "Never run" : `${d.backup.last_status} • ${fmtDate(d.backup.last_ok_at, true)}`,
                  d.backup.last_status === "ok",
                ],
                [
                  "hard_drive",
                  "Disk",
                  `${gb(d.storage.free_bytes)} free of ${gb(d.storage.total_bytes)} • uploads ${gb(d.storage.uploads_bytes)}`,
                  d.storage.free_bytes / d.storage.total_bytes > 0.1,
                ],
              ].map(([icon, label, value, ok]) => (
                <div key={String(label)} className="flex gap-2 rounded-xs bg-surface-low p-3">
                  <Icon name={String(icon)} className={cx("text-[18px]", ok ? "text-primary" : "text-error")} />
                  <div>
                    <p className="text-caption font-semibold text-muted uppercase">{label}</p>
                    <p className="text-body font-semibold text-ink">{value}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                variant="soft"
                icon="forward_to_inbox"
                disabled={!d.email.failed}
                busy={retry.busy === "mail"}
                onClick={() =>
                  retry.run(
                    "mail",
                    async () => {
                      const r = await call(api.POST("/api/v1/admin/repairs/retry-failed-emails", { body: {} }));
                      h.mutate();
                      return r;
                    },
                    "Failed emails put back in the queue.",
                  )
                }
              >
                Retry Failed Emails ({d.email.failed})
              </Button>
              <span className="text-caption text-muted">{d.errors_24h} server errors in the last 24 h</span>
            </div>
            <Notice msg={retry.msg} />
          </>
        )}
      </State>
    </Card>
  );
}

function SettingRow({ s, reload }: { s: Setting; reload: () => void }) {
  const [val, setVal] = useState(JSON.stringify(s.value));
  const { busy, msg, run } = useRun();
  const parse = () => {
    try {
      return JSON.parse(val);
    } catch {
      return val; // plain text values (e.g. a domain) can be typed without quotes
    }
  };
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
        <div>
          <p className="text-body font-semibold text-ink">
            {s.label} {s.is_overridden && <Badge tone="warn">Changed</Badge>}
          </p>
          <p className="text-caption text-muted">
            {s.help} Default: <code>{JSON.stringify(s.default)}</code> {s.unit && `(${s.unit})`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Input value={val} onChange={(e) => setVal(e.target.value)} className="h-8 w-48 py-1 font-mono text-label" aria-label={s.label} />
          <Button
            size="sm"
            busy={busy === "save"}
            onClick={() =>
              run(
                "save",
                async () => (await call(api.PUT("/api/v1/admin/settings/{key}", { params: { path: { key: s.key } }, body: { value: parse() } })), reload()),
                "Saved (takes effect now).",
              )
            }
          >
            Save
          </Button>
          {s.is_overridden && (
            <Button
              size="sm"
              variant="ghost"
              busy={busy === "reset"}
              onClick={() =>
                run(
                  "reset",
                  async () => (
                    await call(api.DELETE("/api/v1/admin/settings/{key}", { params: { path: { key: s.key } } })),
                    setVal(JSON.stringify(s.default)),
                    reload()
                  ),
                  "Back to default.",
                )
              }
            >
              Reset
            </Button>
          )}
        </div>
      </div>
      <Notice msg={msg} />
    </li>
  );
}

function Settings() {
  const s = useSWR("admin/settings", () => call(api.GET("/api/v1/admin/settings")));
  return (
    <Card className="flex flex-col gap-1 p-5">
      <SectionTitle
        icon="tune"
        title="Settings"
        sub="Every change is audited. Secrets stay in the server’s .env file. Values are JSON: numbers as-is, text in quotes, null for “no cap”."
      />
      <State data={s.data} error={s.error} retry={() => s.mutate()} rows={4}>
        {(rows) => (
          <ul className="flex flex-col divide-y divide-surface">
            {rows.map((r) => (
              <SettingRow key={`${r.key}:${JSON.stringify(r.value)}`} s={r} reload={() => s.mutate()} />
            ))}
          </ul>
        )}
      </State>
    </Card>
  );
}

function Errors() {
  const [q, setQ] = useState("");
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const cursor = cursors.at(-1);
  const errs = useSWR(["admin/errors", q, cursor], () =>
    call(api.GET("/api/v1/admin/errors", { params: { query: { q: q || undefined, cursor, limit: 20 } } })),
  );
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Card className="flex flex-col gap-3 p-5">
      <SectionTitle icon="report" title="Error Log" sub="Server errors and failed background tasks (kept 90 days), each with what to do next.">
        <Input
          value={q}
          onChange={(e) => (setQ(e.target.value), setCursors([undefined]))}
          placeholder="Search…"
          className="h-8 w-48 py-1"
          aria-label="Search errors"
        />
      </SectionTitle>
      <State data={errs.data} error={errs.error} retry={() => errs.mutate()} rows={3}>
        {({ data, page }) =>
          !data.length ? (
            <Empty icon="verified" text="No errors recorded." />
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {data.map((e) => (
                  <li key={e.id} className="rounded-xs bg-surface-low p-3">
                    <button
                      onClick={() => setOpen(open === e.id ? null : e.id)}
                      className="flex w-full items-start justify-between gap-3 text-left cursor-pointer"
                    >
                      <span>
                        <span className="block text-body font-semibold text-ink">{e.summary}</span>
                        <span className="text-caption text-muted">
                          {e.method} {e.route} • {e.status} {e.code} • {fmtDate(e.created_at, true)}
                        </span>
                      </span>
                      <Icon name={open === e.id ? "expand_less" : "expand_more"} />
                    </button>
                    <p className="pt-1 text-body text-tertiary">
                      <b>What to do:</b> {e.hint}
                    </p>
                    {open === e.id && (
                      <pre className="mt-2 max-h-56 overflow-auto rounded-xs bg-white p-2 text-caption whitespace-pre-wrap">
                        request {e.request_id}
                        {e.user_id && ` • user ${e.user_id}`}
                        {"\n"}
                        {e.detail}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
              <Pager cursors={cursors} setCursors={setCursors} next={page.has_more ? (page.cursor ?? undefined) : null} />
            </>
          )
        }
      </State>
    </Card>
  );
}

function Pager({
  cursors,
  setCursors,
  next,
}: {
  cursors: (string | undefined)[];
  setCursors: (c: (string | undefined)[]) => void;
  next: string | undefined | null;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button size="sm" variant="ghost" disabled={cursors.length < 2} onClick={() => setCursors(cursors.slice(0, -1))}>
        Newer
      </Button>
      <Button size="sm" variant="ghost" disabled={next === null} onClick={() => setCursors([...cursors, next ?? undefined])}>
        Older
      </Button>
    </div>
  );
}

const ENTITIES = ["", "user", "application", "opportunity", "event", "event_registration", "student_standing", "student", "setting", "system"];

function Audit() {
  const [entity, setEntity] = useState("");
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const cursor = cursors.at(-1);
  const log = useSWR(["audit", entity, cursor], () =>
    call(api.GET("/api/v1/admin/audit-log", { params: { query: { entity: entity || undefined, cursor, limit: 25 } } })),
  );
  return (
    <Card className="flex flex-col gap-3 p-5">
      <SectionTitle icon="fact_check" title="Audit Log" sub="Append-only trail of every status change and admin action.">
        <Select value={entity} onChange={(e) => (setEntity(e.target.value), setCursors([undefined]))} className="h-8 w-48 py-1" aria-label="Entity filter">
          {ENTITIES.map((x) => (
            <option key={x} value={x}>
              {x ? x.replace("_", " ") : "All entities"}
            </option>
          ))}
        </Select>
      </SectionTitle>
      <div className="overflow-x-auto">
        <State data={log.data} error={log.error} retry={() => log.mutate()} rows={4}>
          {({ data, page }) =>
            !data.length ? (
              <Empty icon="fact_check" text="No audit entries." />
            ) : (
              <>
                <table className="w-full min-w-[640px] text-left text-body">
                  <thead className="bg-surface-low text-caption font-semibold tracking-[0.55px] text-muted uppercase">
                    <tr>
                      {["When", "Action", "Entity", "Actor"].map((h) => (
                        <th key={h} className="px-3 py-2">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((a) => (
                      <tr key={a.id} className="border-t border-surface">
                        <td className="px-3 py-2 whitespace-nowrap text-muted">{fmtDate(a.created_at, true)}</td>
                        <td className="px-3 py-2 font-semibold text-ink">{a.action}</td>
                        <td className="px-3 py-2 text-muted">
                          {a.entity} <code className="text-caption">{a.entity_id.slice(0, 8)}</code>
                        </td>
                        <td className="px-3 py-2 text-muted">
                          {a.actor_kind}
                          {a.actor_user_id && <code className="pl-1 text-caption">{a.actor_user_id.slice(0, 8)}</code>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="pt-3">
                  <Pager cursors={cursors} setCursors={setCursors} next={page.has_more ? (page.cursor ?? undefined) : null} />
                </div>
              </>
            )
          }
        </State>
      </div>
    </Card>
  );
}

function ErrorCodes() {
  const [open, setOpen] = useState(false);
  const codes = useSWR(open ? "error-codes" : null, () => call(api.GET("/api/v1/admin/error-codes")));
  return (
    <Card className="flex flex-col gap-3 p-5">
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between text-left cursor-pointer">
        <SectionTitle icon="menu_book" title="Error Code Reference" sub="Every code users can see, with the admin hint." />
        <Icon name={open ? "expand_less" : "expand_more"} />
      </button>
      {open && (
        <State data={codes.data} error={codes.error} retry={() => codes.mutate()} rows={4}>
          {(rows) => (
            <dl className="grid gap-2 sm:grid-cols-2">
              {rows.map((c) => (
                <div key={c.code} className="rounded-xs bg-surface-low p-3">
                  <dt className="text-label font-bold text-ink">
                    {c.code} <span className="font-normal text-muted">• {c.status}</span>
                  </dt>
                  <dd className="text-body text-muted">{c.message}</dd>
                  <dd className="text-caption text-tertiary">{c.hint}</dd>
                </div>
              ))}
            </dl>
          )}
        </State>
      )}
    </Card>
  );
}
