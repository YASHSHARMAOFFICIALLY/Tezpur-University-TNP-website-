"use client";

import Image from "next/image";
import Link from "next/link";
import useSWR, { type SWRResponse } from "swr";
import { PublicShell } from "@/components/PublicShell";
import { RegistrationDesk } from "@/components/RegistrationDesk";
import { Empty, Eyebrow, Icon, State } from "@/components/ui";
import { api, call, openFile, useSession } from "@/lib/api";
import { SCHOOL_DEFAULTS, SITE_DEFAULTS, defaultContacts, siteText, type Site } from "./site-defaults";

type Metrics = { placement_rate?: number; corporate_partners?: number; highest_ctc_lpa?: number; summer_internships?: number; cohort?: string };

export default function Landing() {
  const records = useSWR("placement-records", () => call(api.GET("/api/v1/placement-records")));
  const latest = records.data?.toSorted((a, b) => b.year - a.year)[0];
  const m = (latest?.data ?? {}) as Metrics;
  const uni = useSWR("university", fetchUniversity);
  const site: Site = uni.data?.site ?? {};
  // Empty keys fall back to the built-in copy; the badge first tries the university's own ranking.
  const t = (k: keyof typeof SITE_DEFAULTS) => siteText(site, k);
  const badge = site.hero_badge?.trim() || uni.data?.ranking?.trim() || SITE_DEFAULTS.hero_badge;
  const brochureLabel = site.brochure_label?.trim() || (latest ? `Placement Brochure ${latest.year}–${String(latest.year + 1).slice(-2)}` : SITE_DEFAULTS.brochure_label);

  return (
    <PublicShell active="/">
      <Hero m={m} brochureId={latest?.brochure_file_id ?? null} badge={badge} title={t("hero_title")} text={t("hero_text")} brochureLabel={brochureLabel} cohortSub={site.hero_stat_placement_sub?.trim() || m.cohort || SITE_DEFAULTS.hero_stat_placement_sub} t={t} />
      <RegistrationDesk />
      <Schools title={t("schools_title")} text={t("schools_text")} eyebrow={t("schools_eyebrow")} copy={site.schools ?? []} />
      <section id="brochure" className="mx-auto grid max-w-[1280px] scroll-mt-28 gap-6 px-4 py-8 sm:px-8 lg:grid-cols-[1.4fr_1fr]">
        <BrochureCard brochureId={latest?.brochure_file_id ?? null} year={latest?.year} title={t("brochure_title")} text={t("brochure_text")} t={t} />
        <Directorate uni={uni} site={site} title={t("directorate_title")} text={t("directorate_text")} />
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

function Hero({
  m,
  brochureId,
  badge,
  title,
  text,
  brochureLabel,
  cohortSub,
  t,
}: {
  m: Metrics;
  brochureId: string | null;
  badge: string;
  title: string;
  text: string;
  brochureLabel: string;
  cohortSub: string;
  t: (k: keyof typeof SITE_DEFAULTS) => string;
}) {
  const stats = [
    ["Placement Rate", m.placement_rate ?? "—", "%", cohortSub],
    ["Corporate Partners", m.corporate_partners ?? "—", "+", t("hero_stat_partners_sub")],
    ["Highest Compensation", m.highest_ctc_lpa ?? "—", "LPA", t("hero_stat_ctc_sub")],
    ["Summer Internships", m.summer_internships ?? "—", "+", t("hero_stat_interns_sub")],
  ] as const;
  return (
    <section id="profile" className="relative scroll-mt-28 overflow-hidden bg-primary">
      <Image src="/img/campus.jpg" alt="" fill priority className="object-cover opacity-15" sizes="100vw" />
      <div className="absolute -top-24 -left-24 size-96 rounded-xl bg-primary-container/80 blur-3xl" />
      <div className="absolute right-0 bottom-0 size-80 rounded-xl bg-accent/10 blur-3xl" />
      <div className="relative mx-auto flex max-w-[1280px] flex-col px-4 pt-8 pb-16 sm:px-8">
        <p className="mb-3 flex w-fit items-center gap-1 rounded-xs bg-white/10 px-3 py-1 text-label font-semibold tracking-[0.6px] text-surface-high uppercase shadow-card backdrop-blur">
          <span className="size-2 rounded-xl bg-accent" />
          {badge}
        </p>
        <div className="flex flex-col gap-6 pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex max-w-[803px] flex-col gap-2">
            <h1 className="font-display text-[32px] leading-10 font-bold tracking-[-1px] whitespace-pre-line text-white sm:text-display">{title}</h1>
            <p className="max-w-[672px] text-body-lg leading-[26px] whitespace-pre-line text-surface-high">{text}</p>
          </div>
          <div className="flex w-full flex-col gap-2 lg:w-[389px]">
            <a
              href="#register"
              className="flex h-[46px] items-center justify-center gap-2 rounded-xs bg-accent text-card font-semibold text-white shadow-pop hover:brightness-95"
            >
              {t("hero_cta_label")} <Icon name="arrow_downward" />
            </a>
            <BrochureButton
              brochureId={brochureId}
              className="flex h-[46px] items-center justify-center gap-2 rounded-xs bg-white/10 text-card font-semibold text-white backdrop-blur hover:bg-white/15 cursor-pointer disabled:opacity-60"
            >
              <Icon name="download" /> {brochureLabel}
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

function Schools({ title, text, eyebrow, copy }: { title: string; text: string; eyebrow: string; copy: NonNullable<Site["schools"]> }) {
  const programmes = useSWR("programmes", () => call(api.GET("/api/v1/programmes")));
  return (
    <section id="schools" className="scroll-mt-28 bg-surface-low/60">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-5 px-4 py-8 sm:px-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div className="flex flex-col gap-1">
            <Eyebrow className="text-label tracking-[0.6px]">{eyebrow}</Eyebrow>
            <h2 className="font-display text-headline font-bold text-primary">{title}</h2>
          </div>
          <p className="max-w-[439px] text-[14px] leading-5 whitespace-pre-line text-muted">{text}</p>
        </div>
        <State data={programmes.data} error={programmes.error} retry={() => programmes.mutate()} empty={(d) => d.length === 0}>
          {(list) => {
            const byDept = Object.entries(Object.groupBy(list, (p) => p.department));
            return byDept.length ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {byDept.map(([dept, ps]) => {
                  const meta = SCHOOL_DEFAULTS[dept];
                  const own = copy.find((c) => c.department === dept);
                  const tag = own?.tag?.trim() || meta?.tag || `${ps!.length} programmes`;
                  const students = ps!.reduce((n, p) => n + (p.student_count ?? 0), 0);
                  return (
                    <article key={dept} className="flex min-h-[314px] flex-col justify-between rounded-lg bg-white p-5 shadow-card">
                      <div className="flex flex-col gap-[11px]">
                        <span className="grid size-12 place-items-center rounded-sm bg-surface text-primary">
                          <Icon name={meta?.icon ?? "school"} className="text-[24px]" />
                        </span>
                        <h3 className="pt-px font-display text-title font-semibold text-primary">{dept}</h3>
                        <p className="text-caption font-bold tracking-[0.55px] text-tertiary uppercase">{tag}</p>
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
                        {own?.foot?.trim() || meta?.foot || `${students} students`}
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

function BrochureCard({ brochureId, year, title, text, t }: { brochureId: string | null; year?: number; title: string; text: string; t: (k: keyof typeof SITE_DEFAULTS) => string }) {
  return (
    <div className="relative flex flex-col justify-between overflow-hidden rounded-lg bg-primary p-8 shadow-pop">
      <div className="absolute -right-16 -bottom-16 size-64 rounded-xl bg-primary-container/60 blur-2xl" />
      <div className="relative flex flex-col gap-2 pb-5">
        <p className="flex w-fit items-center gap-2 rounded-xs bg-white/15 px-2 py-1 text-caption font-semibold text-surface-high uppercase">
          <Icon name="menu_book" /> {t("brochure_eyebrow")}
        </p>
        <h2 className="pt-1 font-display text-headline font-bold text-white">
          {title}
          <br />
          {year ? `${year}–${year + 1}` : "2024–2025"} Edition
        </h2>
        <p className="max-w-[505px] text-[14px] leading-[23px] whitespace-pre-line text-surface-high">{text}</p>
      </div>
      <div className="relative flex flex-wrap items-center gap-3">
        <BrochureButton
          brochureId={brochureId}
          className="flex h-[46px] items-center gap-2 rounded-xs bg-accent px-5 text-card font-semibold text-white shadow-pop hover:brightness-95 cursor-pointer disabled:opacity-60"
        >
          <Icon name="download" /> {t("brochure_button")}
        </BrochureButton>
        <span className="flex items-center gap-1 text-caption font-semibold text-surface-high">
          <Icon name="check_circle" /> {t("brochure_note")}
        </span>
      </div>
    </div>
  );
}

type Uni = SWRResponse<Awaited<ReturnType<typeof fetchUniversity>>>;
const fetchUniversity = () => call(api.GET("/api/v1/university"));

function Directorate({ uni, site, title, text }: { uni: Uni; site: Site; title: string; text: string }) {
  const email = uni.data?.contact_emails[0] ?? "adtp@tezu.ernet.in";
  const phone = uni.data?.admin_mobiles[0] ?? "+91 3712 273005";
  const contacts = site.contacts?.length ? site.contacts : defaultContacts(email, phone);
  return (
    <div className="flex flex-col gap-6 rounded-lg bg-white p-5 shadow-pop">
      <div>
        <div className="flex items-center justify-between pb-2">
          <h2 className="font-display text-title font-semibold text-primary">{title}</h2>
          <Icon name="contact_support" className="text-[20px] text-tertiary" />
        </div>
        <p className="text-body whitespace-pre-line text-muted">{text}</p>
      </div>
      <ul className="flex flex-col gap-3">
        {contacts.map((c, i) => (
          <li key={`${c.name}-${c.role}-${i}`} className="flex gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface text-primary">
              <Icon name={i === 0 ? "person" : "support_agent"} />
            </span>
            <div className="min-w-0">
              <p className="text-card leading-5 font-semibold break-words text-primary">{c.name}</p>
              {c.role && <p className="text-caption font-semibold text-tertiary uppercase">{c.role}</p>}
              {c.line && <p className="pt-0.5 text-body break-words text-muted">{c.line}</p>}
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
