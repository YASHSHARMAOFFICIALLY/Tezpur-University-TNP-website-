-- Backlog status asked for by the T&P cell: counts of active and cleared backlogs. Optional (NULL = not provided / not applicable), additive only.
ALTER TABLE "students"
  ADD COLUMN "active_backlogs" INTEGER,
  ADD COLUMN "cleared_backlogs" INTEGER;
