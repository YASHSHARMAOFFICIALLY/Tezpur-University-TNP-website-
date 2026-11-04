"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { Badge, Button, Card, Field, Icon, Input, Select, State } from "@/components/ui";
import { api, call, fileBody, fileUrl, openFile } from "@/lib/api";
import { fmtDate, initialsOf } from "@/lib/format";
import { useProfile, type Profile, type Programme } from "./data";

export function NoticeBanner() {
  const { data, error } = useSWR("noticeboard", () => call(api.GET("/api/v1/noticeboard", { params: { query: { limit: 100 } } })));
  const [all, setAll] = useState(false);
  if (error || !data?.data.length) return null;
  const list = all ? data.data : data.data.slice(0, 1);
  return (
    <section id="notices" className="flex scroll-mt-24 flex-col gap-2 rounded-lg bg-accent/15 p-3 shadow-card">
      {list.map((n) => (
        <div key={n.id}>
          <p className="flex items-start gap-2 text-[14px] leading-5 text-primary">
            <Icon name="campaign" className="text-[20px] text-tertiary" />
            <span className="min-w-0 break-words">
              <strong className="font-semibold">{n.title}:</strong> {n.body}
            </span>
          </p>
          <p className="flex items-center gap-1 pl-7 text-label font-semibold text-tertiary">
            <Icon name="schedule" /> Posted {fmtDate(n.published_at, true)}
          </p>
        </div>
      ))}
      {data.data.length > 1 && (
        <button onClick={() => setAll(!all)} className="w-fit pl-7 text-label font-semibold text-primary underline cursor-pointer">
          {all ? "Show latest only" : `Show all ${data.data.length} notices`}
        </button>
      )}
    </section>
  );
}

function Photo({ id, name }: { id: string | null | undefined; name: string }) {
  const { data: src } = useSWR(id ? ["file", id] : null, () => fileUrl(id!));
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- blob: URL from an authenticated download
    <img src={src} alt={name} className="size-24 shrink-0 rounded-sm object-cover" />
  ) : (
    <div className="grid size-24 shrink-0 place-items-center rounded-sm bg-[#751515] font-display text-headline font-bold text-white">{initialsOf(name)}</div>
  );
}

export function ProfileCard() {
  const p = useProfile();
  const progs = useSWR("programmes", () => call(api.GET("/api/v1/programmes")));
  const [editing, setEditing] = useState(false);
  return (
    <Card className="scroll-mt-24 p-5">
      <span id="profile" />
      <State data={p.data} error={p.error} retry={() => p.mutate()} rows={4}>
        {(s) => {
          const prog = progs.data?.find((x) => x.id === s.programme_id);
          const details: [string, string | number | null | undefined][] = [
            ["CGPA", s.cgpa != null ? `${s.cgpa} / 10` : null],
            ["Batch", s.year_of_completion],
            ["Date of birth", s.dob ? fmtDate(s.dob) : null],
            ["Mobile", s.mobile],
            ["Class X / XII", s.marks_10 != null || s.marks_12 != null ? `${s.marks_10 ?? "—"}% / ${s.marks_12 ?? "—"}%` : null],
            ["JEE rank", s.jee_rank?.toLocaleString("en-IN")],
            ["Category", s.category],
            ["Skills", s.professional_interests],
          ];
          return (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 gap-4">
                  <Photo id={s.photo_file_id} name={s.user.name} />
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap gap-1">
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
                    <p className="text-body-lg text-muted">{prog?.name ?? s.department ?? "Programme not set"}</p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {s.resume_file_id ? (
                        <Button size="sm" variant="soft" icon="picture_as_pdf" onClick={() => openFile(s.resume_file_id!)}>
                          Resume
                        </Button>
                      ) : (
                        <Badge tone="error" icon="warning">
                          Resume not uploaded
                        </Badge>
                      )}
                      {s.linkedin_url && (
                        <a href={s.linkedin_url} target="_blank" rel="noreferrer" className="text-label font-semibold text-primary underline">
                          LinkedIn
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                <Button size="sm" icon="edit" onClick={() => setEditing(true)} disabled={s.user.status === "alumni"} className="w-fit shrink-0">
                  Edit Profile &amp; Documents
                </Button>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-surface pt-4 sm:grid-cols-4">
                {details.map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="text-caption font-semibold text-muted uppercase">{k}</dt>
                    <dd className="text-body font-semibold break-words text-ink">{v ?? "—"}</dd>
                  </div>
                ))}
              </dl>
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
            category: g("category") || undefined,
            regional_diversity: g("regional_diversity") || undefined,
            jee_rank: num("jee_rank"),
            marks_10: num("marks_10"),
            marks_12: num("marks_12"),
            current_address: g("current_address") || undefined,
            professional_interests: g("professional_interests") || undefined,
            linkedin_url: g("linkedin_url") || undefined,
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
          <Field label="Technical skills" hint="Comma separated; recruiters filter on these." className="sm:col-span-2">
            <Input name="professional_interests" defaultValue={s.professional_interests ?? ""} placeholder="Python, AWS Cloud, SQL" className={f} />
          </Field>
          <Field label="LinkedIn URL" className="sm:col-span-2">
            <Input name="linkedin_url" type="url" defaultValue={s.linkedin_url ?? ""} className={f} />
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
