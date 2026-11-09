"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { Badge, Button, Card, Field, Icon, Input, Select, State, cx } from "@/components/ui";
import { api, call, fileBody, fileUrl, openFile } from "@/lib/api";
import { fmtDate, initialsOf } from "@/lib/format";
import { useProfile, type Profile, type Programme } from "./data";

function Photo({ id, name }: { id: string | null | undefined; name: string }) {
  const { data: src } = useSWR(id ? ["file", id] : null, () => fileUrl(id!));
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- blob: URL from an authenticated download
    <img src={src} alt={name} className="size-28 shrink-0 rounded-lg object-cover" />
  ) : (
    <div className="grid size-28 shrink-0 place-items-center rounded-lg bg-primary-container font-display text-headline font-bold text-white">
      {initialsOf(name)}
    </div>
  );
}

/** What PROFILE_INCOMPLETE checks before applying; the strength meter shows the same list. */
export const REQUIRED: { key: keyof Profile; label: string; action: string }[] = [
  { key: "photo_file_id", label: "Photo", action: "Add a coloured photo" },
  { key: "resume_file_id", label: "Resume", action: "Upload your resume" },
  { key: "cgpa", label: "CGPA", action: "Enter your CGPA" },
  { key: "programme_id", label: "Programme", action: "Choose your programme" },
  { key: "year_of_completion", label: "Batch", action: "Enter your batch year" },
  { key: "dob", label: "Date of birth", action: "Enter your date of birth" },
];

const list = (v: string | null | undefined) =>
  (v ?? "")
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

function Strength({ s, onEdit }: { s: Profile; onEdit: () => void }) {
  const missing = REQUIRED.filter((r) => s[r.key] == null);
  const done = REQUIRED.length - missing.length;
  return (
    <section aria-label="Profile strength" className="flex flex-col gap-3 rounded-lg bg-surface-low p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-card font-semibold text-primary">
          {missing.length ? "Finish your profile to apply" : "Your profile is ready to apply"}
        </h2>
        <p className="text-label font-semibold text-muted tabular-nums">
          {done} of {REQUIRED.length}
        </p>
      </div>
      <div className="flex gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={REQUIRED.length} aria-valuenow={done} aria-label="Profile completion">
        {REQUIRED.map((r) => (
          <span key={r.key} className={cx("h-1.5 flex-1 rounded-full", s[r.key] != null ? "bg-primary" : "bg-outline-variant")} />
        ))}
      </div>
      {missing.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {missing.map((r) => (
            <li key={r.key}>
              <button
                type="button"
                onClick={onEdit}
                className="min-h-9 cursor-pointer rounded-xs bg-white px-3 text-label font-semibold text-primary shadow-card transition-colors hover:bg-surface-high focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {r.action}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body text-muted">Photo, resume, CGPA, programme, batch and date of birth are all in. Recruiters see exactly what you see here.</p>
      )}
    </section>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((x) => (
        <li key={x} className="rounded-xs bg-surface-high px-2.5 py-1 text-label font-semibold text-ink">
          {x}
        </li>
      ))}
    </ul>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-label font-semibold text-muted">{title}</h3>
      {children}
    </section>
  );
}

export function ProfileCard({ onEdit }: { onEdit?: () => void } = {}) {
  const p = useProfile();
  const progs = useSWR("programmes", () => call(api.GET("/api/v1/programmes")));
  const [editing, setEditing] = useState(false);
  return (
    <Card className="scroll-mt-24 p-0">
      <span id="profile" />
      <State data={p.data} error={p.error} retry={() => p.mutate()} rows={4}>
        {(s) => {
          const prog = progs.data?.find((x) => x.id === s.programme_id);
          const skills = list(s.technical_skills ?? s.professional_interests);
          const facts: [string, string | number | null | undefined][] = [
            ["CGPA", s.cgpa != null ? `${s.cgpa.toFixed(2)} / 10` : null],
            ["Batch", s.year_of_completion],
            ["Backlogs", s.active_backlogs != null || s.cleared_backlogs != null ? `${s.active_backlogs ?? "—"} active • ${s.cleared_backlogs ?? "—"} cleared` : null],
            ["Specialization", s.specialization],
            ["JEE rank", s.jee_rank?.toLocaleString("en-IN")],
            ["Class X / XII", s.marks_10 != null || s.marks_12 != null ? `${s.marks_10 ?? "—"}% / ${s.marks_12 ?? "—"}%` : null],
            ["Date of birth", s.dob ? fmtDate(s.dob) : null],
            ["Mobile", s.mobile],
            ["Category", s.category],
          ];
          const edit = () => (onEdit ? onEdit() : setEditing(true));
          return (
            <div className="flex flex-col">
              <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start">
                <Photo id={s.photo_file_id} name={s.user.name} />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="soft" className="uppercase">
                      {s.enrolment_no}
                    </Badge>
                    {s.academic_standing === "probation" && (
                      <Badge tone="error" icon="block">
                        Academic probation
                      </Badge>
                    )}
                    {s.user.status === "alumni" && <Badge tone="warn">Alumnus • read only</Badge>}
                  </div>
                  <h1 className="font-display text-headline font-bold break-words text-primary">{s.user.name}</h1>
                  <p className="text-body-lg text-muted">
                    {prog?.name ?? s.department ?? "Programme not set"}
                    {s.year_of_completion ? ` · Batch of ${s.year_of_completion}` : ""}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
                    {s.resume_file_id && (
                      <Button size="sm" variant="soft" icon="picture_as_pdf" onClick={() => openFile(s.resume_file_id!)}>
                        View resume
                      </Button>
                    )}
                    {s.linkedin_url && (
                      <a href={s.linkedin_url} target="_blank" rel="noreferrer" className="text-label font-semibold text-primary underline">
                        LinkedIn
                      </a>
                    )}
                    {s.portfolio_url && (
                      <a href={s.portfolio_url} target="_blank" rel="noreferrer" className="text-label font-semibold text-primary underline">
                        GitHub / portfolio
                      </a>
                    )}
                  </div>
                </div>
                <Button size="sm" icon="edit" onClick={edit} disabled={s.user.status === "alumni"} className="w-fit shrink-0">
                  Edit profile
                </Button>
              </div>

              <div className="flex flex-col gap-6 border-t border-surface p-5">
                {s.user.status !== "alumni" && <Strength s={s} onEdit={edit} />}

                <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                  <div className="flex flex-col gap-6">
                    <Block title="About me">
                      {s.about_me ? (
                        <p className="max-w-[68ch] text-body-lg whitespace-pre-line text-ink">{s.about_me}</p>
                      ) : (
                        <p className="text-body text-muted">Two or three lines on what you study and what you want to do. Recruiters read this first.</p>
                      )}
                    </Block>
                    <Block title="Technical skills">
                      {skills.length ? <Chips items={skills} /> : <p className="text-body text-muted">No skills added yet.</p>}
                    </Block>
                    {list(s.career_interests).length > 0 && (
                      <Block title="Roles I am looking for">
                        <Chips items={list(s.career_interests)} />
                      </Block>
                    )}
                    {s.extracurriculars && (
                      <Block title="Beyond the classroom">
                        <p className="max-w-[68ch] text-body whitespace-pre-line text-ink">{s.extracurriculars}</p>
                      </Block>
                    )}
                    {s.certifications && (
                      <Block title="Achievements">
                        <p className="max-w-[68ch] text-body whitespace-pre-line text-ink">{s.certifications}</p>
                      </Block>
                    )}
                  </div>
                  <dl className="grid h-fit grid-cols-2 gap-x-4 gap-y-4 rounded-lg border border-surface p-4">
                    {facts.map(([k, v]) => (
                      <div key={k} className="min-w-0">
                        <dt className="text-caption font-semibold text-muted">{k}</dt>
                        <dd className="text-body font-semibold break-words text-ink tabular-nums">{v ?? "—"}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
              {editing && <EditProfile s={s} programmes={progs.data ?? []} onClose={() => (setEditing(false), p.mutate())} />}
            </div>
          );
        }}
      </State>
    </Card>
  );
}

/** Photo, resume, CGPA, DOB, programme and batch are what PROFILE_INCOMPLETE checks before applying. */
function EditProfile({ s, programmes, onClose }: { s: Profile; programmes: Programme[]; onClose: () => void }) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const g = (k: string) => String(fd.get(k) ?? "").trim();
    const num = (k: string) => (g(k) ? Number(g(k)) : undefined);
    setBusy(true);
    setErr("");
    try {
      const photo = fd.get("photo") as File;
      const resume = fd.get("resume") as File;
      if (photo?.size) await call(api.POST("/api/v1/students/me/photo", fileBody(photo)));
      if (resume?.size) await call(api.POST("/api/v1/students/me/resume", fileBody(resume)));
      await call(
        api.PATCH("/api/v1/students/me", {
          body: {
            mobile: g("mobile") || undefined,
            dob: g("dob") || undefined,
            programme_id: g("programme_id") || undefined,
            year_of_admission: num("year_of_admission"),
            year_of_completion: num("year_of_completion"),
            cgpa: num("cgpa"),
            active_backlogs: num("active_backlogs"),
            cleared_backlogs: num("cleared_backlogs"),
            category: g("category") || undefined,
            regional_diversity: g("regional_diversity") || undefined,
            jee_rank: num("jee_rank"),
            marks_10: num("marks_10"),
            marks_12: num("marks_12"),
            current_address: g("current_address") || undefined,
            gender: g("gender") || undefined,
            specialization: g("specialization") || undefined,
            technical_skills: g("technical_skills") || undefined,
            professional_interests: g("professional_interests") || undefined,
            career_interests: g("career_interests") || undefined,
            about_me: g("about_me") || undefined,
            extracurriculars: g("extracurriculars") || undefined,
            linkedin_url: g("linkedin_url") || undefined,
            portfolio_url: g("portfolio_url") || undefined,
          },
        }),
      );
      // Eligibility for each posting comes with /opportunities, so it must refetch too or Apply stays hidden.
      void mutate("opportunities");
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  const f = "bg-surface-low shadow-none";
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-primary/30" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal
        aria-label="Edit profile"
        className="flex h-full w-full max-w-[544px] flex-col bg-white text-left shadow-pop"
      >
        <div className="flex items-start justify-between bg-primary px-5 py-5 text-white">
          <div>
            <h2 className="font-display text-title font-semibold">Edit profile &amp; documents</h2>
            <p className="text-caption font-semibold text-surface-high">Photo, resume, CGPA, DOB, programme and batch are required before applying.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="cursor-pointer">
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>
        <div className="grid flex-1 content-start gap-3 overflow-y-auto p-5 sm:grid-cols-2">
          <Field label="Coloured Photo (JPEG/PNG, ≤2 MB)" hint={s.photo_file_id ? "Uploaded. Choose a file to replace." : "Required"}>
            <Input name="photo" type="file" accept="image/jpeg,image/png" className="py-1.5" />
          </Field>
          <Field label="Resume (PDF, ≤5 MB)" hint={s.resume_file_id ? "Uploaded. Choose a file to replace." : "Required"}>
            <Input name="resume" type="file" accept="application/pdf" className="py-1.5" />
          </Field>
          <Field label="Date of Birth *">
            <Input name="dob" type="date" required defaultValue={s.dob?.slice(0, 10)} className={f} />
          </Field>
          <Field label="Cumulative CGPA *">
            <Input name="cgpa" type="number" step="0.01" min="0" max="10" required defaultValue={s.cgpa ?? ""} className={f} />
          </Field>
          <Field label="Programme *" className="sm:col-span-2">
            <Select name="programme_id" required defaultValue={s.programme_id ?? ""} className={f}>
              <option value="">Select programme</option>
              {programmes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Year of admission">
            <Input name="year_of_admission" type="number" min="2000" max="2100" defaultValue={s.year_of_admission ?? ""} className={f} />
          </Field>
          <Field label="Year of Completion *">
            <Input name="year_of_completion" type="number" min="2000" max="2100" required defaultValue={s.year_of_completion ?? ""} className={f} />
          </Field>
          <Field label="Mobile">
            <Input name="mobile" type="tel" pattern="\+?\d{10,13}" defaultValue={s.mobile ?? ""} className={f} />
          </Field>
          <Field label="Active backlogs" hint="Papers not yet cleared. Enter 0 if none.">
            <Input name="active_backlogs" type="number" min="0" max="99" defaultValue={s.active_backlogs ?? ""} className={f} />
          </Field>
          <Field label="Cleared backlogs" hint="Backlogs you have since cleared. Enter 0 if none.">
            <Input name="cleared_backlogs" type="number" min="0" max="99" defaultValue={s.cleared_backlogs ?? ""} className={f} />
          </Field>
          <Field label="Social category">
            <Input name="category" defaultValue={s.category ?? ""} className={f} />
          </Field>
          <Field label="Domicile & diversity">
            <Input name="regional_diversity" defaultValue={s.regional_diversity ?? ""} className={f} />
          </Field>
          <Field label="JEE rank">
            <Input name="jee_rank" type="number" min="1" defaultValue={s.jee_rank ?? ""} className={f} />
          </Field>
          <Field label="Class X %">
            <Input name="marks_10" type="number" step="0.1" min="0" max="100" defaultValue={s.marks_10 ?? ""} className={f} />
          </Field>
          <Field label="Class XII %">
            <Input name="marks_12" type="number" step="0.1" min="0" max="100" defaultValue={s.marks_12 ?? ""} className={f} />
          </Field>
          <Field label="Current address" className="sm:col-span-2">
            <Input name="current_address" defaultValue={s.current_address ?? ""} className={f} />
          </Field>
          <Field label="Gender">
            <Select name="gender" defaultValue={s.gender ?? ""} className={f}>
              <option value="">Prefer not to say</option>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
              <option value="Other">Other</option>
            </Select>
          </Field>
          <Field label="Specialization">
            <Input name="specialization" defaultValue={s.specialization ?? ""} className={f} />
          </Field>
          <Field label="About me" hint="Two or three lines; recruiters read this first." className="sm:col-span-2">
            <textarea name="about_me" rows={4} maxLength={5000} defaultValue={s.about_me ?? ""} className={cx("w-full rounded-xs px-3 py-2 text-body", f)} />
          </Field>
          <Field label="Technical skills" hint="Comma separated; recruiters filter on these." className="sm:col-span-2">
            <Input
              name="technical_skills"
              defaultValue={s.technical_skills ?? s.professional_interests ?? ""}
              placeholder="Python, AWS Cloud, SQL"
              className={f}
            />
          </Field>
          <Field label="Professional interests">
            <Input name="professional_interests" defaultValue={s.professional_interests ?? ""} className={f} />
          </Field>
          <Field label="Roles I am looking for">
            <Input name="career_interests" defaultValue={s.career_interests ?? ""} placeholder="R&D, Software engineer" className={f} />
          </Field>
          <Field label="Beyond the classroom" hint="Clubs, sports, committees." className="sm:col-span-2">
            <Input name="extracurriculars" defaultValue={s.extracurriculars ?? ""} className={f} />
          </Field>
          <Field label="LinkedIn URL">
            <Input name="linkedin_url" type="url" defaultValue={s.linkedin_url ?? ""} className={f} />
          </Field>
          <Field label="GitHub / portfolio URL">
            <Input name="portfolio_url" type="url" defaultValue={s.portfolio_url ?? ""} className={f} />
          </Field>
          {err && (
            <p role="alert" className="rounded-xs bg-error-container px-3 py-2 text-body text-on-error-container sm:col-span-2">
              {err}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 bg-surface-low px-5 py-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            Save Profile
          </Button>
        </div>
      </form>
    </div>
  );
}
