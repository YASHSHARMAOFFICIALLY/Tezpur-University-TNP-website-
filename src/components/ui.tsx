"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { ApiError } from "@/lib/api";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Icon({ name, className, filled }: { name: string; className?: string; filled?: boolean }) {
  return (
    <span
      aria-hidden
      className={cx("material-symbols-outlined select-none", className)}
      style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
    >
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
    <p className={cx("flex items-center gap-1.5 text-caption font-bold uppercase text-tertiary", className)}>
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

export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(control, "h-9", className)} />;
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
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export { cx };
