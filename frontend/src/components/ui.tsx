"use client";

import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { ApiError } from "@/lib/api";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Icon({ name, className, filled }: { name: string; className?: string; filled?: boolean }) {
  return (
    <span aria-hidden className={cx("icon select-none", className)} style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}>
      {name}
    </span>
  );
}

// Variants and sizes read off the Figma button layers (design/*.outline.txt).
const VARIANT = {
  primary: "bg-primary text-white hover:bg-primary-container",
  accent: "bg-accent text-on-accent hover:brightness-95",
  tertiary: "bg-tertiary text-white hover:brightness-110",
  soft: "bg-surface-high text-ink hover:bg-surface-highest",
  ghost: "bg-surface-low text-ink hover:bg-surface",
  danger: "bg-error-container text-on-error-container hover:brightness-95",
  white: "bg-white text-ink shadow-card hover:bg-surface-low",
};
const SIZE = { sm: "px-2 py-1 text-caption", md: "px-3 py-2 text-label", lg: "px-5 py-3 text-body-lg font-semibold" };

export function Button({
  variant = "primary",
  size = "md",
  icon,
  busy,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANT;
  size?: keyof typeof SIZE;
  icon?: string;
  busy?: boolean;
}) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={cx(
        "inline-flex items-center justify-center gap-1 rounded-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent cursor-pointer",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
    >
      {busy ? <Icon name="progress_activity" className="animate-spin" /> : icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

const TONE = {
  primary: "bg-primary text-white",
  soft: "bg-surface-high text-ink",
  muted: "bg-surface text-muted",
  accent: "bg-accent text-on-accent",
  warn: "bg-tertiary-fixed text-on-accent",
  error: "bg-error-container text-on-error-container",
  info: "bg-primary-fixed text-primary",
};
export type Tone = keyof typeof TONE;

export function Badge({ tone = "soft", icon, className, children }: { tone?: Tone; icon?: string; className?: string; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-xs px-2 py-0.5 text-caption font-semibold", TONE[tone], className)}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx("rounded-lg bg-white shadow-card", className)}>{children}</section>;
}

/** Small uppercase overline used above most headings in the design. */
export function Eyebrow({ children, dot, className }: { children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <p className={cx("flex items-center gap-1.5 text-caption font-bold text-tertiary", className)}>
      {dot && <span className="size-1.5 rounded-full bg-accent" />}
      {children}
    </p>
  );
}

export function Field({ label, error, hint, className, children }: { label: string; error?: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <label className={cx("flex flex-col gap-1.5", className)}>
      <span className="text-label font-semibold text-ink">{label}</span>
      {children}
      {error ? <span className="text-caption text-error">{error}</span> : hint && <span className="text-caption text-muted">{hint}</span>}
    </label>
  );
}

const control =
  "w-full rounded-xs bg-white px-3 py-2 text-[14px] leading-[17px] text-ink shadow-card placeholder:text-muted/70 focus:outline-2 focus:outline-primary disabled:opacity-60";

export function Input({ className, type, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  const [shown, setShown] = useState(false);
  if (type !== "password") return <input {...p} type={type} className={cx(control, "h-9", className)} />;
  // every password field gets a show/hide eye
  return (
    <span className="relative block">
      <input {...p} type={shown ? "text" : "password"} className={cx(control, "h-9 pr-10", className)} />
      <button
        type="button"
        onClick={() => setShown(!shown)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-primary"
      >
        <Icon name={shown ? "visibility_off" : "visibility"} />
      </button>
    </span>
  );
}
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx(control, className)} />;
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(control, "h-9", className)} />;

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { id: T; label: string; icon?: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cx("flex flex-wrap items-center gap-1", className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            "inline-flex items-center gap-1.5 rounded-xs px-3 py-2 text-body font-semibold cursor-pointer",
            value === t.id ? "bg-white text-primary shadow-card" : "text-muted hover:text-ink",
          )}
        >
          {t.icon && <Icon name={t.icon} />}
          {t.label}
          {t.count !== undefined && (
            <span className={cx("rounded-xs px-1.5 text-caption", value === t.id ? "bg-accent text-on-accent" : "bg-surface-high text-ink")}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/** Loading / error / empty wrapper: every data block renders through this. */
export function State<T>({
  data,
  error,
  isLoading,
  empty,
  retry,
  rows = 3,
  children,
}: {
  data: T | undefined;
  error?: unknown;
  isLoading?: boolean;
  empty?: (d: T) => boolean;
  retry?: () => void;
  rows?: number;
  children: (d: T) => ReactNode;
}) {
  if (error)
    return (
      <div role="alert" className="flex items-center justify-between gap-3 rounded-xs bg-error-container px-4 py-3 text-body text-on-error-container">
        <span className="flex items-center gap-2">
          <Icon name="error" />
          {error instanceof ApiError ? error.message : "Something went wrong."}
        </span>
        {retry && (
          <Button size="sm" variant="white" onClick={retry}>
            Retry
          </Button>
        )}
      </div>
    );
  if (isLoading || data === undefined)
    return (
      <div aria-busy className="flex flex-col gap-2">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-xs bg-surface-low" />
        ))}
      </div>
    );
  if (empty?.(data)) return <Empty />;
  return <>{children(data)}</>;
}

export function Empty({ icon = "inbox", text = "Nothing here yet." }: { icon?: string; text?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xs bg-surface-low px-4 py-8 text-center text-body text-muted">
      <Icon name={icon} className="text-[24px]" />
      {text}
    </div>
  );
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^[a-z]/i.test(w))
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export { cx };

/** busy/message state for one-off actions: run("key", fn, "Done.") */
export function useRun() {
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  async function run(key: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg({ tone: "ok", text: ok });
      return true;
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "Something went wrong." });
      return false;
    } finally {
      setBusy("");
    }
  }
  return { busy, msg, setMsg, run };
}

export function Notice({ msg }: { msg: { tone: "ok" | "err"; text: string } | null }) {
  if (!msg) return null;
  return (
    <p
      role={msg.tone === "err" ? "alert" : "status"}
      className={cx("rounded-xs px-3 py-2 text-body", msg.tone === "ok" ? "bg-primary-fixed text-primary" : "bg-error-container text-on-error-container")}
    >
      {msg.text}
    </p>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div
      role="dialog"
      aria-modal
      aria-label={title}
      className="fixed inset-0 z-50 grid place-items-center bg-primary/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={cx("flex max-h-[90vh] w-full flex-col gap-4 overflow-y-auto rounded-lg bg-white p-6 shadow-pop", wide ? "max-w-2xl" : "max-w-lg")}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-title font-semibold text-primary">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-muted cursor-pointer">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Page heading used by the admin sub-pages, in the console's header style. */
export function PageHead({ eyebrow, title, sub, children }: { eyebrow: string; title: string; sub: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-3 pb-1 md:flex-row md:items-end">
      <div>
        <p className="flex items-center gap-2 text-body font-semibold text-muted">
          <span className="size-2 rounded-xl bg-accent" /> {eyebrow}
        </p>
        <h1 className="pt-1 font-display text-headline font-bold text-primary">{title}</h1>
        <p className="text-[14px] leading-5 text-muted">{sub}</p>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function SectionTitle({ icon, title, sub, children }: { icon: string; title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
      <div className="flex gap-2">
        <Icon name={icon} className="pt-0.5 text-[20px] text-primary" />
        <div>
          <h2 className="font-display text-title font-semibold text-primary">{title}</h2>
          {sub && <p className="text-body text-muted">{sub}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
