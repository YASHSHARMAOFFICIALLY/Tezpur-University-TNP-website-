import type { Tx } from "../../infrastructure/db.js";

export const profileInclude = { user: { select: { name: true, email: true, status: true } } } as const;

export const findProfile = (client: Tx, userId: string) =>
  client.student.findUniqueOrThrow({ where: { user_id: userId }, include: profileInclude });
