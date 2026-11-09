"use client";

import useSWR from "swr";
import { Badge, Field, Input, Select, cx } from "@/components/ui";
import { api, call } from "@/lib/api";

export type Gender = "female" | "male" | "other" | "unspecified";

/** Mirrors the backend StudentFilter: an empty list or null means "no restriction". */
export type StudentFilter = {
  departments: string[];
  programme_ids: string[];
  batches: number[];
  min_cgpa: number | null;
  max_cgpa: number | null;
  placed: boolean | null;
  /** female / male / other / unspecified */
  genders: Gender[];
  /** Roster only: a notice cannot store these. */
  categories: string[];
  probation: boolean | null;
  profile_complete: boolean | null;
  /** Has set a password, i.e. has made an account on the portal. */
  account_claimed: boolean | null;
};

/** What a notice can store: the filter without the roster-only criteria. */
export const noticeTarget = ({ departments, programme_ids, batches, min_cgpa, max_cgpa, placed, genders }: StudentFilter) => ({
  departments,
  programme_ids,
  batches,
  min_cgpa,
  max_cgpa,
  placed,
  genders,
});

export const EMPTY_FILTER: StudentFilter = {
  departments: [],
  programme_ids: [],
  batches: [],
  min_cgpa: null,
  max_cgpa: null,
  placed: null,
  genders: [],
  categories: [],
  probation: null,
  profile_complete: null,
  account_claimed: null,
};

export const isTargeted = (f: StudentFilter) =>
  f.departments.length > 0 ||
  f.programme_ids.length > 0 ||
  f.batches.length > 0 ||
  f.min_cgpa !== null ||
  f.max_cgpa !== null ||
  f.placed !== null ||
  f.genders.length > 0 ||
  f.categories.length > 0 ||
  f.probation !== null ||
  f.profile_complete !== null ||
  f.account_claimed !== null;

/** Query params for the API: empty criteria are left out (arrays go out as repeated keys). */
export const filterQuery = (f: StudentFilter) => ({
  departments: f.departments.length ? f.departments : undefined,
  programme_ids: f.programme_ids.length ? f.programme_ids : undefined,
  batches: f.batches.length ? f.batches : undefined,
  min_cgpa: f.min_cgpa ?? undefined,
  max_cgpa: f.max_cgpa ?? undefined,
  placed: f.placed ?? undefined,
  genders: f.genders.length ? f.genders : undefined,
  categories: f.categories.length ? f.categories : undefined,
  probation: f.probation ?? undefined,
  profile_complete: f.profile_complete ?? undefined,
  account_claimed: f.account_claimed ?? undefined,
});

export const useProgrammes = () => useSWR("programmes", () => call(api.GET("/api/v1/programmes")));

const thisYear = new Date().getFullYear();
const BATCHES = Array.from({ length: 7 }, (_, i) => thisYear - 2 + i);
/** Quick CGPA bands for the last step of the filter. */
const BANDS: { label: string; min: number | null; max: number | null }[] = [
  { label: "9 and above", min: 9, max: null },
  { label: "8 and above", min: 8, max: null },
  { label: "7 and above", min: 7, max: null },
  { label: "Below 7", min: null, max: 6.99 },
];

const GENDER_OPTIONS = [
  { v: "female", label: "Female" },
  { v: "male", label: "Male" },
  { v: "other", label: "Other" },
  { v: "unspecified", label: "Not recorded" },
];
const CATEGORY_OPTIONS = ["General", "OBC", "SC", "ST", "EWS"]
  .map((c) => ({ v: c.toLowerCase(), label: c }))
  .concat({ v: "unspecified", label: "Not recorded" });
const triState = (v: boolean | null) => (v === null ? "" : String(v));
const fromTri = (v: string) => (v === "" ? null : v === "true");

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
const num = (s: string) => (s.trim() === "" ? null : Number(s));

function Chips<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { v: T; label: string }[];
  value: T[];
  onChange: (v: T[]) => void;
}) {
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

/** Department > programme > batch > gender > CGPA > placed. `basic` keeps only the first three (notice history accepts no more); `roster` adds who-they-are and account filters a notice cannot store. */
export function StudentFilterFields({
  value,
  onChange,
  basic,
  roster,
}: {
  value: StudentFilter;
  onChange: (f: StudentFilter) => void;
  basic?: boolean;
  roster?: boolean;
}) {
  const progs = useProgrammes();
  const list = progs.data ?? [];
  const departments = [...new Set(list.map((p) => p.department))].sort();
  // Each step narrows the next: programmes shown are those of the chosen departments.
  const shown = value.departments.length ? list.filter((p) => value.departments.includes(p.department)) : list;
  const set = (patch: Partial<StudentFilter>) => onChange({ ...value, ...patch });
  const setDepartments = (departments: string[]) =>
    set({
      departments,
      programme_ids: value.programme_ids.filter((id) => !departments.length || departments.includes(list.find((p) => p.id === id)?.department ?? "")),
    });
  return (
    <div className="flex flex-col gap-3">
      <Chips label="1. Department" options={departments.map((d) => ({ v: d, label: d }))} value={value.departments} onChange={setDepartments} />
      <Chips
        label={value.departments.length ? "2. Programme in these departments" : "2. Programme"}
        options={shown.map((p) => ({ v: p.id, label: `${p.code} · ${p.name}` }))}
        value={value.programme_ids}
        onChange={(programme_ids) => set({ programme_ids })}
      />
      <Chips
        label="3. Batch (year of completion)"
        options={BATCHES.map((y) => ({ v: y, label: String(y) }))}
        value={value.batches}
        onChange={(batches) => set({ batches })}
      />
      {!basic && <Chips label="4. Gender" options={GENDER_OPTIONS} value={value.genders} onChange={(genders) => set({ genders: genders as Gender[] })} />}
      {!basic && (
        <>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="pb-1.5 text-label font-semibold text-ink">5. CGPA</legend>
            <div className="flex flex-wrap gap-1.5">
              {BANDS.map((b) => {
                const on = value.min_cgpa === b.min && value.max_cgpa === b.max;
                return (
                  <button
                    key={b.label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set(on ? { min_cgpa: null, max_cgpa: null } : { min_cgpa: b.min, max_cgpa: b.max })}
                    className={cx(
                      "min-h-8 rounded-xs px-2.5 py-1 text-caption font-semibold cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                      on ? "bg-primary text-white" : "bg-surface-high text-ink hover:bg-surface-highest",
                    )}
                  >
                    {b.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Min CGPA">
              <Input
                type="number"
                step="0.01"
                min="0"
                max="10"
                inputMode="decimal"
                value={value.min_cgpa ?? ""}
                onChange={(e) => set({ min_cgpa: num(e.target.value) })}
              />
            </Field>
            <Field label="Max CGPA">
              <Input
                type="number"
                step="0.01"
                min="0"
                max="10"
                inputMode="decimal"
                value={value.max_cgpa ?? ""}
                onChange={(e) => set({ max_cgpa: num(e.target.value) })}
              />
            </Field>
            <Field label="Placement" className="col-span-2 sm:col-span-1">
              <Select
                value={value.placed === null ? "" : String(value.placed)}
                onChange={(e) => set({ placed: e.target.value === "" ? null : e.target.value === "true" })}
              >
                <option value="">Any</option>
                <option value="true">Placed</option>
                <option value="false">Not placed</option>
              </Select>
            </Field>
          </div>
        </>
      )}
      {roster && (
        <>
          <Chips label="Social category" options={CATEGORY_OPTIONS} value={value.categories} onChange={(categories) => set({ categories })} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Portal account">
              <Select value={triState(value.account_claimed)} onChange={(e) => set({ account_claimed: fromTri(e.target.value) })}>
                <option value="">Any</option>
                <option value="true">Joined the portal</option>
                <option value="false">Not joined yet</option>
              </Select>
            </Field>
            <Field label="Standing">
              <Select value={triState(value.probation)} onChange={(e) => set({ probation: fromTri(e.target.value) })}>
                <option value="">Any</option>
                <option value="false">Good standing</option>
                <option value="true">On probation</option>
              </Select>
            </Field>
            <Field label="Profile">
              <Select value={triState(value.profile_complete)} onChange={(e) => set({ profile_complete: fromTri(e.target.value) })}>
                <option value="">Any</option>
                <option value="true">Complete</option>
                <option value="false">Incomplete</option>
              </Select>
            </Field>
          </div>
        </>
      )}
    </div>
  );
}

/** Human labels for a filter (or a notice's stored targeting), one chip per criterion value. */
export function FilterChips({
  f: filter,
  programmes,
}: {
  f: Omit<Partial<StudentFilter>, "genders"> & { genders?: string[] } & Pick<
      StudentFilter,
      "departments" | "programme_ids" | "batches" | "min_cgpa" | "max_cgpa" | "placed"
    >;
  programmes: { id: string; code: string }[] | undefined;
}) {
  const f = { ...EMPTY_FILTER, ...filter } as StudentFilter;
  const chips = [
    ...f.departments,
    ...f.programme_ids.map((id) => programmes?.find((p) => p.id === id)?.code ?? "Programme"),
    ...f.batches.map((b) => `Batch ${b}`),
    ...f.genders.map((g) => GENDER_OPTIONS.find((o) => o.v === g)?.label ?? g),
    ...f.categories.map((c) => CATEGORY_OPTIONS.find((o) => o.v === c)?.label ?? c),
    f.account_claimed !== null && (f.account_claimed ? "Joined portal" : "Not joined yet"),
    f.probation !== null && (f.probation ? "On probation" : "Good standing"),
    f.profile_complete !== null && (f.profile_complete ? "Profile complete" : "Profile incomplete"),
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
