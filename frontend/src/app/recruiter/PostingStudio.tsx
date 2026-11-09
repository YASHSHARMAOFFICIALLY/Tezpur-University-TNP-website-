"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import { Button, Field, Icon, Input, Select, Textarea } from "@/components/ui";
import { api, call, fileBody } from "@/lib/api";
import { ymd } from "@/lib/format";
import { FileButton } from "./FileButton";
import { DRIVE_MODE, ROUNDS, ROUND_LABEL, type DriveMode, type Posting } from "./model";

const DEFAULT_ROUNDS = new Set(["shortlist_from_resumes", "online_test"]);

/** Create a posting, or (with `initial`) edit a draft / returned posting, then (re)submit it for T&P approval. */
export function PostingStudio({ onClose, onDone, initial }: { onClose: () => void; onDone: () => void; initial?: Posting }) {
  const progs = useSWR("programmes", () => call(api.GET("/api/v1/programmes")));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [hiringFrom, setHiringFrom] = useState(initial?.hiring_from ?? "");
  const year = new Date().getFullYear();
  // The draft survives a failed step, so a retry updates it instead of creating a duplicate posting.
  const draft = useRef(initial?.id);
  // Edit keeps what the form can't show (several batches, the exact deadline time) unless the recruiter changes that field.
  const batches = initial?.eligibility.completion_years?.join(",");
  const initialDay = initial && ymd(new Date(initial.apply_deadline));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const g = (k: string) => String(fd.get(k) ?? "").trim();
    const opt = (k: string) => g(k) || undefined;
    const programmes = fd.getAll("programmes").map(String);
    if (!programmes.length) return setErr("Pick at least one eligible programme.");
    if (g("hiring_to") && !g("hiring_from")) return setErr("Set the month hiring starts before the month it ends.");
    const jd = fd.get("jd");
    const jdFile = jd instanceof File && jd.size > 0 ? jd : null;
    const ctc = initial
      ? g("ctc_text")
      : [g("base") && `₹${g("base")} LPA base`, g("variable") && `₹${g("variable")} LPA variable`, g("benefits")].filter(Boolean).join(" + ");
    setBusy(true);
    setErr("");
    try {
      const body = {
        type: g("type") as Posting["type"],
        title: g("title"),
        designation: opt("designation"),
        location: opt("location"),
        description: g("description"),
        expected_hires: g("hires") ? Number(g("hires")) : undefined,
        ctc_benefits: ctc || undefined,
        bond_details: opt("bond"),
        // A date-only string parses as UTC midnight; the deadline is the end of that day in the recruiter's time zone.
        apply_deadline: g("deadline") === initialDay ? initial!.apply_deadline : new Date(`${g("deadline")}T23:59:59`).toISOString(),
        eligibility: {
          ...initial?.eligibility,
          min_cgpa: Number(g("min_cgpa") || 0),
          programmes,
          completion_years: g("batch").split(",").map(Number),
        },
        selection_process: Object.fromEntries(ROUNDS.map((k) => [k, fd.has(k)])) as Posting["selection_process"],
        drive_mode: opt("drive_mode") as DriveMode | undefined,
        hiring_from: opt("hiring_from"),
        hiring_to: opt("hiring_to"),
        venue: opt("venue"),
        logistics: opt("logistics"),
      };
      // On edit an emptied drive detail is sent as null, which clears it; undefined would keep the old value.
      const cleared = Object.fromEntries((["drive_mode", "hiring_from", "hiring_to", "venue", "logistics"] as const).map((k) => [k, body[k] ?? null]));
      if (draft.current)
        await call(api.PATCH("/api/v1/company/opportunities/{id}", { params: { path: { id: draft.current } }, body: { ...body, ...cleared } }));
      else draft.current = (await call(api.POST("/api/v1/company/opportunities", { body }))).id;
      if (jdFile) await call(api.POST("/api/v1/company/opportunities/{id}/jd", { params: { path: { id: draft.current } }, ...fileBody(jdFile) }));
      await call(api.POST("/api/v1/company/opportunities/{id}/submit", { params: { path: { id: draft.current } } }));
      onDone();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  const label = "text-caption font-semibold text-muted";
  const box = "flex flex-col gap-3 rounded-xs bg-surface-low p-3";
  const flat = "bg-surface-low shadow-none";
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-primary/30" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal
        aria-label={initial ? "Edit posting" : "Job & Internship Posting Studio"}
        className="flex h-full w-full max-w-[544px] flex-col bg-white shadow-pop"
      >
        <div className="flex items-start justify-between gap-3 bg-primary px-5 py-5 text-white">
          <div className="flex gap-3">
            <Icon name="post_add" className="text-[22px]" />
            <div>
              <h2 className="font-display text-title font-semibold">{initial ? "Edit & Resubmit Posting" : "Job & Internship Posting Studio"}</h2>
              <p className="text-caption font-semibold text-surface-high">The T&amp;P cell reviews every posting before students see it.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-xs focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
            <Field label="ROLE PROFILE / JOB TITLE *">
              <Input name="title" required minLength={3} defaultValue={initial?.title} className={flat} placeholder="Software Development Engineer - Cloud" />
            </Field>
            <Field label="TYPE *">
              <Select name="type" defaultValue={initial?.type} className={flat}>
                <option value="job">Full-time Job</option>
                <option value="internship">Internship</option>
                <option value="competition">Competition</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="TENTATIVE WORK LOCATION *">
              <Input name="location" required defaultValue={initial?.location ?? ""} className={flat} placeholder="Bangalore / Pune / Remote" />
            </Field>
            <Field label="DESIGNATION">
              <Input name="designation" defaultValue={initial?.designation ?? ""} className={flat} placeholder="Software Engineer" />
            </Field>
          </div>
          <Field label="JOB DESCRIPTION *">
            <Textarea name="description" required minLength={10} rows={3} defaultValue={initial?.description} className={flat} />
          </Field>
          <Field
            label={initial?.jd_file_id ? "REPLACE JD PDF" : "JOB DESCRIPTION PDF"}
            hint={initial?.jd_file_id ? "Leave empty to keep the current JD." : "Optional. Students can open it from the posting."}
          >
            <input
              name="jd"
              type="file"
              accept="application/pdf"
              className="text-body text-ink file:mr-2 file:cursor-pointer file:rounded-xs file:border-0 file:bg-surface-high file:px-2 file:py-1 file:text-caption file:font-semibold file:text-ink"
            />
          </Field>
          {initial?.jd_file_id && <FileButton id={initial.jd_file_id}>View current JD</FileButton>}

          <fieldset className={box}>
            <legend className="sr-only">Compensation</legend>
            <p className="text-label font-bold text-ink">Compensation &amp; Benefits</p>
            {initial ? (
              <Field label="CTC & Benefits">
                <Input name="ctc_text" defaultValue={initial.ctc_benefits ?? ""} />
              </Field>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Base Compensation (INR LPA)">
                    <Input name="base" type="number" step="0.1" min="0" placeholder="10.5" />
                  </Field>
                  <Field label="Variable / Performance Bonus">
                    <Input name="variable" type="number" step="0.1" min="0" placeholder="1.5" />
                  </Field>
                </div>
                <Field label="Other benefits">
                  <Input name="benefits" maxLength={500} placeholder="Health insurance, relocation allowance…" />
                </Field>
              </>
            )}
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <Field label="BOND / SERVICE AGREEMENT">
              <Input name="bond" className={flat} defaultValue={initial?.bond_details ?? ""} placeholder="None" />
            </Field>
            <Field label="EXPECTED HIRES">
              <Input name="hires" type="number" min="1" defaultValue={initial?.expected_hires ?? ""} className={flat} placeholder="25" />
            </Field>
          </div>

          <fieldset className={box}>
            <p className="text-label font-bold text-ink">Academic Eligibility</p>
            <p className={label}>Degrees Permitted to Apply *</p>
            <div className="flex flex-wrap gap-2">
              {progs.data?.map((p) => (
                <label key={p.id} className="flex items-center gap-1 rounded-xs bg-white px-2 py-1 text-label text-ink">
                  <input
                    type="checkbox"
                    name="programmes"
                    value={p.id}
                    defaultChecked={initial?.eligibility.programmes?.includes(p.id)}
                    className="accent-primary"
                  />{" "}
                  {p.name}
                </label>
              )) ?? <span className="text-body text-muted">Loading programmes…</span>}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Minimum Cutoff CGPA">
                <Input name="min_cgpa" type="number" step="0.1" min="0" max="10" defaultValue={initial?.eligibility.min_cgpa ?? 7.5} />
              </Field>
              <Field label="Passing-out Batch *">
                <Select name="batch" defaultValue={batches ?? year}>
                  {[...new Set([batches, year, year + 1, year + 2].filter(Boolean).map(String))].map((y) => (
                    <option key={y} value={y}>
                      {y.split(",").join(", ")}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Apply Deadline *">
                <Input name="deadline" type="date" required min={ymd(new Date())} defaultValue={initialDay} />
              </Field>
            </div>
          </fieldset>

          <fieldset className={box}>
            <p className="text-label font-bold text-ink">Recruitment Rounds &amp; Timing</p>
            <div className="grid grid-cols-2 gap-2">
              {ROUNDS.map((k) => (
                <label key={k} className="flex items-center gap-2 text-body text-ink">
                  <input
                    type="checkbox"
                    name={k}
                    defaultChecked={initial ? initial.selection_process[k] : DEFAULT_ROUNDS.has(k)}
                    className="size-4 accent-primary"
                  />{" "}
                  {ROUND_LABEL[k]}
                </label>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Drive mode">
                <Select name="drive_mode" defaultValue={initial?.drive_mode ?? ""}>
                  <option value="">Not decided yet</option>
                  {(Object.keys(DRIVE_MODE) as DriveMode[]).map((m) => (
                    <option key={m} value={m}>
                      {DRIVE_MODE[m]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Hiring from">
                <Input name="hiring_from" type="month" value={hiringFrom} onChange={(e) => setHiringFrom(e.target.value)} />
              </Field>
              <Field label="Hiring until (optional)">
                <Input name="hiring_to" type="month" min={hiringFrom || undefined} defaultValue={initial?.hiring_to ?? ""} />
              </Field>
            </div>
            <p className="text-caption text-muted">The probable hiring period students see on the posting. Leave “until” empty for a single month.</p>
          </fieldset>

          <fieldset className={box}>
            <p className="text-label font-bold text-ink">Campus Logistics</p>
            <p className="text-caption text-muted">
              Only students who apply to this posting see these. You can change them later from the Drive Desk; applicants get an email then.
            </p>
            <Field label="Venue">
              <Input name="venue" maxLength={300} defaultValue={initial?.venue ?? ""} placeholder="Computer Centre Lab 2" />
            </Field>
            <Field label="Logistics notes">
              <Textarea name="logistics" rows={3} maxLength={5000} defaultValue={initial?.logistics ?? ""} placeholder="Reporting time, documents to bring…" />
            </Field>
          </fieldset>
          {err && (
            <p role="alert" className="rounded-xs bg-error-container px-3 py-2 text-body text-on-error-container">
              {err}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 bg-surface-low px-5 py-3">
          <span className="mr-auto text-caption text-muted">Goes to the T&amp;P cell for approval first.</span>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            {initial ? "Save & Resubmit for Approval" : "Publish Opening to Students"}
          </Button>
        </div>
      </form>
    </div>
  );
}
