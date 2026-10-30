import type { Tx } from "../../infrastructure/db.js";

/** Every recruiter query goes through this: a company only ever sees its own postings. */
export const own = (companyId: string, id?: string) => ({ company_id: companyId, ...(id ? { id } : {}) });

export const findOwn = (tx: Tx, companyId: string, id: string) => tx.opportunity.findFirst({ where: own(companyId, id) });

/** What a student may see: approved and not past its deadline. */
export const openWhere = (now = new Date()) => ({ status: "approved" as const, apply_deadline: { gt: now } });
