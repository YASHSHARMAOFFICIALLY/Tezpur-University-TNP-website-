import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  // Compiled because the image has no src/ (npm run build). Dev seeds with `npm run seed`.
  migrations: { path: "prisma/migrations", seed: "node dist/prisma/seed.js" },
  datasource: { url: env("DATABASE_URL") },
});
