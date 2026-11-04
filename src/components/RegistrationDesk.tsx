"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { api, call } from "@/lib/api";
import { Button, Eyebrow, Field, Icon, Input, Select, cx } from "./ui";

type Tab = "recruiter" | "student";
const CATEGORIES = [
  ["mnc", "MNC"],
  ["private", "Private Limited"],
  ["psu", "Public Sector Undertaking (PSU)"],
  ["govt", "Government"],
  ["startup", "Startup"],
  ["ngo", "NGO"],
  ["other", "Other / Research"],
] as const;

const STEPS = [
  ["Organisation Details", "Legal entity & domain profile"],
  ["Sector & Domain", "Industry vertical & location"],
  ["Contact Authority", "Direct HR/Talent POC"],
  ["Verification & Approval", "TPO clearance audit"],
];

/** "Institutional Dual Registration Desk" from the public Figma frame, wired to /auth/register/* + /auth/verify-otp. */
export function RegistrationDesk() {
  const [tab, setTab] = useState<Tab>("recruiter");
  return (
    <section id="register" className="mx-auto flex max-w-[1280px] scroll-mt-28 flex-col items-center gap-5 px-4 py-8 sm:px-8">
      <div className="flex w-full flex-col justify-between gap-4 md:flex-row md:items-end">
        <div className="flex flex-col gap-1">
          <Eyebrow dot className="text-label tracking-[0.6px]">
            Centralized Gateway
          </Eyebrow>
          <h2 className="font-display text-headline font-bold text-primary">Institutional Dual Registration Desk</h2>
        </div>
        <p className="max-w-[512px] text-[14px] leading-5 text-muted">
          Select your designated profile type below. All credentials undergo mandatory TPO verification before account provisioning and drive participation.
        </p>
      </div>

      <div role="tablist" className="grid w-full max-w-[448px] grid-cols-2 rounded-sm bg-surface p-1 shadow-card">
        {(
          [
            ["recruiter", "corporate_fare", "Corporate / Recruiter"],
            ["student", "school", "Student / Candidate"],
          ] as const
        ).map(([id, icon, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cx(
              "flex h-[38px] items-center justify-center gap-1 rounded-xs text-card font-semibold cursor-pointer",
              tab === id ? "bg-white text-primary shadow-card" : "text-muted",
            )}
          >
            <Icon name={icon} />
            {label}
          </button>
        ))}
      </div>

      {tab === "recruiter" ? <RecruiterFlow /> : <StudentFlow />}
    </section>
  );
}

function SidePanel({ icon, title, sub, text, step, steps }: { icon: string; title: string; sub: string; text: string; step: number; steps: string[][] }) {
  return (
    <aside className="flex flex-col justify-between gap-5 rounded-lg bg-surface-low p-5 shadow-card">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="grid size-10 place-items-center rounded-sm bg-primary text-white">
            <Icon name={icon} className="text-[20px]" />
          </span>
          <div>
            <h3 className="font-display text-title font-semibold text-primary">{title}</h3>
            <p className="text-caption font-semibold text-muted">{sub}</p>
          </div>
        </div>
        <p className="text-body text-muted">{text}</p>
        <ol className="flex flex-col">
          {steps.map(([t, d], i) => (
            <li key={t} className="flex flex-col">
              {i > 0 && <span className="ml-[13px] h-6 w-0.5 bg-surface-highest" />}
              <div className="flex gap-3">
                <span
                  className={cx(
                    "grid size-7 shrink-0 place-items-center rounded-xl text-caption font-bold",
                    i <= step ? "bg-primary text-white" : "bg-surface-highest text-muted",
                  )}
                >
                  {i < step ? <Icon name="check" /> : i + 1}
                </span>
                <div>
                  <p className="text-card leading-5 font-semibold text-primary">{t}</p>
                  <p className="text-body text-muted">{d}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex flex-col gap-1 rounded-sm bg-white p-2 shadow-card">
        <p className="flex items-center gap-2 text-caption font-semibold text-tertiary uppercase">
          <Icon name="shield" /> Security Advisory
        </p>
        <p className="text-body text-muted">
          Approvals require active corporate email domains. Registrations using generic free mailers (e.g., Gmail, Yahoo) undergo manual screening taking 48-72
          hours.
        </p>
      </div>
    </aside>
  );
}

function FormCard({ title, stage, children }: { title: string; stage: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-lg bg-white p-6 shadow-pop sm:p-8">
      <div className="flex items-center justify-between pb-1">
        <h3 className="font-display text-title font-semibold text-primary">{title}</h3>
        <span className="text-caption font-semibold text-muted">{stage}</span>
      </div>
      {children}
    </div>
  );
}

const Alert = ({ text }: { text: string }) =>
  text ? (
    <p role="alert" className="rounded-xs bg-error-container px-3 py-2 text-body text-on-error-container">
      {text}
    </p>
  ) : null;

type Recruiter = {
  company: { name: string; website: string; category: string; sector: string; postal_address: string };
  name: string;
  email: string;
  password: string;
  contact: { designation: string; phone: string };
};

function RecruiterFlow() {
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [d, setD] = useState<Recruiter>({
    company: { name: "", website: "", category: "", sector: "", postal_address: "" },
    name: "",
    email: "",
    password: "",
    contact: { designation: "", phone: "" },
  });
  const co = (k: keyof Recruiter["company"]) => ({
    value: d.company[k],
    onChange: (e: { target: { value: string } }) => setD({ ...d, company: { ...d.company, [k]: e.target.value } }),
  });
  const ct = (k: keyof Recruiter["contact"]) => ({
    value: d.contact[k],
    onChange: (e: { target: { value: string } }) => setD({ ...d, contact: { ...d.contact, [k]: e.target.value } }),
  });

  async function next(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    if (step < 2) return setStep(step + 1);
    setBusy(true);
    try {
      const { company } = d;
      await call(
        api.POST("/api/v1/auth/register/recruiter", {
          body: {
            email: d.email,
            password: d.password,
            name: d.name,
            company: {
              name: company.name,
              website: company.website || undefined,
              category: (company.category || undefined) as never,
              sector: company.sector || undefined,
              postal_address: company.postal_address || undefined,
            },
            contact: { designation: d.contact.designation || undefined, phone: d.contact.phone || undefined },
          },
        }),
      );
      setStep(3);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid w-full gap-5 lg:grid-cols-[389px_1fr]">
      <SidePanel
        icon="badge"
        title="Recruiter Onboarding"
        sub="JNF & INF Access Workflow"
        text="Authorized representatives from corporate entities, Public Sector Undertakings (PSUs), and research organizations may register to initiate recruitment cycles."
        step={step}
        steps={STEPS}
      />
      {step === 3 ? (
        <VerifyOtp email={d.email} />
      ) : (
        <form onSubmit={next} className="h-full">
          <FormCard title={[`Step 1: Organisation Information`, `Step 2: Sector & Domain`, `Step 3: Contact Authority`][step]} stage={`Stage ${step + 1} of 4`}>
            <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
              {step === 0 && (
                <>
                  <Field label="Organisation Legal Name *">
                    <Input required minLength={2} placeholder="e.g. Larsen & Toubro Limited" {...co("name")} />
                  </Field>
                  <Field label="Official Website *">
                    <Input required type="url" placeholder="https://www.larsentoubro.com" {...co("website")} />
                  </Field>
                  <Field label="Corporate Category *">
                    <Select required {...co("category")}>
                      <option value="">Select Organisation Type</option>
                      {CATEGORIES.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </>
              )}
              {step === 1 && (
                <>
                  <Field label="Industry Sector *">
                    <Input required maxLength={100} placeholder="e.g. IT Services, Core Engineering" {...co("sector")} />
                  </Field>
                  <Field label="Registered Office Address">
                    <Input maxLength={500} placeholder="City, State" {...co("postal_address")} />
                  </Field>
                </>
              )}
              {step === 2 && (
                <>
                  <Field label="Contact Person Name *">
                    <Input required minLength={2} autoComplete="name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
                  </Field>
                  <Field label="Designation">
                    <Input placeholder="e.g. Campus Hiring Lead" {...ct("designation")} />
                  </Field>
                  <Field label="Official Email *" hint="Use your company domain for faster approval.">
                    <Input required type="email" autoComplete="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} />
                  </Field>
                  <Field label="Phone">
                    <Input type="tel" maxLength={20} {...ct("phone")} />
                  </Field>
                  <Field label="Create Password *" hint="At least 8 characters.">
                    <Input
                      required
                      type="password"
                      minLength={8}
                      autoComplete="new-password"
                      value={d.password}
                      onChange={(e) => setD({ ...d, password: e.target.value })}
                    />
                  </Field>
                </>
              )}
            </div>
            <Alert text={err} />
            <div className="flex justify-end gap-2 pt-3">
              {step > 0 && (
                <Button type="button" variant="ghost" size="lg" className="text-body!" onClick={() => setStep(step - 1)}>
                  Back
                </Button>
              )}
              <Button type="submit" size="lg" busy={busy} className="text-body!">
                {["Next: Sector & Domain", "Next: Contact Authority", "Submit & Send Code"][step]}
                <Icon name="arrow_forward" />
              </Button>
            </div>
          </FormCard>
        </form>
      )}
    </div>
  );
}

function StudentFlow() {
  const { data: programmes } = useSWR("programmes", () => call(api.GET("/api/v1/programmes")));
  const [email, setEmail] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setErr("");
    setBusy(true);
    try {
      await call(
        api.POST("/api/v1/auth/register/student", {
          body: {
            name: f.name,
            enrolment_no: f.enrolment_no.toUpperCase(),
            email: f.email,
            mobile: f.mobile,
            password: f.password,
            programme_id: f.programme_id || undefined,
          },
        }),
      );
      setEmail(f.email);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid w-full gap-5 lg:grid-cols-[389px_1fr]">
      <SidePanel
        icon="school"
        title="Student Enrolment"
        sub="TU Inbox Verification Workflow"
        text="Currently enrolled Tezpur University students register with their official university email. Imported students set their first password from the sign-in page instead."
        step={email ? 1 : 0}
        steps={[
          ["Academic Identity", "Enrolment number & programme"],
          ["Email Verification", "6-digit code to your TU inbox"],
          ["Sign in", "Active as soon as your email is verified"],
        ]}
      />
      {email ? (
        <VerifyOtp email={email} />
      ) : (
        <form onSubmit={submit} className="h-full">
          <FormCard title="Step 1: Academic Identity" stage="Stage 1 of 3">
            <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
              <Field label="Full Name *">
                <Input name="name" required minLength={2} autoComplete="name" placeholder="As on university records" />
              </Field>
              <Field label="Enrolment Number *" hint="e.g. CSB21045">
                <Input name="enrolment_no" required pattern="[A-Za-z]{3}\d{5,6}" placeholder="CSB21045" />
              </Field>
              <Field label="University Email *">
                <Input name="email" type="email" required autoComplete="email" placeholder="csb21045@tezu.ac.in" />
              </Field>
              <Field label="Mobile *">
                <Input name="mobile" type="tel" required pattern="\+?\d{10,13}" autoComplete="tel" placeholder="9876543210" />
              </Field>
              <Field label="Programme">
                <Select name="programme_id" defaultValue="">
                  <option value="">{programmes ? "Select programme" : "Loading programmes…"}</option>
                  {programmes?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Create Password *" hint="At least 8 characters.">
                <Input name="password" type="password" required minLength={8} autoComplete="new-password" />
              </Field>
            </div>
            <Alert text={err} />
            <div className="flex justify-end pt-3">
              <Button type="submit" size="lg" busy={busy} className="text-body!">
                Register & Send Code <Icon name="arrow_forward" />
              </Button>
            </div>
          </FormCard>
        </form>
      )}
    </div>
  );
}

function VerifyOtp({ email }: { email: string }) {
  const [done, setDone] = useState<"active" | "pending_admin" | "pending_email_verify" | null>(null);
  const [msg, setMsg] = useState({ tone: "", text: "" });
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      setMsg({ tone: "ok", text: ok });
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (done === "active")
    return (
      <FormCard title="Your account is active" stage="Complete">
        <div className="flex items-start gap-3 rounded-sm bg-primary-fixed p-4 text-primary">
          <Icon name="verified" className="text-[24px]" />
          <p className="text-body">Email verified. Your account is active, sign in with {email} or your enrolment number.</p>
        </div>
        <Link href="/login" className="w-fit rounded-xs bg-primary px-5 py-3 text-body font-semibold text-white">
          Sign in
        </Link>
      </FormCard>
    );
  if (done)
    return (
      <FormCard title="Submitted for TPO verification" stage="Complete">
        <div className="flex items-start gap-3 rounded-sm bg-primary-fixed p-4 text-primary">
          <Icon name="hourglass_top" className="text-[24px]" />
          <p className="text-body">
            Email verified. Your account is awaiting T&amp;P approval. You can sign in once it&apos;s approved; we&apos;ll email {email}.
          </p>
        </div>
      </FormCard>
    );

  return (
    <form
      className="h-full"
      onSubmit={(e) => {
        e.preventDefault();
        const code = String(new FormData(e.currentTarget).get("code"));
        act(async () => setDone((await call(api.POST("/api/v1/auth/verify-otp", { body: { email, code } }))).status), "Verified.");
      }}
    >
      <FormCard title="Verify your email" stage="Final stage">
        <p className="text-body text-muted">
          We sent a 6-digit code to <b className="text-ink">{email}</b>.
        </p>
        <Field label="Verification Code *" className="max-w-xs">
          <Input name="code" required inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" />
        </Field>
        {msg.tone === "error" ? <Alert text={msg.text} /> : msg.text && <p className="text-body text-primary">{msg.text}</p>}
        <div className="flex justify-end gap-2 pt-3">
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="text-body!"
            disabled={busy}
            onClick={() => act(() => call(api.POST("/api/v1/auth/resend-otp", { body: { email } })), "A new code has been sent.")}
          >
            Resend code
          </Button>
          <Button type="submit" size="lg" busy={busy} className="text-body!">
            Verify & Submit <Icon name="arrow_forward" />
          </Button>
        </div>
      </FormCard>
    </form>
  );
}
