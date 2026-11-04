// THE student filter. The roster search, notice targeting, notice e-mail recipients and the noticeboard
// all read it, so "department X, batch 2026, CGPA >= 7" means the same thing everywhere.
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client.js";

/** A query-string value may arrive once (string) or repeated (array). */
const many = <T extends z.ZodType>(item: T) =>
  z.preprocess((v) => (v === undefined || v === "" ? [] : Array.isArray(v) ? v : String(v).split(",")), z.array(item).max(100));

/** Empty list / null = that criterion does not restrict. */
export const StudentFilter = z.object({
  departments: many(z.string().trim().min(1).max(200)).default([]),
  programme_ids: many(z.uuid()).default([]),
  batches: many(z.coerce.number().int().min(1990).max(2100)).default([]),
  min_cgpa: z.coerce.number().min(0).max(10).nullable().default(null),
  max_cgpa: z.coerce.number().min(0).max(10).nullable().default(null),
  /** Placed = has a selected application. */
  placed: z.union([z.boolean(), z.stringbool()]).nullable().default(null),
});
export type StudentFilter = z.output<typeof StudentFilter>;

export const isTargeted = (f: StudentFilter) =>
  f.departments.length > 0 || f.programme_ids.length > 0 || f.batches.length > 0 || f.min_cgpa !== null || f.max_cgpa !== null || f.placed !== null;

/** Department matches the student's own department field or their programme's school. */
export function studentWhere(f: StudentFilter): Prisma.StudentWhereInput {
  const and: Prisma.StudentWhereInput[] = [];
  if (f.departments.length)
    and.push({ OR: [{ department: { in: f.departments } }, { programme: { department: { in: f.departments } } }] });
  if (f.programme_ids.length) and.push({ programme_id: { in: f.programme_ids } });
  if (f.batches.length) and.push({ year_of_completion: { in: f.batches } });
  if (f.min_cgpa !== null) and.push({ cgpa: { gte: f.min_cgpa } });
  if (f.max_cgpa !== null) and.push({ cgpa: { lte: f.max_cgpa } });
  if (f.placed !== null) and.push({ applications: f.placed ? { some: { status: "selected" } } : { none: { status: "selected" } } });
  return { AND: and };
}

export type StudentFacts = { departments: string[]; programme_id: string | null; year_of_completion: number | null; cgpa: number | null; placed: boolean };

/** Notices this student is in the audience of. Mirrors studentWhere from the notice's side. */
export function noticeWhereFor(s: StudentFacts): Prisma.NoticeWhereInput {
  return {
    AND: [
      s.departments.length ? { OR: [{ departments: { isEmpty: true } }, { departments: { hasSome: s.departments } }] } : { departments: { isEmpty: true } },
      s.programme_id ? { OR: [{ programme_ids: { isEmpty: true } }, { programme_ids: { has: s.programme_id } }] } : { programme_ids: { isEmpty: true } },
      s.year_of_completion ? { OR: [{ batches: { isEmpty: true } }, { batches: { has: s.year_of_completion } }] } : { batches: { isEmpty: true } },
      s.cgpa !== null ? { OR: [{ min_cgpa: null }, { min_cgpa: { lte: s.cgpa } }] } : { min_cgpa: null },
      s.cgpa !== null ? { OR: [{ max_cgpa: null }, { max_cgpa: { gte: s.cgpa } }] } : { max_cgpa: null },
      { OR: [{ placed: null }, { placed: s.placed }] },
    ],
  };
}

/** Both the student's own department and their programme's school count, same as studentWhere's OR. */
export const factsForNotices = (
  s: { department: string | null; programme_id: string | null; year_of_completion: number | null; cgpa: number | null; programme?: { department: string } | null },
  placed: boolean,
): StudentFacts => ({
  placed,
  departments: [s.department, s.programme?.department].filter((d): d is string => !!d),
  programme_id: s.programme_id,
  year_of_completion: s.year_of_completion,
  cgpa: s.cgpa,
});
