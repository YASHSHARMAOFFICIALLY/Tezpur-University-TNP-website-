import { execFileSync } from "node:child_process";
import { ADMIN, PW, RECRUITER, apiCall } from "../../../../scripts/e2e-lib.mjs";

const ART = process.env.ARTIFACTS ?? ".";
export const shot = (page, name) => page.screenshot({ path: `${ART}/${name}.png`, fullPage: true });

export async function noOverflow(page, where) {
  await page.waitForLoadState("networkidle"); // SSR markup is in the DOM before its CSS applies; measuring earlier sees unstyled widths
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  if (sw > page.viewportSize().width) throw new Error(`${where}: horizontal overflow, scrollWidth ${sw}`);
}

/** Setup-only SQL on the prod stack's database (aging a code, moving a deadline). Never the thing under test. */
export function sql(q) {
  return execFileSync("docker", ["exec", "-i", "backend-deploy-db-1", "sh", "-c", 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -v ON_ERROR_STOP=1'], { input: q }).toString().trim();
}
export const userId = (email) => sql(`select id from users where email = '${email}'`);
export const studentId = (email) => sql(`select s.id from students s join users u on u.id = s.user_id where u.email = '${email}'`);

export const tokenFor = async (email, password = PW) => (await apiCall("POST", "/auth/login", { body: { email, password } })).access_token;

/** An approved posting from the demo recruiter that the seed student (CSE, batch 2028, CGPA 8.92) is eligible for. */
export async function approvedPosting(title, { minCgpa = 7, deadlineDays = 7 } = {}) {
  const [R, A] = [await tokenFor(RECRUITER), await tokenFor(ADMIN)];
  const cse = (await apiCall("GET", "/programmes")).find((p) => p.name === "B.Tech Computer Science & Engg");
  const { id } = await apiCall("POST", "/company/opportunities", {
    token: R,
    body: {
      type: "job",
      title,
      job_profile: "SDE",
      description: "Edge-case journey posting.",
      expected_hires: 2,
      location: "Pune",
      designation: "Engineer",
      apply_deadline: new Date(Date.now() + deadlineDays * 864e5).toISOString(),
      eligibility: { min_cgpa: minCgpa, programmes: [cse.id], completion_years: [2028] },
      selection_process: { technical_interview: true },
    },
  });
  await apiCall("POST", `/company/opportunities/${id}/submit`, { token: R });
  await apiCall("POST", `/admin/opportunities/${id}/decision`, { token: A, body: { decision: "approve" } });
  return id;
}
