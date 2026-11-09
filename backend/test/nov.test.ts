// November 2026 requirements. Each test names the rule it pins; reverting that rule turns it red.
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { db, inTx, SYSTEM } from "../src/infrastructure/db.js";
import { hashPassword } from "../src/infrastructure/password.js";
import { userMachine } from "../src/modules/auth/auth.service.js";
import { jobs } from "../src/modules/index.js";
import { startWorker } from "../src/workers/runner.js";
import { api, app, as, code, freshDbWithAdmin, lastOtp, login, PDF, PNG } from "./helpers.js";

let admin: ReturnType<typeof as>;
let cse: string;
let civil: string;

async function drainJobs() {
  await db.job.updateMany({ where: { status: "queued" }, data: { run_after: new Date(Date.now() - 60_000) } });
  const w = startWorker(jobs, { intervalMs: 10_000 });
  for (let i = 0; i < 5; i++) await w.tick();
  await w.stop();
}

/** An active student with a complete profile. */
async function student(enrolment: string, f: { programme_id: string; year_of_completion: number; cgpa: number }) {
  const email = `${enrolment.toLowerCase()}@tezu.ac.in`;
  await inTx(async (tx) =>
    userMachine.create(
      tx,
      { role: "student", email, name: enrolment, password_hash: await hashPassword("student-pass"), student: { create: { enrolment_no: enrolment, academic_standing: "good", dob: new Date("2003-01-01"), ...f } } },
      SYSTEM,
      { state: "active" },
    ),
  );
  const s = as(await login(email, "student-pass"));
  await s.upload("/students/me/resume", PDF, "cv.pdf").expect(201);
  await s.upload("/students/me/photo", PNG, "me.png").expect(201);
  return s;
}

async function recruiter(email: string) {
  await request(app).post(api("/auth/register/recruiter")).send({ email, password: "recruiter-pass", name: "R. Hire", company: { name: email, category: "private" } }).expect(201);
  await request(app).post(api("/auth/verify-otp")).send({ email, code: await lastOtp(email) }).expect(200);
  const id = (await db.user.findUniqueOrThrow({ where: { email } })).id;
  await admin.post(`/admin/users/${id}/decision`, { decision: "approve" }).expect(200);
  return as(await login(email, "recruiter-pass"));
}

async function approvedPosting(r: ReturnType<typeof as>, extra: object = {}) {
  const p = await r.post("/company/opportunities", {
    type: "job", title: "Engineer", description: "Build things for a living.", apply_deadline: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    eligibility: {}, selection_process: {}, ...extra,
  });
  expect(p.status, JSON.stringify(p.body)).toBe(201);
  await r.post(`/company/opportunities/${p.body.id}/submit`).expect(200);
  await admin.post(`/admin/opportunities/${p.body.id}/decision`, { decision: "approve" }).expect(200);
  return p.body.id as string;
}

beforeAll(async () => {
  admin = await freshDbWithAdmin();
  cse = (await admin.post("/admin/programmes", { department: "School of Engineering", name: "B.Tech CSE", code: "CSB" })).body.id;
  civil = (await admin.post("/admin/programmes", { department: "School of Sciences", name: "M.Sc Physics", code: "PHY" })).body.id;
});

describe("staff accounts", () => {
  it("adds and deletes staff, but never yourself or the last admin", async () => {
    const t = await admin.post("/admin/teachers", { email: "teacher@tezu.ac.in", name: "A Teacher" }).expect(201);
    const self = (await db.user.findUniqueOrThrow({ where: { email: "tpo@tezu.ac.in" } })).id;
    expect(code(await admin.delete(`/admin/teachers/${self}`))).toBe("CANNOT_DELETE");
    await admin.delete(`/admin/teachers/${t.body.id}`).expect(200);
    expect(await db.user.findUnique({ where: { id: t.body.id } })).toBeNull();
    expect(code(await admin.delete(`/admin/teachers/${t.body.id}`))).toBe("NOT_FOUND");
  });
});

describe("landing page content", () => {
  it("admin edits to the landing copy are what the public endpoint returns", async () => {
    const site = { hero_title: "Placements 2027", contacts: [{ name: "Dr. X", role: "TPO", line: "tpo@tezu.ac.in" }] };
    await admin.put("/admin/university", { name: "Tezpur University", address: null, website: null, est_year: null, ranking: null, achievements: null, contact_emails: [], admin_mobiles: [], site }).expect(200);
    const pub = await request(app).get(api("/university")).expect(200);
    expect(pub.body.site).toEqual(site);
    // A profile save without `site` keeps the landing copy.
    await admin.put("/admin/university", { name: "Tezpur University", address: "Napaam", website: null, est_year: null, ranking: null, achievements: null, contact_emails: [], admin_mobiles: [] }).expect(200);
    expect((await request(app).get(api("/university"))).body).toMatchObject({ address: "Napaam", site });
  });

  it("placement records can be corrected and deleted", async () => {
    const r = (await admin.post("/admin/placement-records", { year: 2025, data: { placement_rate: 80 } })).body;
    await admin.patch(`/admin/placement-records/${r.id}`, { data: { placement_rate: 91 } }).expect(200);
    expect((await request(app).get(api("/placement-records"))).body.find((x: { id: string }) => x.id === r.id).data).toEqual({ placement_rate: 91 });
    await admin.delete(`/admin/placement-records/${r.id}`).expect(200);
    expect((await request(app).get(api("/placement-records"))).body.find((x: { id: string }) => x.id === r.id)).toBeUndefined();
  });
});

describe("targeted notices", () => {
  let a: ReturnType<typeof as>, b: ReturnType<typeof as>;
  beforeAll(async () => {
    a = await student("CSB26001", { programme_id: cse, year_of_completion: 2026, cgpa: 8.5 });
    b = await student("PHY27001", { programme_id: civil, year_of_completion: 2027, cgpa: 6.0 });
  });

  it("only students matching department + batch + CGPA see the notice, get the email and can open its PDF", async () => {
    const reach = await admin.get("/admin/notices/reach?departments=School%20of%20Engineering&batches=2026&min_cgpa=8");
    expect(reach.body).toEqual({ students: 1 });
    const n = await admin.post("/admin/notices", { audience: "students", title: "CSE 2026 drive", body: "Report at 9.", email: true, departments: ["School of Engineering"], batches: [2026], min_cgpa: 8 });
    expect(n.status, JSON.stringify(n.body)).toBe(201);
    const f = await admin.upload(`/admin/notices/${n.body.id}/attachment`, PDF, "drive.pdf").expect(201);

    expect((await a.get("/noticeboard")).body.data.map((x: { title: string }) => x.title)).toContain("CSE 2026 drive");
    expect((await b.get("/noticeboard")).body.data.map((x: { title: string }) => x.title)).not.toContain("CSE 2026 drive");
    const mailed = await db.job.findMany({ where: { type: "email.send", payload: { path: ["subject"], equals: "CSE 2026 drive" } } });
    expect(mailed.map((j) => (j.payload as { to: string }).to)).toEqual(["csb26001@tezu.ac.in"]);
    expect((await a.get(`/files/${f.body.file_id}`)).status).toBe(200);
    expect((await b.get(`/files/${f.body.file_id}`)).status).toBe(404);
  });

  it("targeting a notice at recruiters is refused", async () => {
    expect(code(await admin.post("/admin/notices", { audience: "all", title: "Mixed", body: "x", batches: [2026] }))).toBe("VALIDATION_FAILED");
  });

  it("roster filters by department, batch, CGPA range", async () => {
    const q = (s: string) => admin.get(`/admin/students?${s}`).then((r) => r.body.data.map((x: { enrolment_no: string }) => x.enrolment_no).sort());
    expect(await q("departments=School%20of%20Sciences")).toEqual(["PHY27001"]);
    expect(await q("batches=2026&batches=2027")).toEqual(["CSB26001", "PHY27001"]);
    expect(await q("max_cgpa=7")).toEqual(["PHY27001"]);
    expect(await q("placed=false")).toEqual(["CSB26001", "PHY27001"]);
  });
});

describe("roster CSV", () => {
  it("imports every profile column, and a re-import updates the same student instead of skipping", async () => {
    const csv = (cgpa: string) =>
      `enrolment_no,name,email,programme_code,year_of_completion,cgpa,department,gender,marks_10,minority,dob\nCSB26050,Imported One,csb26050@tezu.ac.in,CSB,2026,${cgpa},Computer Science,F,91.5,no,2004-02-03\n`;
    await admin.upload("/admin/students/import", Buffer.from(csv("7.9")), "roster.csv").expect(202);
    await drainJobs();
    let s = await db.student.findUniqueOrThrow({ where: { enrolment_no: "CSB26050" } });
    expect(s).toMatchObject({ cgpa: 7.9, department: "Computer Science", gender: "F", marks_10: 91.5, minority: false, programme_id: cse, year_of_completion: 2026 });
    await admin.upload("/admin/students/import", Buffer.from(csv("8.4")), "roster.csv").expect(202);
    await drainJobs();
    s = await db.student.findUniqueOrThrow({ where: { enrolment_no: "CSB26050" } });
    expect(s.cgpa).toBe(8.4);
  });
});

describe("roster filters: who they are", () => {
  /** password "" = imported, never signed in. */
  const make = (enrolment: string, f: Record<string, unknown>, password = "") =>
    inTx(async (tx) =>
      userMachine.create(
        tx,
        { role: "student", email: `${enrolment.toLowerCase()}@tezu.ac.in`, name: enrolment, password_hash: password && (await hashPassword(password)), student: { create: { enrolment_no: enrolment, academic_standing: "good", ...f } } },
        SYSTEM,
        { state: "active" },
      ),
    );
  const q = (s: string) => admin.get(`/admin/students?${s}&q=WHO`).then((r) => r.body.data.map((x: { enrolment_no: string }) => x.enrolment_no).sort());

  it("filters by gender (any spelling, blank counts as unspecified), category, probation, profile and account", async () => {
    await make("WHO26001", { gender: "F", category: "OBC", dob: new Date("2003-01-01") }, "pw-pw-pw-pw");
    await make("WHO26002", { gender: "Male", category: "general" });
    await make("WHO26003", { gender: "Non-binary", academic_standing: "probation" });
    await make("WHO26004", {});
    expect(await q("genders=female")).toEqual(["WHO26001"]);
    expect(await q("genders=male")).toEqual(["WHO26002"]);
    expect(await q("genders=other")).toEqual(["WHO26003"]);
    expect(await q("genders=unspecified")).toEqual(["WHO26004"]);
    expect(await q("genders=female&genders=male")).toEqual(["WHO26001", "WHO26002"]);
    expect(await q("categories=obc")).toEqual(["WHO26001"]);
    expect(await q("categories=general&categories=unspecified")).toEqual(["WHO26002", "WHO26003", "WHO26004"]);
    expect(await q("probation=true")).toEqual(["WHO26003"]);
    expect(await q("account_claimed=true")).toEqual(["WHO26001"]);
    expect(await q("account_claimed=false")).toEqual(["WHO26002", "WHO26003", "WHO26004"]);
    expect(await q("profile_complete=true")).toEqual([]);
    expect(await q("profile_complete=false")).toEqual(["WHO26001", "WHO26002", "WHO26003", "WHO26004"]);
    const row = (await admin.get("/admin/students?q=WHO26001")).body.data[0];
    expect([row.account_claimed, "password_hash" in row.user], "claimed flag out, hash never").toEqual([true, false]);
  });

  it("a notice can target by gender, and only the matching students see it", async () => {
    const n = await admin.post("/admin/notices", { audience: "students", title: "For women", body: "x", genders: ["female"] }).expect(201);
    expect(n.body.genders).toEqual(["female"]);
    expect((await admin.get("/admin/notices/reach?genders=female")).body.students, "reach counts active female students").toBeGreaterThanOrEqual(1);
    const titles = async (email: string, pw: string) => (await as(await login(email, pw)).get("/noticeboard")).body.data.map((x: { title: string }) => x.title);
    expect(await titles("who26001@tezu.ac.in", "pw-pw-pw-pw"), "female student sees it").toContain("For women");
    await db.user.update({ where: { email: "who26002@tezu.ac.in" }, data: { password_hash: await hashPassword("pw-pw-pw-pw") } });
    expect(await titles("who26002@tezu.ac.in", "pw-pw-pw-pw"), "male student does not").not.toContain("For women");
    expect(code(await admin.post("/admin/notices", { audience: "all", title: "Bad", body: "x", genders: ["male"] }))).toBe("VALIDATION_FAILED");
  });
});

describe("profile sheet upload", () => {
  const head = "Submission ID,Status,Student Name,Programme,Specialization,Graduation Year,CGPA,Technical Skills,Project 1,Project 2,Internship 1,Achievements,LinkedIn,GitHub / Portfolio,About Me,Email for Profile Updates,Roll Number\n";
  const q = (o: object) => `"${JSON.stringify(o).replaceAll('"', '""')}"`;
  const sheet =
    head +
    `S-1,Approved,Sheet One,B.Tech CSE,Systems,2027,8.5,"C, Go",${q({ title: "Kernel toy", description: "A tiny kernel", tools: "C", role: "", link: "", imageUrl: "" })},,${q({ organization: "Acme Labs", role: "Summer Intern", duration: "June 2026", area: "Infra", description: "", link: "" })},"[{""title"":""Won hackathon"",""year"":""2026"",""detail"":""""}]",www.linkedin.com/in/sheet-one,,Likes systems.,personal@gmail.com,csb26060\n` +
    `S-2,Approved,No Roll,B.Tech CSE,,2027,7.0,Python,${q({ title: "x", description: "", tools: "", role: "", link: "", imageUrl: "" })},,,,,,Hi.,,\n`;

  it("uploads the sheet as-is: derives the university email, stores the detail, skips rows with no roll number", async () => {
    const r = await admin.upload("/admin/students/import", Buffer.from(sheet), "sheet.csv");
    expect(r.status, JSON.stringify(r.body)).toBe(202);
    await drainJobs();
    const job = await db.job.findUniqueOrThrow({ where: { id: r.body.job_id } });
    expect(job.result).toMatchObject({ created: 1, skipped: [{ enrolment_no: "No Roll" }] });
    const u = await db.user.findUniqueOrThrow({ where: { email: "csb26060@tezu.ac.in" }, include: { student: { include: { records: true } } } });
    expect(u.student).toMatchObject({ cgpa: 8.5, programme_id: cse, year_of_completion: 2027, specialization: "Systems", technical_skills: "C, Go", about_me: "Likes systems.", linkedin_url: "https://www.linkedin.com/in/sheet-one", certifications: "Won hackathon (2026)" });
    expect(u.student!.records.map((x) => [x.kind, x.title]).sort()).toEqual([["internship", "Summer Intern"], ["project", "Kernel toy"]]);
    expect(await db.user.count({ where: { email: "personal@gmail.com" } }), "the personal address is not used as the login").toBe(0);
  });

  it("re-uploading the sheet does not duplicate the records", async () => {
    const r = await admin.upload("/admin/students/import", Buffer.from(sheet), "sheet.csv").expect(202);
    await drainJobs();
    expect((await db.job.findUniqueOrThrow({ where: { id: r.body.job_id } })).result).toMatchObject({ created: 0, updated: 1 });
    expect(await db.studentRecord.count({ where: { student: { enrolment_no: "CSB26060" } } })).toBe(2);
  });
});

describe("backlog status", () => {
  it("the profile sheet's Active/Cleared Backlogs columns are stored; a blank stays unset", async () => {
    const csv =
      "Student Name,Programme,Graduation Year,Roll Number,Active Backlogs,Cleared Backlogs\n" +
      "Backlog Two,B.Tech CSE,2027,csb26061,2,3\n" +
      "Backlog None,B.Tech CSE,2027,csb26062,,\n";
    const r = await admin.upload("/admin/students/import", Buffer.from(csv), "backlogs.csv").expect(202);
    await drainJobs();
    expect((await db.job.findUniqueOrThrow({ where: { id: r.body.job_id } })).result).toMatchObject({ created: 2 });
    const get = (e: string) => db.student.findUniqueOrThrow({ where: { enrolment_no: e } });
    expect(await get("CSB26061")).toMatchObject({ active_backlogs: 2, cleared_backlogs: 3 });
    expect(await get("CSB26062")).toMatchObject({ active_backlogs: null, cleared_backlogs: null });
    expect(code(await admin.upload("/admin/students/import", Buffer.from(csv.replace(",2,3", ",-1,3")), "bad.csv"))).toBe("VALIDATION_FAILED");
  });

  it("a student sets their own counts, zero is allowed, negatives are refused", async () => {
    const s = await student("CSB26063", { programme_id: cse, year_of_completion: 2027, cgpa: 8 });
    const ok = await s.patch("/students/me", { active_backlogs: 0, cleared_backlogs: 4 });
    expect(ok.body).toMatchObject({ active_backlogs: 0, cleared_backlogs: 4 });
    expect((await s.get("/students/me")).body).toMatchObject({ active_backlogs: 0, cleared_backlogs: 4 });
    expect(code(await s.patch("/students/me", { active_backlogs: -1 }))).toBe("VALIDATION_FAILED");
  });
});

describe("audit log names", () => {
  it("rows carry the actor's and a user entity's name, not just ids", async () => {
    const rows = (await admin.get("/admin/audit-log?limit=100").expect(200)).body.data as { actor_user_id: string | null; actor_name: string | null; entity: string; entity_name: string | null }[];
    expect(rows.filter((a) => a.actor_user_id).every((a) => typeof a.actor_name === "string"), "every row with an actor has a name").toBe(true);
    expect(rows.some((a) => a.entity === "user" && a.entity_name), "a user entity shows the person's name").toBe(true);
  });
});

describe("recruiter drive details", () => {
  it("drive mode and hiring period are stored; logistics reach applicants only", async () => {
    const r = await recruiter("hr@drive.example");
    const id = await approvedPosting(r, { drive_mode: "hybrid", hiring_from: "2027-01", hiring_to: "2027-03" });
    expect(code(await r.post("/company/opportunities", { type: "job", title: "Bad", description: "Bad period here.", apply_deadline: new Date(Date.now() + 86_400_000).toISOString(), eligibility: {}, selection_process: {}, hiring_from: "2027-05", hiring_to: "2027-01" }))).toBe("VALIDATION_FAILED");
    await r.put(`/company/opportunities/${id}/logistics`, { venue: "Hall A", logistics: "Report 9am" }).expect(200);
    const draft = (await r.post("/company/opportunities", { type: "job", title: "Draft", description: "Draft posting here.", apply_deadline: new Date(Date.now() + 86_400_000).toISOString(), eligibility: {}, selection_process: {}, drive_mode: "online", venue: "Old hall" })).body.id;
    const cleared = await r.patch(`/company/opportunities/${draft}`, { drive_mode: null, venue: null });
    expect(cleared.body).toMatchObject({ drive_mode: null, venue: null });

    const applicant = await student("CSB26070", { programme_id: cse, year_of_completion: 2026, cgpa: 9 });
    const other = await student("CSB26071", { programme_id: cse, year_of_completion: 2026, cgpa: 9 });
    const listed = (await other.get(`/opportunities/${id}`)).body;
    expect(listed.drive_mode).toBe("hybrid");
    expect(listed).not.toHaveProperty("venue");
    await applicant.post(`/opportunities/${id}/apply`).expect(201);
    const mine = (await applicant.get("/applications/mine")).body.data[0].opportunity;
    expect(mine).toMatchObject({ venue: "Hall A", logistics: "Report 9am", hiring_from: "2027-01", hiring_to: "2027-03" });
  });
});

describe("placed students", () => {
  it("a published selection closes Apply; an admin-granted appeal reopens it", async () => {
    const r = await recruiter("hr@placed.example");
    const first = await approvedPosting(r);
    const second = await approvedPosting(r);
    const s = await student("CSB26090", { programme_id: cse, year_of_completion: 2026, cgpa: 9 });
    const appId = (await s.post(`/opportunities/${first}/apply`).expect(201)).body.id;
    await admin.post(`/admin/opportunities/${first}/release`, {}).expect(200);
    await r.post("/company/applications/shortlist", { application_ids: [appId] }).expect(200);
    await r.post(`/company/opportunities/${first}/results`, { selected_application_ids: [appId] }).expect(200);
    await admin.post(`/admin/opportunities/${first}/results/publish`).expect(200);

    expect((await s.get("/students/me/placement")).body.placed).toBe(true);
    expect(code(await s.post(`/opportunities/${second}/apply`))).toBe("PLACED");
    await s.post("/students/me/appeal", { reason: "I want to try for a core role." }).expect(200);
    const studentId = (await db.student.findUniqueOrThrow({ where: { enrolment_no: "CSB26090" } })).id;
    expect((await admin.get("/admin/appeals")).body.map((x: { student_id: string }) => x.student_id)).toEqual([studentId]);
    await admin.post(`/admin/students/${studentId}/appeal`, { grant: true }).expect(200);
    expect((await s.get("/students/me/placement")).body.placed).toBe(false);
    await s.post(`/opportunities/${second}/apply`).expect(201);
  });
});

describe("student records and feedback", () => {
  it("records carry their own attachment, visible to admin, hidden from other students", async () => {
    const s = await student("CSB26100", { programme_id: cse, year_of_completion: 2026, cgpa: 8 });
    const peer = await student("CSB26101", { programme_id: cse, year_of_completion: 2026, cgpa: 8 });
    for (const kind of ["certificate", "internship", "project"]) await s.post("/students/me/records", { kind, title: `My ${kind}` }).expect(201);
    const recs = (await s.get("/students/me/records")).body;
    expect(recs.map((r: { kind: string }) => r.kind).sort()).toEqual(["certificate", "internship", "project"]);
    const f = await s.upload(`/students/me/records/${recs[0].id}/file`, PDF, "proof.pdf").expect(201);
    expect((await admin.get(`/files/${f.body.file_id}`)).status).toBe(200);
    expect((await peer.get(`/files/${f.body.file_id}`)).status).toBe(404);
    expect(code(await peer.delete(`/students/me/records/${recs[0].id}`))).toBe("NOT_FOUND");
  });

  it("students rate only recruiters they applied to; re-rating replaces", async () => {
    const r = await recruiter("hr@rate.example");
    const id = await approvedPosting(r);
    const s = await student("CSB26110", { programme_id: cse, year_of_completion: 2026, cgpa: 8 });
    expect(code(await s.post("/students/me/feedback", { target: "opportunity", target_id: id, rating: 4 }))).toBe("NOT_PARTICIPANT");
    await s.post(`/opportunities/${id}/apply`).expect(201);
    await s.post("/students/me/feedback", { target: "opportunity", target_id: id, rating: 4 }).expect(200);
    await s.post("/students/me/feedback", { target: "opportunity", target_id: id, rating: 2, comment: "Late start" }).expect(200);
    const rows = (await admin.get("/admin/student-feedback?target=opportunity")).body;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rating: 2, comment: "Late start", target_name: "hr@rate.example: Engineer" });
  });
});
