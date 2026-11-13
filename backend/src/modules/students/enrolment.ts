import type { Tx } from "../../infrastructure/db.js";

/**
 * The enrolment number names branch and batch: ECB24001 = programme ECB, admitted 2024,
 * finishing 2024 + the programme's length in years (4 when the programme or its length is unknown).
 * programme_id is undefined when no programme has that code yet; syncProgrammeStudents links them once it exists.
 */
export async function fromEnrolment(tx: Pick<Tx, "programme">, enrolment_no: string) {
  const m = /^([A-Za-z]{3})(\d{2})/.exec(enrolment_no);
  const year_of_admission = m && 2000 + Number(m[2]);
  // A future year means the digits aren't a batch (test or legacy numbers): derive nothing.
  if (!m || !year_of_admission || year_of_admission > new Date().getFullYear()) return {};
  const p = await tx.programme.findFirst({ where: { code: { equals: m[1], mode: "insensitive" } } });
  return { programme_id: p?.id, year_of_admission, year_of_completion: year_of_admission + (p?.year ?? 4) };
}

/**
 * After a programme is added or edited: every student whose enrolment starts with its code belongs to it
 * (even if they picked another at sign-up), and their finishing year follows its length.
 */
export const syncProgrammeStudents = (tx: Pick<Tx, "$executeRaw">, p: { id: string; code: string; year: number | null }) =>
  tx.$executeRaw`update students set programme_id = ${p.id}, year_of_completion = coalesce(year_of_admission + ${p.year ?? 4}, year_of_completion)
    where upper(left(enrolment_no, 3)) = upper(${p.code})`;
