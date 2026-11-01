// THE module list. Router, OpenAPI document and job worker are all derived from it.
import { sendEmail } from "../infrastructure/mailer.js";
import type { ModuleDef } from "../http/route.js";
import { adminModule } from "./admin/admin.routes.js";
import { applicationsModule } from "./applications/applications.routes.js";
import { authModule } from "./auth/auth.routes.js";
import { contentModule } from "./content/content.routes.js";
import { eventsModule } from "./events/events.routes.js";
import { opportunitiesModule } from "./opportunities/opportunities.routes.js";
import { settingsModule } from "./settings/settings.routes.js";
import { studentsModule } from "./students/students.routes.js";
import { systemModule } from "./system/system.routes.js";

export const modules: readonly ModuleDef[] = [
  { name: "core", routes: [], jobs: [sendEmail] },
  authModule,
  studentsModule,
  opportunitiesModule,
  applicationsModule,
  eventsModule,
  adminModule,
  contentModule,
  settingsModule,
  systemModule,
];

export const jobs = modules.flatMap((m) => m.jobs ?? []);
