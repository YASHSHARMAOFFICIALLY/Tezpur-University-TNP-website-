"use client";

import { useState } from "react";
import useSWR from "swr";
import { Badge, Button, Card, Icon, Notice, SectionTitle, State, useRun } from "@/components/ui";
import { api, call } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { Rate } from "./applications";
import { useFeedback, useMyEvents, type Ev } from "./data";

export function Training() {
  const events = useSWR("events", () => call(api.GET("/api/v1/events", { params: { query: { limit: 100 } } })));
  return (
    <Card className="flex scroll-mt-24 flex-col gap-4 p-5">
      <span id="training" />
      <SectionTitle icon="lightbulb" title="Training & workshops" sub="Register while registration is open. Rate a session once it has started." />
      <State data={events.data} error={events.error} retry={() => events.mutate()} empty={(d) => d.data.length === 0}>
        {(d) => (
          <div className="flex flex-col gap-3">
            {d.data.map((e) => (
              <EventCard key={e.id} e={e} />
            ))}
          </div>
        )}
      </State>
    </Card>
  );
}

function EventCard({ e }: { e: Ev }) {
  const mine = useMyEvents();
  const fb = useFeedback();
  const { busy, msg, run } = useRun();
  const reg = mine.data?.data.find((r) => r.event.id === e.id && r.status !== "cancelled");
  const [now] = useState(Date.now);
  const open = now >= +new Date(e.registration_opens_at) && now < +new Date(e.registration_closes_at);
  const started = now >= +new Date(e.starts_at);
  const act = (kind: "register" | "cancel-registration") =>
    run(kind, async () => {
      if (kind === "register") await call(api.POST("/api/v1/events/{id}/register", { params: { path: { id: e.id } } }));
      else await call(api.POST("/api/v1/events/{id}/cancel-registration", { params: { path: { id: e.id } } }));
      await mine.mutate();
    });

  return (
    <article aria-label={e.name} className="flex flex-col gap-3 rounded-sm bg-surface-low p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-xs bg-white text-primary">
            <Icon name="co_present" className="text-[22px]" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="font-display text-title font-semibold text-primary">{e.name}</h3>
            <Badge className="w-fit capitalize">{e.type.replace("_", " ")}</Badge>
            {(e.topic || e.resource_person) && <p className="text-body text-muted">{[e.topic, e.resource_person].filter(Boolean).join(" • ")}</p>}
            <p className="text-label font-semibold text-ink">
              {fmtDate(e.starts_at, true)} • {e.venue ?? "Venue to be announced"} • {e.chargeable ? `₹${e.fee ?? 0} fee` : "Free"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
          {reg && (
            <Badge tone="info" className="capitalize">
              {reg.status}
            </Badge>
          )}
          {reg && open ? (
            <Button variant="ghost" busy={busy === "cancel-registration"} onClick={() => act("cancel-registration")}>
              Cancel Registration
            </Button>
          ) : !reg ? (
            <Button variant="tertiary" busy={busy === "register"} disabled={!open} onClick={() => act("register")}>
              {open ? "Register" : "Registration closed"}
            </Button>
          ) : null}
          {open && <span className="text-caption text-muted">Closes {fmtDate(e.registration_closes_at, true)}</span>}
        </div>
      </div>
      <Notice msg={msg} />
      {reg && started && fb.data && (
        <Rate target="event" id={e.id} given={fb.data.find((f) => f.target === "event" && f.target_id === e.id) ?? null} label="Rate this session" />
      )}
    </article>
  );
}
