// Demo data through the real API (no DB writes): admin, one student, one recruiter, a posting, an event, a notice.
// Idempotent: re-running skips what already exists. Exits non-zero on the first unexpected API error,
// so it doubles as an end-to-end smoke test of the backend flows the frontend uses.
//
// usage: node scripts/seed-demo.mjs   (API on :3000, Mailpit on :8025)
// Test credentials live in frontend/.env.local (gitignored); this script creates DEMO_PASSWORD there if missing.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";

const API = process.env.API ?? "http://localhost:3000/api/v1";
const MAILPIT = process.env.MAILPIT ?? "http://localhost:8025";
const here = resolve(import.meta.dirname, "..");

const readEnv = (file) =>
  existsSync(file)
    ? Object.fromEntries(
        readFileSync(file, "utf8")
          .split("\n")
          .filter((l) => /^\w+=/.test(l))
          .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
      )
    : {};
const backendEnv = readEnv(resolve(here, "../backend/.env"));
const localFile = resolve(here, ".env.local");
let local = readEnv(localFile);
if (!local.DEMO_PASSWORD && !process.env.DEMO_PASSWORD) {
  appendFileSync(localFile, `DEMO_PASSWORD=Demo-${randomBytes(9).toString("base64url")}\n`);
  local = readEnv(localFile);
}
const PW = process.env.DEMO_PASSWORD ?? local.DEMO_PASSWORD; // env wins: lets it run on a server with no .env.local
const DOMAIN = backendEnv.STUDENT_EMAIL_DOMAIN || "tezu.ac.in";
const ADMIN = process.env.SEED_ADMIN_EMAIL ?? backendEnv.SEED_ADMIN_EMAIL;
const STUDENT = `csb21045@${DOMAIN}`;
const RECRUITER = "hr.demo@cognizant-demo.test";

async function req(method, path, { token, body, file, ok = [] } = {}) {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  let payload;
  if (file) {
    payload = new FormData();
    payload.append("file", new Blob([file.bytes], { type: file.type }), file.name);
  } else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const r = await fetch(API + path, { method, headers, body: payload });
  const json = r.headers.get("content-type")?.includes("json") ? await r.json() : null;
  if (r.ok) return json;
  if (ok.includes(json?.error?.code)) return { skipped: json.error.code };
  throw new Error(`${method} ${path} -> ${r.status} ${json?.error?.code}: ${json?.error?.message}`);
}

async function apiList(path, token) {
  const rows = [];
  for (let cursor = ""; ;) {
    const r = await req("GET", `${path}?limit=100${cursor && `&cursor=${cursor}`}`, { token });
    rows.push(...r.data);
    if (!r.page.has_more) return rows;
    cursor = r.page.cursor;
  }
}
async function otpFor(email) {
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}&limit=1`).then((r) => r.json());
    const id = r.messages?.[0]?.ID;
    if (id) {
      const m = await fetch(`${MAILPIT}/api/v1/message/${id}`).then((r) => r.json());
      const code = m.Text?.match(/\b(\d{6})\b/)?.[1];
      if (code) return code;
    }
    await new Promise((s) => setTimeout(s, 500));
  }
  throw new Error(`no OTP mail for ${email} in Mailpit`);
}

async function login(email) {
  return req("POST", "/auth/login", { body: { email, password: PW } });
}

const step = (s) => console.log("•", s);

// 1. admin: first login uses the seed password, then is forced to change it to DEMO_PASSWORD
let admin = await req("POST", "/auth/login", { body: { email: ADMIN, password: PW }, ok: ["INVALID_CREDENTIALS"] });
if (admin.skipped) {
  admin = await req("POST", "/auth/login", { body: { email: ADMIN, password: backendEnv.SEED_ADMIN_PASSWORD } });
  admin = await req("POST", "/auth/change-password", {
    token: admin.access_token,
    body: { current_password: backendEnv.SEED_ADMIN_PASSWORD, new_password: PW },
  });
  step("admin password set to DEMO_PASSWORD");
}
const A = admin.access_token;

// 2. university + programmes (public page data)
await req("PUT", "/admin/university", {
  token: A,
  body: {
    name: "Tezpur University",
    address: "Napaam, Sonitpur, Assam - 784028",
    website: "https://www.tezu.ernet.in",
    est_year: 1994,
    ranking: "NAAC A+ (CGPA 3.41) • NIRF Top 100",
    achievements: "Centenary vision. 27 post-graduate & engineering departments.",
    contact_emails: ["adtp@tezu.ernet.in"],
    admin_mobiles: ["+913712273005"],
  },
});
const progs = await req("GET", "/programmes");
const want = [
  ["School of Engineering", "B.Tech Computer Science & Engg", "CSB", 353],
  ["School of Engineering", "B.Tech Electronics & Communication", "ECB", 66],
  ["School of Management Sciences", "Master of Business Admin (MBA)", "BAM", 60],
  ["School of Sciences", "Integrated M.Sc Chemical Sciences", "CHI", 45],
];
for (const [department, name, code, student_count] of want)
  if (!progs.some((p) => p.code === code)) await req("POST", "/admin/programmes", { token: A, body: { department, name, code, year: 4, student_count } });
const programmes = await req("GET", "/programmes");
const cse = programmes.find((p) => p.code === "CSB");
if (!(await req("GET", "/placement-records")).some((r) => r.year === 2024))
  await req("POST", "/admin/placement-records", {
    token: A,
    body: {
      year: 2024,
      data: { placement_rate: 87.4, corporate_partners: 180, highest_ctc_lpa: 21.5, summer_internships: 450, cohort: "Academic Cohort 2023-24" },
    },
  });
step(`university + ${programmes.length} programmes`);

// 3. student: register -> OTP -> admin approve -> complete profile
const regS = await req("POST", "/auth/register/student", {
  body: { email: STUDENT, password: PW, name: "Priyanshu Sharma", enrolment_no: "CSB21045", mobile: "9876543210", programme_id: cse.id },
  ok: ["EMAIL_TAKEN", "ENROLMENT_TAKEN"],
});
if (!regS.skipped) await req("POST", "/auth/verify-otp", { body: { email: STUDENT, code: await otpFor(STUDENT) } });

// 4. recruiter: register -> OTP
const regR = await req("POST", "/auth/register/recruiter", {
  body: {
    email: RECRUITER,
    password: PW,
    name: "Ritika Menon",
    company: {
      name: "Cognizant Technology Solutions",
      category: "mnc",
      sector: "IT Services",
      website: "https://www.cognizant.com",
      postal_address: "Bengaluru, India",
    },
    contact: { designation: "Campus Hiring Lead", phone: "+918012345678" },
  },
  ok: ["EMAIL_TAKEN"],
});
if (!regR.skipped) await req("POST", "/auth/verify-otp", { body: { email: RECRUITER, code: await otpFor(RECRUITER) } });

// 5. admin approves every pending account
const pending = await req("GET", "/admin/pending", { token: A });
for (const u of [...(pending.students ?? []), ...(pending.recruiters ?? [])])
  await req("POST", `/admin/users/${u.id}/decision`, { token: A, body: { decision: "approve" } });
step(`approved ${(pending.students?.length ?? 0) + (pending.recruiters?.length ?? 0)} accounts`);

const S = (await login(STUDENT)).access_token;
const R = (await login(RECRUITER)).access_token;

const pdf = new TextEncoder().encode(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);
const me = await req("GET", "/students/me", { token: S });
if (!me.resume_file_id) await req("POST", "/students/me/resume", { token: S, file: { bytes: pdf, type: "application/pdf", name: "cv.pdf" } });
if (!me.photo_file_id)
  await req("POST", "/students/me/photo", {
    token: S,
    file: { bytes: readFileSync(resolve(here, "public/img/emblem.jpg")), type: "image/jpeg", name: "photo.jpg" },
  });
await req("PATCH", "/students/me", {
  token: S,
  body: {
    dob: "2003-05-14",
    cgpa: 8.92,
    year_of_admission: 2021,
    year_of_completion: 2028, // not 2026: the daily alumni job makes year <= last-graduated-year read-only, which would stop the demo student applying
    programme_id: cse.id,
    department: "Computer Science & Engg.",
    gender: "Male",
    category: "General",
    regional_diversity: "Assam (NE Domicile)",
    jee_rank: 1420,
    marks_10: 94.2,
    marks_12: 92.8,
  },
});
step("student profile complete");

// 6. recruiter posting -> submit -> admin approve
const SEED_TITLE = "Software Development Engineer - Cloud";
const seedPost = async () => (await apiList("/company/opportunities", R)).find((o) => o.title === SEED_TITLE);
let post = await seedPost();
if (!post) {
  const o = await req("POST", "/company/opportunities", {
    token: R,
    body: {
      type: "job",
      title: SEED_TITLE,
      job_profile: "SDE-1, Cloud Infrastructure",
      description: "Build and operate cloud services for enterprise clients.",
      expected_hires: 25,
      location: "Bangalore / Pune / Remote Hybrid",
      designation: "Software Engineer",
      ctc_benefits: "₹10.5 LPA base + ₹1.5 LPA variable",
      bond_details: "None (Direct Employment Agreement)",
      apply_deadline: new Date(Date.now() + 14 * 864e5).toISOString(),
      eligibility: { min_cgpa: 7.5, programmes: [cse.id], completion_years: [2028] },
      selection_process: { shortlist_from_resumes: true, online_test: true, technical_interview: true, hr_interview: true },
    },
  });
  await req("POST", `/company/opportunities/${o.id}/submit`, { token: R });
  await req("POST", `/admin/opportunities/${o.id}/decision`, { token: A, body: { decision: "approve" } });
  post = await seedPost();
}
step(`posting approved (${post.status})`);

// 7. student applies -> admin releases -> recruiter shortlists
await req("POST", `/opportunities/${post.id}/apply`, { token: S, ok: ["ALREADY_APPLIED"] });
await req("POST", `/admin/opportunities/${post.id}/release`, { token: A, body: {} });
const applicants = (await req("GET", `/company/opportunities/${post.id}/applicants`, { token: R })).data;
const toShort = applicants.filter((a) => a.status === "released_to_recruiter").map((a) => a.id);
if (toShort.length) await req("POST", "/company/applications/shortlist", { token: R, body: { application_ids: toShort } });
step(`${applicants.length} applicant(s) visible to recruiter`);

// 8. event + notice
const events = (await req("GET", "/admin/events", { token: A })).data;
if (!events.length) {
  const day = 864e5;
  const e = await req("POST", "/admin/events", {
    token: A,
    body: {
      type: "workshop",
      name: "Mastering Technical Case Interviews",
      topic: "Consulting & FinTech interview prep",
      resource_person: "Dr. Rajesh Goswami",
      starts_at: new Date(Date.now() + 10 * day).toISOString(),
      venue: "KBR Auditorium (Tezpur)",
      chargeable: false,
      registration_opens_at: new Date(Date.now() - day).toISOString(),
      registration_closes_at: new Date(Date.now() + 7 * day).toISOString(),
    },
  });
  await req("POST", `/admin/events/${e.id}/publish`, { token: A });
}
const notices = (await req("GET", "/noticeboard", { token: S })).data;
if (!notices.length)
  await req("POST", "/admin/notices", {
    token: A,
    body: {
      audience: "students",
      title: "Interview Protocol Alert",
      body: "Formal university dress code mandatory for all Technical Interviews at Central Computing Centre. Reporting time: 09:30 AM IST.",
      email: false,
    },
  });
step("event + notice");
console.log(`done. Logins: ${ADMIN} / ${STUDENT} / ${RECRUITER} — password: DEMO_PASSWORD in frontend/.env.local`);
