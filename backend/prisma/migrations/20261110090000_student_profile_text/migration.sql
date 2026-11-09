-- Profile text fields carried by the T&P profile sheet. Optional, additive only.
ALTER TABLE "students"
  ADD COLUMN "specialization" TEXT,
  ADD COLUMN "career_interests" TEXT,
  ADD COLUMN "technical_skills" TEXT,
  ADD COLUMN "extracurriculars" TEXT,
  ADD COLUMN "about_me" TEXT;
