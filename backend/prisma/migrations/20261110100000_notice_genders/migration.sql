-- Gender targeting for notices. Existing notices keep an empty list = everyone.
ALTER TABLE "notices" ADD COLUMN "genders" TEXT[] DEFAULT ARRAY[]::TEXT[];
UPDATE "notices" SET "genders" = ARRAY[]::TEXT[];
ALTER TABLE "notices" ALTER COLUMN "genders" SET NOT NULL;
