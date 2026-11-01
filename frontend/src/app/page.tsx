"use client";

import Image from "next/image";
import Link from "next/link";
import useSWR from "swr";
import { PublicShell } from "@/components/PublicShell";
import { RegistrationDesk } from "@/components/RegistrationDesk";
import { Empty, Eyebrow, Icon, State } from "@/components/ui";
import { api, call, openFile, useSession } from "@/lib/api";

// Copy for each school card, from the Figma frame. Programme lists come from /programmes.
const SCHOOL_META: Record<string, { icon: string; tag: string; foot: string; footIcon: string }> = {
  "School of Engineering": { icon: "memory", tag: "AICTE & NBA Accredited", foot: "B.Tech / M.Tech / Ph.D", footIcon: "trending_up" },
  "School of Management Sciences": { icon: "query_stats", tag: "Established 1995", foot: "Dual Specialization MBA", footIcon: "bar_chart" },
  "School of Sciences": { icon: "science", tag: "DST-FIST Supported", foot: "Integrated M.Sc / Ph.D", footIcon: "biotech" },
  "School of Humanities & Social Sciences": { icon: "record_voice_over", tag: "Communication & Public Policy", foot: "MA / MSW / Ph.D", footIcon: "public" },
};

type Metrics = { placement_rate?: number; corporate_partners?: number; highest_ctc_lpa?: number; summer_internships?: number; cohort?: string };

export default function Home() {
  const records = useSWR("placement-records", () => call(api.GET("/api/v1/placement-records")));
  const latest = records.data?.toSorted((a, b) => b.year - a.year)[0];
  const m = (latest?.data ?? {}) as Metrics;

  return (
    <PublicShell active="/">
      <Hero m={m} brochureId={latest?.brochure_file_id ?? null} />
      <RegistrationDesk />
      <Schools />
      <section id="brochure" className="mx-auto grid max-w-[1280px] scroll-mt-28 gap-6 px-4 py-8 sm:px-8 lg:grid-cols-[1.4fr_1fr]">
        <BrochureCard brochureId={latest?.brochure_file_id ?? null} year={latest?.year} />
        <Directorate />
      </section>
    </PublicShell>
  );
}

function BrochureButton({ brochureId, className, children }: { brochureId: string | null; className: string; children: React.ReactNode }) {
  const session = useSession();
  // /files needs a login; guests are sent to sign in first.
  if (!session)
    return (
      <Link href="/login" className={className}>
        {children}
      </Link>
    );
  return (
    <button
      className={className}
      disabled={!brochureId}
      title={brochureId ? undefined : "Brochure not uploaded yet"}
      onClick={() => brochureId && openFile(brochureId)}
    >
      {children}
    </button>
  );
}

function Hero({ m, brochureId }: { m: Metrics; brochureId: string | null }) {
  const stats = [
    ["Placement Rate", m.placement_rate ?? 87.4, "%", m.cohort ?? "Academic Cohort 2023-24"],
    ["Corporate Partners", m.corporate_partners ?? 180, "+", "Recruiters on Campus"],
    ["Highest Compensation", m.highest_ctc_lpa ?? 21.5, "LPA", "International/Domestic Peak"],
    ["Summer Internships", m.summer_internships ?? 450, "+", "Pre-Placement Offers Linked"],
  ] as const;
  return (
    <section className="relative overflow-hidden bg-primary">
      <Image src="/img/campus.jpg" alt="" fill priority className="object-cover opacity-15" sizes="100vw" />
      <div className="absolute -top-24 -left-24 size-96 rounded-xl bg-primary-container/80 blur-3xl" />
      <div className="absolute right-0 bottom-0 size-80 rounded-xl bg-accent/10 blur-3xl" />
      <div className="relative mx-auto flex max-w-[1280px] flex-col px-4 pt-8 pb-16 sm:px-8">
        <p className="mb-3 flex w-fit items-center gap-1 rounded-xs bg-white/10 px-3 py-1 text-label font-semibold tracking-[0.6px] text-surface-high uppercase shadow-card backdrop-blur">
          <span className="size-2 rounded-xl bg-accent" />
          Centenary Vision • NAAC A+ Grade (CGPA 3.41) • NIRF Top Rank
        </p>
        <div className="flex flex-col gap-6 pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex max-w-[803px] flex-col gap-2">
            <h1 className="font-display text-[32px] leading-10 font-bold tracking-[-1px] text-white sm:text-display">
              Empowering Aspirations,
              <br />
              Connecting Excellence.
            </h1>
            <p className="max-w-[672px] text-body-lg leading-[26px] text-surface-high">
              The central conduit between world-class talent and global pioneers. Tezpur University Training &amp; Placement Cell orchestrates campus talent
              acquisitions, industrial internships, and skill development across 27 post-graduate &amp; engineering departments.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 lg:w-[389px]">
            <a
              href="#register"
              className="flex h-[46px] items-center justify-center gap-2 rounded-xs bg-accent text-card font-semibold text-white shadow-pop hover:brightness-95"
            >
              Begin Registration <Icon name="arrow_downward" />
            </a>
            <BrochureButton
              brochureId={brochureId}
              className="flex h-[46px] items-center justify-center gap-2 rounded-xs bg-white/10 text-card font-semibold text-white backdrop-blur hover:bg-white/15 cursor-pointer disabled:opacity-60"
            >
              <Icon name="download" /> Placement Brochure 2024–25
            </BrochureButton>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-5 rounded-lg bg-white/10 p-5 shadow-pop backdrop-blur lg:grid-cols-4">
          {stats.map(([label, value, unit, sub]) => (
            <div key={label} className="p-2">
              <p className="text-caption font-medium tracking-[0.55px] text-surface-high uppercase">{label}</p>
              <p className="flex items-baseline gap-1 pt-1">
                {unit === "LPA" && <span className="font-display text-title font-semibold text-tertiary-fixed">₹</span>}
                <span className="font-display text-display tracking-[-0.8px] font-bold text-white">{value}</span>
                <span
                  className={
                    unit === "LPA" ? "text-body font-semibold text-surface-high uppercase" : "font-display text-title font-semibold text-tertiary-fixed"
                  }
                >
                  {unit}
                </span>
              </p>
              <p className="pt-0.5 text-body text-surface-high">{sub}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Schools() {
  const programmes = useSWR("programmes", () => call(api.GET("/api/v1/programmes")));
  return (
    <section id="schools" className="scroll-mt-28 bg-surface-low/60">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-5 px-4 py-8 sm:px-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div className="flex flex-col gap-1">
            <Eyebrow className="text-label tracking-[0.6px]">Academic Spectrum</Eyebrow>
            <h2 className="font-display text-headline font-bold text-primary">Schools &amp; Disciplines on Offer</h2>
          </div>
          <p className="max-w-[439px] text-[14px] leading-5 text-muted">
            A multi-disciplinary ecosystem preparing over 4,000 scholars with industry-aligned curricula, research labs, and hands-on capstone projects.
          </p>
        </div>
        <State data={programmes.data} error={programmes.error} retry={() => programmes.mutate()} empty={(d) => d.length === 0}>
          {(list) => {
            const byDept = Object.entries(Object.groupBy(list, (p) => p.department));
            return byDept.length ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {byDept.map(([dept, ps]) => {
                  const meta = SCHOOL_META[dept];
                  const students = ps!.reduce((n, p) => n + (p.student_count ?? 0), 0);
                  return (
                    <article key={dept} className="flex min-h-[314px] flex-col justify-between rounded-lg bg-white p-5 shadow-card">
                      <div className="flex flex-col gap-[11px]">
                        <span className="grid size-12 place-items-center rounded-sm bg-surface text-primary">
                          <Icon name={meta?.icon ?? "school"} className="text-[24px]" />
                        </span>
                        <h3 className="pt-px font-display text-title font-semibold text-primary">{dept}</h3>
                        <p className="text-caption font-bold tracking-[0.55px] text-tertiary uppercase">{meta?.tag ?? `${ps!.length} programmes`}</p>
                        <ul className="flex flex-col gap-1 pt-1">
                          {ps!.map((p) => (
                            <li key={p.id} className="flex items-center gap-1.5 text-body text-muted">
                              <span className="size-1.5 shrink-0 rounded-xl bg-primary-container" />
                              {p.name}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex items-center justify-between pt-7 text-label font-semibold text-primary">
                        {meta?.foot ?? `${students} students`}
                        <Icon name={meta?.footIcon ?? "arrow_forward"} />
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <Empty text="Programmes will appear here once the T&P cell adds them." />
            );
          }}
        </State>
      </div>
    </section>
  );
}

function BrochureCard({ brochureId, year }: { brochureId: string | null; year?: number }) {
  return (
    <div className="relative flex flex-col justify-between overflow-hidden rounded-lg bg-primary p-8 shadow-pop">
      <div className="absolute -right-16 -bottom-16 size-64 rounded-xl bg-primary-container/60 blur-2xl" />
      <div className="relative flex flex-col gap-2 pb-5">
        <p className="flex w-fit items-center gap-2 rounded-xs bg-white/15 px-2 py-1 text-caption font-semibold text-surface-high uppercase">
          <Icon name="menu_book" /> Comprehensive Recruitment Prospectus
        </p>
        <h2 className="pt-1 font-display text-headline font-bold text-white">
          Official Placement Brochure
          <br />
          {year ? `${year}–${year + 1}` : "2024–2025"} Edition
        </h2>
        <p className="max-w-[505px] text-[14px] leading-[23px] text-surface-high">
          Gain complete clarity into graduating batches, department-wise student demographics, course curricula, cutting-edge laboratory infrastructure, past
          compensation curves, and logistical travel guidelines to Napaam campus.
        </p>
      </div>
      <div className="relative flex flex-wrap items-center gap-3">
        <BrochureButton
          brochureId={brochureId}
          className="flex h-[46px] items-center gap-2 rounded-xs bg-accent px-5 text-card font-semibold text-white shadow-pop hover:brightness-95 cursor-pointer disabled:opacity-60"
        >
          <Icon name="download" /> Download Brochure PDF
        </BrochureButton>
        <span className="flex items-center gap-1 text-caption font-semibold text-surface-high">
          <Icon name="check_circle" /> Includes INF / JNF Fillable Appendices
        </span>
      </div>
    </div>
  );
}

function Directorate() {
  const uni = useSWR("university", () => call(api.GET("/api/v1/university")));
  const email = uni.data?.contact_emails[0] ?? "adtp@tezu.ernet.in";
  const phone = uni.data?.admin_mobiles[0] ?? "+91 3712 273005";
  return (
    <div className="flex flex-col gap-6 rounded-lg bg-white p-5 shadow-pop">
      <div>
        <div className="flex items-center justify-between pb-2">
          <h2 className="font-display text-title font-semibold text-primary">Training &amp; Placement Directorate</h2>
          <Icon name="contact_support" className="text-[20px] text-tertiary" />
        </div>
        <p className="text-body text-muted">Direct institutional channels for company registrations, pre-placement talks, and hospitality arrangements.</p>
      </div>
      <ul className="flex flex-col gap-3">
        {[
          ["person", "Director & In-Charge, T&P Cell", `Email: ${email}`],
          ["support_agent", "Placement Officer & Corporate Liaison", `Phone: ${phone}`],
        ].map(([icon, role, line]) => (
          <li key={role} className="flex gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface text-primary">
              <Icon name={icon} />
            </span>
            <div>
              <p className="text-card leading-5 font-semibold text-primary">Ms. Deena Davy</p>
              <p className="text-caption font-semibold text-tertiary uppercase">{role}</p>
              <p className="pt-0.5 text-body text-muted">{line}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-auto flex items-center justify-between rounded-sm bg-surface-low p-2 text-caption font-semibold text-muted">
        <span className="flex items-center gap-2">
          <Icon name="location_on" className="text-primary" /> {uni.data?.address ?? "Dean’s Building, Ground Floor, TU Campus"}
        </span>
        <a href={`mailto:${email}`} className="font-bold text-primary">
          Full Directory →
        </a>
      </div>
      {uni.error && <p className="text-caption text-error">Couldn&apos;t load live contacts; showing defaults.</p>}
    </div>
  );
}
