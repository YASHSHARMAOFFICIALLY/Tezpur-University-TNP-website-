"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import useSWR from "swr";
import { api, call, homeFor, useSession } from "@/lib/api";
import { Icon, cx, initials } from "./ui";

const PORTALS = [
  { label: "Public / Guest", href: "/" },
  { label: "Admin / TPO", href: "/admin" },
  { label: "Student / Alumnus", href: "/student" },
  { label: "Recruiter / Org", href: "/recruiter" },
];

const NAV = [
  { label: "Home / Public", href: "/" },
  { label: "University Profile", href: "/#profile" },
  { label: "Training", href: "/student#training" },
  { label: "Internships", href: "/student#internships" },
  { label: "Final Placement", href: "/student#placements" },
  { label: "Brochures", href: "/#brochure" },
  { label: "Contact", href: "/#contact" },
];

/** Public header + footer from the "Public Portal & Dual Registration Flow" frame. */
export function PublicShell({ active = "/", children }: { active?: string; children: ReactNode }) {
  // Same SWR key as the landing page, so an admin edit to the university profile shows in the footer too.
  const uni = useSWR("university", () => call(api.GET("/api/v1/university"))).data;
  const session = useSession();
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="sticky top-0 z-30 bg-white/95 shadow-bar">
        <div className="flex items-center justify-between gap-4 bg-primary px-4 py-1 sm:px-8">
          <p className="truncate text-caption font-semibold tracking-[0.55px] text-surface-high uppercase">
            A Central University established by an Act of Parliament (1994)
          </p>
          <nav aria-label="Portals" className="hidden shrink-0 items-center rounded-xs bg-primary-container p-0.5 md:flex">
            {PORTALS.map((p) => (
              <Link
                key={p.href}
                href={p.href}
                className={cx(
                  "rounded-xs px-2 py-0.5 text-caption font-semibold",
                  p.href === "/" ? "text-white" : "text-on-primary-container hover:text-white",
                )}
              >
                {p.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex h-20 items-center justify-between gap-4 px-4 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/img/emblem.jpg" alt="Tezpur University emblem" width={32} height={32} />
            <div>
              <p className="font-display text-title leading-[18px] font-semibold tracking-[-0.45px] text-primary uppercase">Tezpur University</p>
              <p className="pt-0.5 text-caption font-semibold tracking-[0.55px] text-muted uppercase">Training &amp; Placement Cell</p>
            </div>
          </Link>
          <nav className="hidden items-center gap-2 lg:flex">
            {NAV.map((n) => (
              <Link
                key={n.label}
                href={n.href}
                className={cx(
                  "rounded-xs px-2 py-1 text-body-lg whitespace-nowrap",
                  n.href === active ? "bg-primary-container text-white" : "font-semibold text-muted hover:text-ink",
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            {session ? (
              <Link href={homeFor(session.user.role)} className="flex h-12 items-center gap-2 rounded-xs bg-surface-low py-1 pr-2 pl-2">
                <span className="grid size-8 place-items-center rounded-xl bg-primary-container text-label font-bold text-white">
                  {initials(session.user.name)}
                </span>
                <span className="hidden sm:block">
                  <span className="block text-label leading-4 font-semibold whitespace-nowrap text-ink">{session.user.name}</span>
                  <span className="block text-caption leading-4 font-semibold whitespace-nowrap text-muted">Open my portal</span>
                </span>
                <Icon name="arrow_forward" className="text-muted" />
              </Link>
            ) : (
              <Link href="/login" className="flex h-12 items-center gap-2 rounded-xs bg-surface-low py-1 pr-2 pl-2">
                <span className="size-8 rounded-xl bg-[#841717]" />
                <span className="hidden sm:block">
                  <span className="block text-label leading-4 font-semibold whitespace-nowrap text-ink">Guest User</span>
                  <span className="block text-caption leading-4 font-semibold whitespace-nowrap text-muted">Candidate Access</span>
                </span>
                <Icon name="login" className="text-muted" />
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer id="contact" className="bg-primary text-surface-high">
        <div className="mx-auto grid max-w-[1280px] gap-6 p-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-2">
            <p className="font-display text-title font-semibold text-white uppercase">{uni?.name ?? "Tezpur University"}</p>
            <p className="text-body">Training and Placement Cell, {uni?.address ?? "Napaam, Sonitpur, Assam - 784028"}.</p>
          </div>
          <FooterCol
            title="Quick Portals"
            items={[
              ["Active Placement Drives", "/student#drives"],
              ["My Applications", "/student#applications"],
              ["Corporate Registration (JNF/INF)", "/#register"],
            ]}
          />
          <FooterCol
            title="Institutional Resources"
            items={[
              ["Placement Brochure PDF", "/#brochure"],
              ["Academic Demographics & NIRF", "/#schools"],
              ["Skill Training Modules", "/student#training"],
            ]}
          />
          <div className="flex flex-col gap-2">
            <p className="text-card font-semibold text-white">Office Contacts</p>
            <p className="text-body">
              {(uni?.contact_emails.length ? uni.contact_emails : ["adtp@tezu.ernet.in"]).map((e) => (
                <span key={e} className="block">
                  Email: <a href={`mailto:${e}`}>{e}</a>
                </span>
              ))}
              {(uni?.admin_mobiles.length ? uni.admin_mobiles : ["+91 3712 273005"]).map((m) => (
                <span key={m} className="block">
                  Phone: {m}
                </span>
              ))}
            </p>
          </div>
        </div>
        <p className="bg-[#00142e] px-8 py-2 text-center text-caption font-semibold">
          © Training &amp; Placement Cell, {uni?.name ?? "Tezpur University"}. All Rights Reserved.
        </p>
      </footer>
    </div>
  );
}

function FooterCol({ title, items }: { title: string; items: [string, string][] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-card font-semibold text-white">{title}</p>
      <ul className="flex flex-col gap-1 text-body">
        {items.map(([label, href]) => (
          <li key={label}>
            <Link href={href} className="inline-block py-1.5 hover:text-white">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
