"use client";

import useSWR from "swr";
import { Badge, Field, Input, Select, cx } from "@/components/ui";
import { api, call } from "@/lib/api";

/** Mirrors the backend StudentFilter: an empty list or null means "no restriction". */
export type StudentFilter = {
  departments: string[];
  programme_ids: string[];
  batches: number[];
  min_cgpa: number | null;
  max_cgpa: number | null;
  placed: boolean | null;
};

export const EMPTY_FILTER: StudentFilter = { departments: [], programme_ids: [], batches: [], min_cgpa: null, max_cgpa: null, placed: null };

export const isTargeted = (f: StudentFilter) =>
  f.departments.length > 0 || f.programme_ids.length > 0 || f.batches.length > 0 || f.min_cgpa !== null || f.max_cgpa !== null || f.placed !== null;

/** Query params for the API: empty criteria are left out (arrays go out as repeated keys). */
export const filterQuery = (f: StudentFilter) => ({
  departments: f.departments.length ? f.departments : undefined,
  programme_ids: f.programme_ids.length ? f.programme_ids : undefined,
  batches: f.batches.length ? f.batches : undefined,
  min_cgpa: f.min_cgpa ?? undefined,
  max_cgpa: f.max_cgpa ?? undefined,
  placed: f.placed ?? undefined,
});

export const useProgrammes = () => useSWR("programmes", () => call(api.GET("/api/v1/programmes")));

const thisYear = new Date().getFullYear();
const BATCHES = Array.from({ length: 7 }, (_, i) => thisYear - 2 + i);

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
const num = (s: string) => (s.trim() === "" ? null : Number(s));

function Chips<T extends string | number>({ label, options, value, onChange }: { label: string; options: { v: T; label: string }[]; value: T[]; onChange: (v: T[]) => void }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="pb-1.5 text-label font-semibold text-ink">
        {label}
        {value.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="ml-2 text-caption font-semibold text-primary underline cursor-pointer">
            clear
          </button>
        )}
      </legend>
      {options.length ? (
        <div className="flex flex-wrap gap-1.5">
          {options.map((o) => {
            const on = value.includes(o.v);
            return (
              <button
                key={o.v}
                type="button"
                aria-pressed={on}
                onClick={() => onChange(toggle(value, o.v))}
                className={cx(
                  "min-h-8 rounded-xs px-2.5 py-1 text-caption font-semibold cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  on ? "bg-primary text-white" : "bg-surface-high text-ink hover:bg-surface-highest",
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-caption text-muted">None defined yet.</p>
      )}
    </fieldset>
  );
}

/** Department / programme / batch / CGPA / placed controls. `basic` keeps only the first three (notice history accepts no more). */
export function StudentFilterFields({ value, onChange, basic }: { value: StudentFilter; onChange: (f: StudentFilter) => void; basic?: boolean }) {
  const progs = useProgrammes();
  const list = progs.data ?? [];
  const departments = [...new Set(list.map((p) => p.department))].sort();
  const set = (patch: Partial<StudentFilter>) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-col gap-3">
      <Chips label="Departments" options={departments.map((d) => ({ v: d, label: d }))} value={value.departments} onChange={(departments) => set({ departments })} />
      <Chips
        label="Programmes"
        options={list.map((p) => ({ v: p.id, label: `${p.code} · ${p.name}` }))}
        value={value.programme_ids}
        onChange={(programme_ids) => set({ programme_ids })}
      />
      <Chips label="Batch (year of completion)" options={BATCHES.map((y) => ({ v: y, label: String(y) }))} value={value.batches} onChange={(batches) => set({ batches })} />
      {!basic && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Min CGPA">
            <Input type="number" step="0.01" min="0" max="10" inputMode="decimal" value={value.min_cgpa ?? ""} onChange={(e) => set({ min_cgpa: num(e.target.value) })} />
          </Field>
          <Field label="Max CGPA">
            <Input type="number" step="0.01" min="0" max="10" inputMode="decimal" value={value.max_cgpa ?? ""} onChange={(e) => set({ max_cgpa: num(e.target.value) })} />
          </Field>
          <Field label="Placement" className="col-span-2 sm:col-span-1">
            <Select value={value.placed === null ? "" : String(value.placed)} onChange={(e) => set({ placed: e.target.value === "" ? null : e.target.value === "true" })}>
              <option value="">Any</option>
              <option value="true">Placed</option>
              <option value="false">Not placed</option>
            </Select>
          </Field>
        </div>
      )}
    </div>
  );
}

/** Human labels for a filter (or a notice's stored targeting), one chip per criterion value. */
export function FilterChips({ f, programmes }: { f: StudentFilter; programmes: { id: string; code: string }[] | undefined }) {
  const chips = [
    ...f.departments,
    ...f.programme_ids.map((id) => programmes?.find((p) => p.id === id)?.code ?? "Programme"),
    ...f.batches.map((b) => `Batch ${b}`),
    f.min_cgpa !== null && `CGPA ≥ ${f.min_cgpa}`,
    f.max_cgpa !== null && `CGPA ≤ ${f.max_cgpa}`,
    f.placed !== null && (f.placed ? "Placed" : "Not placed"),
  ].filter((c): c is string => !!c);
  if (!chips.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {chips.map((c) => (
        <Badge key={c} tone="info">
          {c}
        </Badge>
      ))}
    </span>
  );
}
