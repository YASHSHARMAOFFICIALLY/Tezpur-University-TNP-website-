// THE student filter. The roster search, notice targeting, notice e-mail recipients and the noticeboard
// all read it, so "department X, batch 2026, CGPA >= 7" means the same thing everywhere.
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client.js";

/** A query-string value may arrive once (string) or repeated (array). */
const many = <T extends z.ZodType>(item: T) =>
  z.preprocess((v) => (v === undefined || v === "" ? [] : Array.isArray(v) ? v : String(v).split(",")), z.array(item).max(100));

export const GENDERS = ["female", "male", "other", "unspecified"] as const;
const FEMALE = ["f", "female", "woman", "girl"];
const MALE = ["m", "male", "man", "boy"];
/** Gender is free text on the profile ("F", "Female"...): everything maps onto these four keys, blank = unspecified. */
export const genderKey = (g: string | null | undefined): (typeof GENDERS)[number] => {
  const t = g?.trim().toLowerCase();
  return !t ? "unspecified" : FEMALE.includes(t) ? "female" : MALE.includes(t) ? "male" : "other";
};
const bool = z.union([z.boolean(), z.stringbool()]).nullable().default(null);

/** Empty list / null = that criterion does not restrict. Everything here can be stored on a notice. */
export const NoticeTarget = z.object({
  departments: many(z.string().trim().min(1).max(200)).default([]),
  programme_ids: many(z.uuid()).default([]),
  batches: many(z.coerce.number().int().min(1990).max(2100)).default([]),
  min_cgpa: z.coerce.number().min(0).max(10).nullable().default(null),
  max_cgpa: z.coerce.number().min(0).max(10).nullable().default(null),
  /** Placed = has a selected application. */
  placed: bool,
  genders: many(z.enum(GENDERS)).default([]),
});
export type NoticeTarget = z.output<typeof NoticeTarget>;

/** The roster adds criteria a notice cannot store (a notice board has to be re-evaluable from the notice alone). */
export const StudentFilter = NoticeTarget.extend({
  /** Matches the social category text case-insensitively; "unspecified" = none recorded. */
  categories: many(z.string().trim().min(1).max(50)).default([]),
  probation: bool,
  /** Complete = resume, photo, CGPA, programme, batch and date of birth all present (what applying requires). */
  profile_complete: bool,
  /** Imported students have no password until they set one (forgot-password): claimed = has an account they can log in to. */
  account_claimed: bool,
});
export type StudentFilter = z.output<typeof StudentFilter>;

export const isTargeted = (f: NoticeTarget) =>
  f.departments.length > 0 || f.programme_ids.length > 0 || f.batches.length > 0 || f.min_cgpa !== null || f.max_cgpa !== null || f.placed !== null || f.genders.length > 0;

const COMPLETE: Prisma.StudentWhereInput = { resume_file_id: { not: null }, photo_file_id: { not: null }, cgpa: { not: null }, programme_id: { not: null }, year_of_completion: { not: null }, dob: { not: null } };
const KNOWN = [...FEMALE, ...MALE];
const genderWhere = (k: (typeof GENDERS)[number]): Prisma.StudentWhereInput =>
  k === "female" ? { gender: { in: FEMALE, mode: "insensitive" } }
  : k === "male" ? { gender: { in: MALE, mode: "insensitive" } }
  : k === "unspecified" ? { OR: [{ gender: null }, { gender: "" }] }
  : { AND: [{ gender: { not: null } }, { gender: { notIn: ["", ...KNOWN], mode: "insensitive" } }] };

/** Department matches the student's own department field or their programme's school. */
export function studentWhere(f: NoticeTarget & Partial<Pick<StudentFilter, "categories" | "probation" | "profile_complete" | "account_claimed">>): Prisma.StudentWhereInput {
  const and: Prisma.StudentWhereInput[] = [];
  if (f.departments.length)
    and.push({ OR: [{ department: { in: f.departments } }, { programme: { department: { in: f.departments } } }] });
  if (f.programme_ids.length) and.push({ programme_id: { in: f.programme_ids } });
  if (f.batches.length) and.push({ year_of_completion: { in: f.batches } });
  if (f.min_cgpa !== null) and.push({ cgpa: { gte: f.min_cgpa } });
  if (f.max_cgpa !== null) and.push({ cgpa: { lte: f.max_cgpa } });
  if (f.genders.length) and.push({ OR: f.genders.map(genderWhere) });
  if (f.categories?.length) {
    const named = f.categories.filter((c) => c !== "unspecified");
    and.push({ OR: [...(named.length ? [{ category: { in: named, mode: "insensitive" as const } }] : []), ...(f.categories.includes("unspecified") ? [{ OR: [{ category: null }, { category: "" }] }] : [])] });
  }
  if (f.probation != null) and.push({ academic_standing: f.probation ? "probation" : "good" });
  if (f.account_claimed != null) and.push({ user: { password_hash: f.account_claimed ? { not: "" } : "" } });
  if (f.profile_complete != null) and.push(f.profile_complete ? COMPLETE : { NOT: COMPLETE });
  if (f.placed !== null) and.push({ applications: f.placed ? { some: { status: "selected" } } : { none: { status: "selected" } } });
  return { AND: and };
}

export type StudentFacts = { gender: (typeof GENDERS)[number]; departments: string[]; programme_id: string | null; year_of_completion: number | null; cgpa: number | null; placed: boolean };

/** Notices this student is in the audience of. Mirrors studentWhere from the notice's side. */
export function noticeWhereFor(s: StudentFacts): Prisma.NoticeWhereInput {
  return {
    AND: [
      s.departments.length ? { OR: [{ departments: { isEmpty: true } }, { departments: { hasSome: s.departments } }] } : { departments: { isEmpty: true } },
      s.programme_id ? { OR: [{ programme_ids: { isEmpty: true } }, { programme_ids: { has: s.programme_id } }] } : { programme_ids: { isEmpty: true } },
      s.year_of_completion ? { OR: [{ batches: { isEmpty: true } }, { batches: { has: s.year_of_completion } }] } : { batches: { isEmpty: true } },
      s.cgpa !== null ? { OR: [{ min_cgpa: null }, { min_cgpa: { lte: s.cgpa } }] } : { min_cgpa: null },
      s.cgpa !== null ? { OR: [{ max_cgpa: null }, { max_cgpa: { gte: s.cgpa } }] } : { max_cgpa: null },
      { OR: [{ genders: { isEmpty: true } }, { genders: { has: s.gender } }] },
      { OR: [{ placed: null }, { placed: s.placed }] },
    ],
  };
}

/** Both the student's own department and their programme's school count, same as studentWhere's OR. */
export const factsForNotices = (
  s: { gender: string | null; department: string | null; programme_id: string | null; year_of_completion: number | null; cgpa: number | null; programme?: { department: string } | null },
  placed: boolean,
): StudentFacts => ({
  placed,
  gender: genderKey(s.gender),
  departments: [s.department, s.programme?.department].filter((d): d is string => !!d),
  programme_id: s.programme_id,
  year_of_completion: s.year_of_completion,
  cgpa: s.cgpa,
});
