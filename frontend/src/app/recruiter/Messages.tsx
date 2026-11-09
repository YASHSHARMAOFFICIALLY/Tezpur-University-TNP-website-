"use client";

import { useRef } from "react";
import useSWR from "swr";
import { Badge, Button, Card, Field, Input, Notice, SectionTitle, State, Textarea, cx, useRun } from "@/components/ui";
import { api, call, fileBody, useSession } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { FileButton } from "./FileButton";

/** The company's single thread with the T&P cell, with an optional PDF on each message. */
export function Messages() {
  const me = useSession()?.user.id;
  const thread = useSWR("messages", () => call(api.GET("/api/v1/messages", { params: { query: { limit: 20 } } })));
  const send = useRun();
  // A message whose PDF failed to attach: a retry attaches again instead of sending the text twice.
  const unattached = useRef<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const pdf = fd.get("attachment");
    const file = pdf instanceof File && pdf.size > 0 ? pdf : null;
    send.run(
      "send",
      async () => {
        const id =
          unattached.current ??
          (await call(api.POST("/api/v1/messages", { body: { subject: String(fd.get("subject")).trim(), body: String(fd.get("body")).trim() } }))).id;
        if (file) {
          unattached.current = id;
          await thread.mutate();
          await call(api.POST("/api/v1/messages/{id}/attachment", { params: { path: { id } }, ...fileBody(file) }));
        }
        unattached.current = null;
        form.reset();
        await thread.mutate();
      },
      file ? "Sent to the T&P cell with the PDF attached." : "Sent to the T&P cell.",
    );
  }

  return (
    <Card className="flex scroll-mt-24 flex-col gap-4 p-4 sm:p-5">
      <span id="messages" />
      <SectionTitle
        icon="forward_to_inbox"
        title="Messages with the T&P Cell"
        sub="Write to the placement cell about slots, rooms or results. Their replies show here and reach your inbox by email too."
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <form onSubmit={submit} className="flex flex-col gap-3" aria-label="New message">
          <Field label="Subject">
            <Input name="subject" required maxLength={200} className="bg-surface-low" placeholder="Interview slots for the technical round" />
          </Field>
          <Field label="Your message">
            <Textarea name="body" required rows={5} maxLength={20000} className="bg-surface-low" placeholder="Dear Placement Cell, …" />
          </Field>
          <Field label="ATTACHMENT (PDF, OPTIONAL)">
            <input
              name="attachment"
              type="file"
              accept="application/pdf"
              className="text-body text-ink file:mr-2 file:cursor-pointer file:rounded-xs file:border-0 file:bg-surface-high file:px-2 file:py-1 file:text-caption file:font-semibold file:text-ink"
            />
          </Field>
          <Notice msg={send.msg} />
          <div className="flex justify-end">
            <Button type="submit" busy={send.busy === "send"} icon="send">
              Send message
            </Button>
          </div>
        </form>
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-caption font-semibold text-muted uppercase">Recent thread</p>
          <State data={thread.data} error={thread.error} retry={() => thread.mutate()} rows={3}>
            {({ data }) =>
              data.length ? (
                <ul className="flex max-h-[420px] flex-col gap-2 overflow-y-auto">
                  {data.map((m) => {
                    const mine = m.from_user === me;
                    return (
                      <li key={m.id} className={cx("flex flex-col gap-1 rounded-xs p-2.5", mine ? "bg-surface-low" : "bg-primary-fixed")}>
                        <p className="flex flex-wrap items-center justify-between gap-1 text-caption text-muted">
                          <Badge tone={mine ? "soft" : "info"}>{mine ? "You" : "T&P cell"}</Badge>
                          {fmtDate(m.created_at, true)}
                        </p>
                        <p className="text-label font-semibold break-words text-ink">{m.subject}</p>
                        <p className="line-clamp-4 text-body break-words whitespace-pre-line text-muted">{m.body}</p>
                        {m.file_id && (
                          <FileButton id={m.file_id} label={`Attachment: ${m.subject}`} className="w-fit">
                            Attachment
                          </FileButton>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="rounded-xs bg-surface-low px-3 py-6 text-center text-body text-muted">No messages yet. Your first message starts the thread.</p>
              )
            }
          </State>
        </div>
      </div>
    </Card>
  );
}
