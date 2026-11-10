"use client";

import Link from "next/link";
import { redirect } from "next/navigation";
import { useState } from "react";
import { PublicShell } from "@/components/PublicShell";
import { Button, Eyebrow, Field, Icon, Input, Select } from "@/components/ui";
import { ApiError, api, call, homeFor, setSession, useSession } from "@/lib/api";

type Mode = "login" | "forgot" | "reset" | "verify" | "resubmit";

const TITLES: Record<Mode, [string, string]> = {
  login: ["Sign in to your portal", "Students, recruiters and T&P staff use the same sign-in. You'll land on your own portal."],
  forgot: ["Reset or set your password", "First time here after a CSV import? Enter your TU email and we'll send a 6-digit code."],
  reset: ["Enter the code from your email", "The code expires in a few minutes. Check spam if it hasn't arrived."],
  verify: ["Verify your email", "Enter the 6-digit code we emailed you. Students can sign in right after; recruiters wait for T&P approval."],
  resubmit: [
    "Correct & resubmit your organisation",
    "The T&P cell returned your registration. Fix the details below and it goes back into their approval queue.",
  ],
};

const CATEGORIES = ["mnc", "private", "psu", "govt", "startup", "ngo", "other"] as const;

/** Not in Figma: built in the registration-desk card style (user decision). */
export default function LoginPage() {
  const session = useSession();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState(""); // kept for /auth/resubmit/recruiter, which re-authenticates with it

  if (session) redirect(homeFor(session.user.role));

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      const err = e as ApiError;
      if (err.code === "EMAIL_NOT_VERIFIED") {
        setMode("verify");
        setMsg({ tone: "error", text: "Your email isn't verified yet. Enter the code we sent, or resend it." });
      } else if (err.code === "ACCOUNT_REJECTED" && mode === "login") {
        setMode("resubmit");
        setMsg({ tone: "error", text: `${err.message}. Recruiters can correct their details below; students should contact the T&P cell.` });
      } else setMsg({ tone: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    if (mode === "login") {
      setPassword(f.password);
      return run(async () => setSession(await call(api.POST("/api/v1/auth/login", { body: { email, password: f.password } }))));
    }
    if (mode === "resubmit")
      return run(async () => {
        await call(
          api.POST("/api/v1/auth/resubmit/recruiter", {
            body: {
              email,
              password,
              company: {
                name: f.company_name,
                website: f.website || undefined,
                category: (f.category || undefined) as (typeof CATEGORIES)[number] | undefined,
                sector: f.sector || undefined,
                postal_address: f.postal_address || undefined,
              },
            },
          }),
        );
        setMode("login");
        setMsg({ tone: "ok", text: "Resubmitted. Your registration is back in the T&P approval queue; you'll get an email when it's reviewed." });
      });
    if (mode === "forgot")
      return run(async () => {
        await call(api.POST("/api/v1/auth/forgot-password", { body: { email } }));
        setMode("reset");
        setMsg({ tone: "ok", text: `If ${email} has an account, a code is on its way.` });
      });
    if (mode === "reset")
      return run(async () => {
        if (f.new_password !== f.confirm) throw new ApiError("VALIDATION_FAILED", "The two passwords don't match.");
        await call(api.POST("/api/v1/auth/reset-password", { body: { email, code: f.code, new_password: f.new_password } }));
        setMode("login");
        setMsg({ tone: "ok", text: "Password saved. Sign in with your new password." });
      });
    return run(async () => {
      const { status } = await call(api.POST("/api/v1/auth/verify-otp", { body: { email, code: f.code } }));
      setMode("login");
      setMsg({
        tone: "ok",
        text:
          status === "active"
            ? "Email verified. Your account is active, sign in below."
            : "Email verified. Your account is awaiting T&P approval; you can sign in once it's approved.",
      });
    });
  }

  const resend = () =>
    run(async () => {
      await call(api.POST(mode === "verify" ? "/api/v1/auth/resend-otp" : "/api/v1/auth/forgot-password", { body: { email } }));
      setMsg({ tone: "ok", text: "A new code has been sent." });
    });

  return (
    <PublicShell active="">
      <div className="mx-auto grid max-w-[1280px] gap-6 px-4 py-12 sm:px-8 lg:grid-cols-[1fr_1.4fr]">
        <aside className="hidden flex-col gap-4 rounded-lg bg-surface-low p-6 lg:flex">
          <span className="grid size-10 place-items-center rounded-xs bg-primary text-white">
            <Icon name="shield_person" />
          </span>
          <div>
            <h2 className="font-display text-title font-bold text-primary">Institutional Access Desk</h2>
            <p className="text-caption font-semibold text-muted">Admin • Student • Recruiter</p>
          </div>
          <p className="text-body text-muted">
            One sign-in for all three portals. New students and recruiters register from the public page and are verified by the T&amp;P cell before first
            access.
          </p>
          <div className="mt-auto rounded-xs bg-white p-3 shadow-card">
            <Eyebrow className="pb-1">
              <Icon name="verified_user" /> Security advisory
            </Eyebrow>
            <p className="text-body text-muted">
              Too many attempts in one minute pause sign-in briefly. If you stay locked out, the T&amp;P cell can unlock your account.
            </p>
          </div>
        </aside>

        <form onSubmit={submit} className="flex flex-col gap-5 rounded-lg bg-white p-6 shadow-card sm:p-8" noValidate={false}>
          <div>
            <Eyebrow dot>Centralized gateway</Eyebrow>
            <h1 className="font-display text-headline font-bold text-primary">{TITLES[mode][0]}</h1>
            <p className="pt-1 text-body text-muted">{TITLES[mode][1]}</p>
          </div>

          {msg && (
            <p
              role={msg.tone === "error" ? "alert" : "status"}
              className={
                msg.tone === "error"
                  ? "rounded-xs bg-error-container px-3 py-2 text-body text-on-error-container"
                  : "rounded-xs bg-primary-fixed px-3 py-2 text-body text-primary"
              }
            >
              {msg.text}
            </p>
          )}

          <Field label={mode === "login" ? "Enrolment number or Email *" : "Email *"} hint={mode === "login" ? "Students can use their enrolment number, e.g. CSB21045." : undefined}>
            <Input
              type={mode === "login" ? "text" : "email"}
              required
              autoComplete={mode === "login" ? "username" : "email"}
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={mode === "login" ? "you@tezu.ac.in or CSB21045" : "you@tezu.ac.in"}
              readOnly={mode === "reset" || mode === "verify" || mode === "resubmit"}
            />
          </Field>

          {mode === "login" && (
            <Field label="Password *">
              <Input name="password" type="password" required autoComplete="current-password" />
            </Field>
          )}
          {(mode === "reset" || mode === "verify") && (
            <Field label="6-digit code *">
              <Input name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} required autoComplete="one-time-code" />
            </Field>
          )}
          {mode === "resubmit" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Organisation Legal Name *">
                <Input name="company_name" required minLength={2} />
              </Field>
              <Field label="Official Website">
                <Input name="website" type="url" placeholder="https://" />
              </Field>
              <Field label="Corporate Category">
                <Select name="category" defaultValue="">
                  <option value="">Select</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c.toUpperCase()}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Industry Sector">
                <Input name="sector" />
              </Field>
              <Field label="Registered Office Address" className="sm:col-span-2">
                <Input name="postal_address" />
              </Field>
            </div>
          )}
          {mode === "reset" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="New password *" hint="At least 8 characters.">
                <Input name="new_password" type="password" minLength={8} required autoComplete="new-password" />
              </Field>
              <Field label="Repeat new password *">
                <Input name="confirm" type="password" minLength={8} required autoComplete="new-password" />
              </Field>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-4 text-label font-semibold text-tertiary">
              {mode === "login" ? (
                <button type="button" className="cursor-pointer py-2 hover:underline" onClick={() => (setMode("forgot"), setMsg(null))}>
                  Forgot password / first login?
                </button>
              ) : (
                <button type="button" className="cursor-pointer hover:underline" onClick={() => (setMode("login"), setMsg(null))}>
                  ← Back to sign in
                </button>
              )}
              {(mode === "reset" || mode === "verify") && (
                <button type="button" className="cursor-pointer hover:underline" onClick={resend} disabled={busy}>
                  Resend code
                </button>
              )}
            </div>
            <Button type="submit" busy={busy} size="lg" className="text-body!">
              {{ login: "Sign in", forgot: "Send code", reset: "Save new password", verify: "Verify email", resubmit: "Resubmit for approval" }[mode]}
              <Icon name="arrow_forward" />
            </Button>
          </div>

          <p className="border-t border-surface pt-4 text-body text-muted">
            New here?{" "}
            <Link href="/#register" className="inline-block py-2 font-semibold text-primary hover:underline">
              Register as a student or recruiter
            </Link>
          </p>
        </form>
      </div>
    </PublicShell>
  );
}
