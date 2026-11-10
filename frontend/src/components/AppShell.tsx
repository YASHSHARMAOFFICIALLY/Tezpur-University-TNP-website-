"use client";

import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { useState, type ReactNode } from "react";
import useSWR from "swr";
import { api, call, homeFor, logout, setSession, useSession, type Role } from "@/lib/api";
import { Button, Field, Icon, Input, cx, initials } from "./ui";

export type NavItem = { label: string; icon: string; href: string };

/** In-page "#tab" links must be plain anchors: the pages listen for `hashchange`, and Next's <Link> navigates with pushState, which never fires it. */
export function NavLink({ href, ...p }: React.ComponentProps<typeof Link>) {
  return typeof href === "string" && href.startsWith("#") ? <a href={href} {...(p as React.ComponentProps<"a">)} /> : <Link href={href} {...p} />;
}

const PORTALS: { label: string; href: string; role?: Role }[] = [
  { label: "Public / Guest", href: "/" },
  { label: "Admin / TPO", href: "/admin", role: "admin" },
  { label: "Student / Alumnus", href: "/student", role: "student" },
  { label: "Recruiter / Org", href: "/recruiter", role: "company" },
];

const CONSOLE: Record<Role, string> = {
  admin: "T&P Administrative Node",
  student: "Student & Alumnus Hub",
  company: "Recruiter Corporate Desk",
};

function academicYear(d = new Date()) {
  const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; // session starts in July
  return `Academic Year ${y}-${y + 1}`;
}

/** Logged-in layout from the Figma admin/student/recruiter frames: 256px aside, 80px top bar. */
export function AppShell({ role, nav, active, children }: { role: Role; nav: NavItem[]; active?: string; children: ReactNode }) {
  const session = useSession();
  if (session === undefined) return <div className="min-h-screen bg-bg" />;
  if (!session) redirect("/login");
  if (session.user.role !== role) redirect(homeFor(session.user.role));

  const user = session.user;
  return (
    <div className="min-h-screen bg-bg lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-surface-low pt-3 pb-5 shadow-bar lg:flex">
        <div className="flex items-center gap-2 px-5 pb-5">
          <Image src="/img/emblem.jpg" alt="Tezpur University emblem" width={32} height={32} />
          <div>
            <p className="font-display text-card font-bold uppercase leading-5 tracking-[-0.4px] text-primary">TU Placement</p>
            <p className="text-caption font-semibold uppercase text-muted">Operations Desk</p>
          </div>
        </div>
        <div className="px-3 pb-3">
          <div className="rounded-xs bg-surface px-2 py-1">
            <p className="text-caption font-bold text-muted">Active Console</p>
            <p className="text-body font-semibold text-primary">{CONSOLE[role]}</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-2">
          {nav.map((n) => (
            <NavLink
              key={n.href}
              href={n.href}
              className={cx(
                "flex h-10 items-center gap-2 rounded-xs px-3 text-body-lg",
                active === n.href ? "bg-primary-container font-semibold text-white" : "text-muted hover:bg-surface",
              )}
            >
              <Icon name={n.icon} filled={active === n.href} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 pt-2">
          <Link href="/" className="flex h-6 items-center justify-center gap-1 rounded-xs bg-surface-high text-label font-semibold text-ink">
            <Icon name="public" />
            Exit to Public View
          </Link>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-20 items-center justify-between gap-4 bg-white/95 px-6 shadow-bar">
        <div className="min-w-0">
          <p className="truncate text-card font-bold tracking-[-0.4px] text-primary">Tezpur University T&amp;P System</p>
          <p className="text-caption font-semibold text-muted">{academicYear()}</p>
        </div>
        <div className="flex items-center gap-3">
          <nav aria-label="Portals" className="hidden items-center rounded-xs bg-surface-low p-0.5 xl:flex">
            {PORTALS.map((p) => (
              <Link
                key={p.href}
                href={p.href}
                className={cx("rounded-xs px-2 py-0.5 text-caption font-semibold", p.role === role ? "bg-primary text-white" : "text-muted hover:text-ink")}
              >
                {p.label}
              </Link>
            ))}
          </nav>
          {!user.must_change_password && <NoticeBell role={role} />}
          <div className="flex h-10 items-center gap-2 rounded-xs bg-surface-low py-1 pr-1 pl-2">
            <span className="grid size-8 place-items-center rounded-xl bg-primary-container text-label font-bold text-white">{initials(user.name)}</span>
            <div className="hidden pr-1 sm:block">
              <p className="text-label leading-3 font-semibold text-ink">{user.name}</p>
              <p className="text-caption font-semibold text-muted">
                {role === "admin" ? "T&P Admin" : role === "company" ? "Recruiter" : user.status === "alumni" ? "Alumnus" : "Student"}
              </p>
            </div>
            <button onClick={logout} aria-label="Log out" className="grid size-7 place-items-center text-muted hover:text-ink cursor-pointer">
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </header>

      {/* below lg the aside is hidden: same links as a scroll strip */}
      <nav className="flex gap-1 overflow-x-auto bg-surface-low px-4 py-2 lg:hidden">
        {nav.map((n) => (
          <NavLink
            key={n.href}
            href={n.href}
            className={cx("shrink-0 rounded-xs px-3 py-1 text-body", active === n.href ? "bg-primary-container text-white" : "text-muted")}
          >
            {n.label}
          </NavLink>
        ))}
      </nav>

      <main className="px-4 pt-6 pb-5 sm:px-6">{user.must_change_password ? <ChangePassword /> : children}</main>
    </div>
  );
}

const NOTICES_HREF: Record<Role, string> = { admin: "/admin/comms", company: "#dispatch", student: "#notices" };

function NoticeBell({ role }: { role: Role }) {
  const { data } = useSWR("noticeboard", () => call(api.GET("/api/v1/noticeboard", { params: { query: { limit: 100 } } })));
  const n = data?.data.length ?? 0;
  return (
    <NavLink href={NOTICES_HREF[role]} aria-label={`${n} notices`} className="relative px-1 pt-1 pb-2.5 text-muted">
      <Icon name="notifications" className="text-[18px]" />
      {n > 0 && (
        <span className="absolute top-0 -right-1 grid size-4 place-items-center rounded-xl bg-tertiary text-[10px] leading-none font-bold text-white">
          {n > 9 ? "9+" : n}
        </span>
      )}
    </NavLink>
  );
}

/** Backend blocks everything else while must_change_password is true. */
function ChangePassword() {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("new_password") !== f.get("confirm")) return setErr("The two new passwords don't match.");
    setBusy(true);
    setErr("");
    try {
      const s = await call(
        api.POST("/api/v1/auth/change-password", {
          body: { current_password: String(f.get("current_password")), new_password: String(f.get("new_password")) },
        }),
      );
      setSession(s);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="mx-auto mt-10 flex max-w-md flex-col gap-4 rounded-lg bg-white p-6 shadow-card">
      <div>
        <p className="text-caption font-bold text-tertiary">Security step</p>
        <h1 className="font-display text-title font-bold text-primary">Set a new password</h1>
        <p className="text-body text-muted">Your account uses a one-time password. Choose your own before continuing.</p>
      </div>
      <Field label="Current (one-time) password">
        <Input name="current_password" type="password" required autoComplete="current-password" />
      </Field>
      <Field label="New password" hint="At least 8 characters.">
        <Input name="new_password" type="password" required minLength={8} autoComplete="new-password" />
      </Field>
      <Field label="Repeat new password" error={err}>
        <Input name="confirm" type="password" required autoComplete="new-password" />
      </Field>
      <Button type="submit" busy={busy}>
        Save password
      </Button>
    </form>
  );
}
