"use client";

import { useState } from "react";
import useSWR from "swr";
import { AppShell } from "@/components/AppShell";
import { Badge, Button, Card, Empty, Field, Input, Notice, PageHead, SectionTitle, Select, State, Textarea, cx, useRun } from "@/components/ui";
import { api, call, useSession } from "@/lib/api";
import { fmtDate, initialsOf } from "@/lib/format";
import { ADMIN_NAV } from "../nav";

export default function CommsPage() {
  return (
    <AppShell role="admin" nav={ADMIN_NAV} active="/admin/comms">
      <div className="mx-auto flex max-w-[976px] flex-col gap-5">
        <PageHead
          eyebrow="Communications Node"
          title="Notices & Messages"
          sub="Post noticeboard announcements and handle each company’s thread with the T&P cell."
        />
        <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <PostNotice />
          <NoticeHistory />
        </div>
        <Inbox />
        <FeedbackRequests />
      </div>
    </AppShell>
  );
}

function PostNotice() {
  const { busy, msg, run } = useRun();
  const board = useSWR("noticeboard");
  return (
    <Card className="flex flex-col gap-3 p-5">
      <SectionTitle icon="campaign" title="Post a Notice" sub="Shows on the portal noticeboard. Email copies drain slowly under the daily mail cap." />
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          run(
            "post",
            async () => {
              await call(
                api.POST("/api/v1/admin/notices", {
                  body: {
                    audience: fd.get("audience") as "students" | "companies" | "all",
                    title: String(fd.get("title")),
                    body: String(fd.get("body")),
                    email: fd.has("email"),
                  },
                }),
              );
              form.reset();
              board.mutate();
            },
            "Notice published.",
          );
        }}
      >
        <div className="grid grid-cols-[160px_1fr] gap-3">
          <Field label="Audience">
            <Select name="audience" defaultValue="students">
              <option value="students">Students</option>
              <option value="companies">Recruiters</option>
              <option value="all">Everyone</option>
            </Select>
          </Field>
          <Field label="Title *">
            <Input name="title" required maxLength={200} placeholder="Interview Protocol Alert" />
          </Field>
        </div>
        <Field label="Message *">
          <Textarea name="body" required rows={5} />
        </Field>
        <label className="flex items-center gap-2 text-body text-ink">
          <input type="checkbox" name="email" className="accent-primary" /> Also email the audience
        </label>
        <Notice msg={msg} />
        <Button type="submit" busy={busy === "post"} icon="send" className="self-end">
          Publish Notice
        </Button>
      </form>
    </Card>
  );
}

function NoticeHistory() {
  const board = useSWR("noticeboard", () => call(api.GET("/api/v1/noticeboard", { params: { query: { limit: 100 } } })));
  return (
    <Card className="flex flex-col gap-3 p-5">
      <SectionTitle icon="history" title="Noticeboard" sub="Most recent first." />
      <State data={board.data} error={board.error} retry={() => board.mutate()} empty={(d) => !d.data.length}>
        {({ data }) => (
          <ul className="flex max-h-[420px] flex-col gap-2 overflow-y-auto">
            {data.map((n) => (
              <li key={n.id} className="rounded-xs bg-surface-low p-3">
                <p className="flex items-start justify-between gap-2 text-body font-semibold text-ink">
                  {n.title}
                  <Badge tone="muted" className="shrink-0 capitalize">
                    {n.audience === "companies" ? "recruiters" : n.audience}
                  </Badge>
                </p>
                <p className="line-clamp-3 text-body whitespace-pre-line text-muted">{n.body}</p>
                <p className="pt-1 text-caption text-muted">{fmtDate(n.published_at, true)}</p>
              </li>
            ))}
          </ul>
        )}
      </State>
    </Card>
  );
}

function Inbox() {
  const companies = useSWR("admin/companies", () => call(api.GET("/api/v1/admin/companies", { params: { query: { limit: 100 } } })));
  const [pick, setPick] = useState<string | null>(null);
  const list = companies.data?.data ?? [];
  const co = list.find((c) => c.id === pick) ?? list[0];
  const thread = useSWR(co ? ["thread", co.id] : null, () =>
    call(api.GET("/api/v1/admin/companies/{id}/messages", { params: { path: { id: co!.id }, query: { limit: 100 } } })),
  );
  const { busy, msg, run } = useRun();
  const me = useSession()?.user.id;

  return (
    <Card className="grid overflow-hidden lg:grid-cols-[280px_1fr]">
      <div className="flex flex-col gap-1 bg-surface-low p-3">
        <p className="px-2 pb-1 text-caption font-semibold text-muted uppercase">Company threads</p>
        <State data={companies.data} error={companies.error} retry={() => companies.mutate()} empty={(d) => !d.data.length}>
          {() =>
            list.map((c) => (
              <button
                key={c.id}
                onClick={() => setPick(c.id)}
                className={cx(
                  "flex items-center gap-2 rounded-xs px-2 py-2 text-left cursor-pointer",
                  c.id === co?.id ? "bg-primary-container text-white" : "text-ink hover:bg-surface",
                )}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-xs bg-white text-caption font-bold text-primary">{initialsOf(c.name)}</span>
                <span className="min-w-0">
                  <span className="block truncate text-body font-semibold">{c.name}</span>
                  <span className={cx("text-caption uppercase", c.id === co?.id ? "text-surface-high" : "text-muted")}>{c.category}</span>
                </span>
              </button>
            ))
          }
        </State>
      </div>
      <div className="flex flex-col gap-3 p-5">
        {!co ? (
          <Empty icon="forum" text="No companies yet." />
        ) : (
          <>
            <SectionTitle
              icon="forum"
              title={co.name}
              sub={co.contacts.map((c) => `${c.name}${c.email ? ` <${c.email}>` : ""}`).join(", ") || "No contacts on file"}
            />
            <div className="flex max-h-[360px] flex-col gap-2 overflow-y-auto">
              <State data={thread.data} error={thread.error} retry={() => thread.mutate()} rows={3}>
                {({ data }) =>
                  !data.length ? (
                    <Empty icon="chat" text="No messages yet." />
                  ) : (
                    [...data].reverse().map((m) => {
                      const mine = m.from_user === me;
                      return (
                        <div key={m.id} className={cx("max-w-[85%] rounded-sm p-3", mine ? "self-end bg-primary-fixed" : "self-start bg-surface-low")}>
                          <p className="flex justify-between gap-2 text-label font-semibold text-ink">
                            {m.subject} <span className="text-caption font-normal text-muted">{fmtDate(m.created_at, true)}</span>
                          </p>
                          <p className="text-body whitespace-pre-line text-muted">{m.body}</p>
                        </div>
                      );
                    })
                  )
                }
              </State>
            </div>
            <form
              className="flex flex-col gap-2 border-t border-surface pt-3"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const fd = new FormData(form);
                run(
                  "send",
                  async () => {
                    await call(api.POST("/api/v1/messages", { body: { company_id: co.id, subject: String(fd.get("subject")), body: String(fd.get("body")) } }));
                    form.reset();
                    thread.mutate();
                  },
                  "Reply sent.",
                );
              }}
            >
              <Input name="subject" required maxLength={200} placeholder="Subject" aria-label="Reply subject" />
              <Textarea name="body" required rows={3} placeholder={`Reply to ${co.name}…`} aria-label="Reply message" />
              <Notice msg={msg} />
              <Button type="submit" busy={busy === "send"} icon="reply" className="self-end">
                Send Reply
              </Button>
            </form>
          </>
        )}
      </div>
    </Card>
  );
}

const DEFAULT_QUESTIONS = [
  { id: "overall", label: "Overall experience with the campus drive (1-5)", kind: "rating" as const },
  { id: "quality", label: "Candidate preparedness (1-5)", kind: "rating" as const },
  { id: "return", label: "Would you recruit from Tezpur University again?", kind: "yes_no" as const },
  { id: "notes", label: "Anything we should improve?", kind: "text" as const },
];

function FeedbackRequests() {
  const opps = useSWR("admin/opportunities", () => call(api.GET("/api/v1/admin/opportunities", { params: { query: { limit: 100 } } })));
  const [opp, setOpp] = useState("");
  const [view, setView] = useState<string | null>(null);
  const subs = useSWR(view ? ["feedback", view] : null, () => call(api.GET("/api/v1/admin/feedback/{id}", { params: { path: { id: view! } } })));
  const { busy, msg, run } = useRun();
  const drives = opps.data?.data.filter((o) => o.status === "approved" || o.status === "closed") ?? [];

  return (
    <Card className="flex flex-col gap-3 p-5">
      <SectionTitle
        icon="rate_review"
        title="Recruiter Feedback Forms"
        sub="Send a short feedback form to the recruiter of a drive. Their answers appear below."
      />
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Drive" className="min-w-64 flex-1">
          <Select value={opp} onChange={(e) => setOpp(e.target.value)}>
            <option value="">Select a drive</option>
            {drives.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          disabled={!opp}
          busy={busy === "req"}
          icon="send"
          onClick={() =>
            run(
              "req",
              async () => {
                const r = await call(
                  api.POST("/api/v1/admin/opportunities/{id}/feedback-request", { params: { path: { id: opp } }, body: { questions: DEFAULT_QUESTIONS } }),
                );
                setView(r.id);
              },
              "Feedback form sent to the recruiter.",
            )
          }
        >
          Send Feedback Form
        </Button>
      </div>
      <p className="text-caption text-muted">Questions: {DEFAULT_QUESTIONS.map((q) => q.label).join(" • ")}</p>
      <Notice msg={msg} />
      {view && (
        <Button size="sm" variant="ghost" icon="refresh" onClick={() => subs.mutate()} className="w-fit">
          Refresh answers
        </Button>
      )}
      {view && (
        <State data={subs.data} error={subs.error} retry={() => subs.mutate()} rows={2}>
          {(rows) =>
            !rows.length ? (
              <p className="text-body text-muted">No answers yet.</p>
            ) : (
              rows.map((r) => (
                <dl key={r.id} className="flex flex-col gap-1 rounded-xs bg-surface-low p-3 text-body">
                  <p className="text-caption text-muted">Submitted {fmtDate(r.created_at, true)}</p>
                  {Object.entries((r.answers ?? {}) as Record<string, unknown>).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3">
                      <dt className="text-muted">{DEFAULT_QUESTIONS.find((q) => q.id === k)?.label ?? k}</dt>
                      <dd className="font-semibold text-ink">{typeof v === "boolean" ? (v ? "Yes" : "No") : String(v)}</dd>
                    </div>
                  ))}
                </dl>
              ))
            )
          }
        </State>
      )}
    </Card>
  );
}
