---
name: verify-tnp-web
description: Drive the Tezpur University T&P web portal (Next.js frontend, three portals for admin/TPO, student and recruiter) in real Chrome against the production stack at https://localhost (nginx + web + API + Postgres from backend-deploy/deploy/local-prod.sh). Use it to prove a frontend or full-stack change works the way a user clicks through it, to run the 56-step UI suites before a deploy, or to check an edge case (route guards, OTP, mobile width, session expiry) on the prod build. For backend-only API checks use backend-deploy/.claude/skills/verify-tnp instead.
---

# Verify the T&P web portal

Users touch three portals through one Next.js app. Admin/TPO lives at `/admin` (sub-pages `/admin/students`, `/admin/teachers`, `/admin/comms`, `/admin/content`, `/admin/system`), students at `/student`, recruiters at `/recruiter`. The public page is `/` (with `/#register`), and sign-in is `/login`. Mail (OTP codes, reset codes) goes to the host **Mailpit** at `http://localhost:8025`. The drive harness is `playwright-core` running the installed Google Chrome (`/Applications/Google Chrome.app`), headless by default and visible with `--headed`.

Everything goes through `webctl` next to this file. Run it from `college/frontend/`:

```sh
W=.claude/skills/verify-tnp-web/webctl
```

## Launch

```sh
$W up        # reuse or start the prod stack, seed demo data, then run doctor
```

`up` does this:

1. Refuses to start unless Mailpit answers on `:8025`. Start it with `docker compose --profile dev up -d mailpit` from `college/backend`.
2. If `https://localhost/readyz` already answers, it **reuses** that stack and records `owner=reused`. Otherwise it runs `backend-deploy/deploy/local-prod.sh up`, which builds the images, generates a self-signed cert and `deploy/local.env`, waits for `/readyz` and runs the Prisma seed. Then it records `owner=started`. A cold build takes a few minutes.
3. Runs `local-prod.sh seed`, which calls `scripts/seed-demo.mjs` through the real API. It is idempotent. It creates the demo admin, the seed student `csb21045@tezu.ac.in`, the recruiter `hr.demo@cognizant-demo.test`, a posting, an event and a notice. It also writes `DEMO_PASSWORD` into `.env.local` if that is missing.
4. Runs `doctor`. **Ready** means every doctor line is `ok`, including all three seed accounts signing in.

Run state is in `$TMPDIR/tnp-web-verify/`. Prerequisites: Docker running, `npm ci` done in `frontend/`, Google Chrome installed, and `backend/.env` present (the harness reads `SEED_ADMIN_EMAIL` and `STUDENT_EMAIL_DOMAIN` from it).

## Doctor

`$W doctor` is read-only. It checks that:

- `/readyz` (API) and `/login` (web) both return 200 through nginx on 443;
- the containers `backend-deploy-{nginx,web,app,db}-1` are running and come from `college/backend-deploy`, not from some other stack on 443;
- Mailpit answers;
- `DEMO_PASSWORD` is set (it checks this without printing it);
- admin, seed student and recruiter can each sign in.

Run it first whenever anything looks off.

**One stack, one driver.** Only one prod stack can own port 443, and the suites share the seed accounts. A logout or a token revocation on the seed student kills that user's other sessions. Never run two suites or journeys at once, and never drive while the user is presenting on the same stack.

## Drive

| Command | Does |
|---|---|
| `$W suite e2e` | 28 steps: public page, registration with OTP, the full posting → apply → release → shortlist → final selection → result lifecycle across all three portals |
| `$W suite ops` | 15 steps: notices, company threads, feedback forms, CSV import, student edit/probation, teachers, programmes, university profile, settings/health/audit, recruiter profile, posting return → resubmit, recruiter 4-step registration, rejection → resubmit |
| `$W suite auth` | 13 steps: forgot password, wrong/resent codes, forced one-time password change, silent token refresh, refresh failing upstream, revoked refresh token, logout revocation, no data leak to the next user in the tab |
| `$W suite all` | the three suites above, in order; stops at the first suite with a FAIL |
| `$W journey FILE.mjs [--headed]` | runs one journey script, with `ARTIFACTS` set to this run's artifacts dir. Edge-case journeys: `journeys/sign-in.mjs` (17 steps), `student.mjs` (16), `recruiter.mjs` (8), `admin.mjs` (10) |
| `$W shot ROLE PATH [WIDTH]` | full-page PNG of PATH as `guest`, `admin`, `student` or `recruiter` at WIDTH (default 1280); also reports console errors and horizontal overflow |
| `$W down` | cleanup (see below) |

Each suite and journey prints `PASS`/`FAIL <step>` lines and exits 1 at the first failure. It also lists browser `pageerror`s and every API response ≥ 400 at the end.

**Writing a journey.** Copy a file in `journeys/`. Import from `journeys/lib.mjs`:

- `shot(page, name)`;
- `noOverflow(page, where)`, which waits for `networkidle` first;
- `sql(q)`: setup only, against the prod stack's DB, such as aging an OTP or moving a deadline;
- `userId(email)` and `studentId(email)`: `applications.student_id` and the probation route take `students.id`, not `users.id`;
- `tokenFor(email)`;
- `approvedPosting(title)`.

Import these from `scripts/e2e-lib.mjs`:

- `newPage()`: a fresh browser context that accepts the self-signed cert;
- `login(page, email, PW)`;
- `step(name, fn)`;
- `otpFor(email)` and `mailText(email, /subject/)`: read Mailpit;
- `apiCall` and `apiList`: setup only, never the thing under test;
- `ADMIN`, `SEED_STUDENT`, `RECRUITER`, `PW`, `WEB`.

Locate elements by role and label, as the suites do:

- buttons: `getByRole("button", { name: "Sign in" })`, `"Log out"`, `"Send code"`, `"Approve"`, `/Apply Now/`, `"Create New Job Opening"`, `"Submit as Final Selections"`;
- dialogs: `getByRole("dialog", { name: "Job & Internship Posting Studio" })`;
- alerts: `getByRole("alert")` for every error message;
- tabs: `getByRole("tab", { name: /Job & Internship Postings/ })` and `"Student / Candidate"`;
- form fields: `getByLabel("Email *")` and `"Verification Code *"`.

Grep `scripts/e2e*.mjs` for the selector that a screen already uses before you invent one.

**Interactive Chrome (MCP).** Use this for looking around by hand, not for proof. Open `https://localhost` in Chrome. It shows a certificate warning once, because the cert is self-signed. The user must accept it (or type `thisisunsafe` on the warning page) before claude-in-chrome or chrome-devtools can load the page. Sign in through the form. Never paste `DEMO_PASSWORD` into a chat or a screenshot. Prefer a journey script for anything you will report.

Recipes per feature are in [features/README.md](features/README.md).

## Evidence

Artifacts go in `frontend/.verify-artifacts/<run>/`, which is gitignored and **kept by `down`**:

- `seed.log`;
- `suites.log` (every PASS/FAIL line plus the console and API errors);
- `journeys.log`;
- `sign-in-*.png` and any other journey screenshots;
- `ROLE_path-WIDTH.png` from `shot`.

Proof standards:

- Drive the real UI as the user does: the form, the button, the redirect. Use `apiCall` only to set up a precondition that the UI under test does not own.
- Capture the action and the resulting state. Take a screenshot after the action, and get a second view from another role: the admin approves, then the student sees it.
- Check side effects: the OTP or reset mail arrives in Mailpit, and the CSV downloads with formula-safe cells. A row a recruiter submits must show up in the admin's view.
- A guard is proven only when both sides are shown: the refusal (redirect, `alert` text) **and** the success once the precondition is met.
- Mail is real SMTP to Mailpit, not a mock. The cert is self-signed, so `NODE_TLS_REJECT_UNAUTHORIZED=0` and `ignoreHTTPSErrors` are set for the harness only.

## Cleanup

```sh
$W down   # stops the stack only if this run started it; clears run state; keeps .verify-artifacts/<run>
```

- Every suite, journey and shot runs in its own process group, with hard caps of 900, 600 and 120 s. A timeout kills node and Chrome together.
- `down` lists any leftover harness processes. Kill those by PID, never by name: the user's own Chrome shares the binary name.
- After a failed iteration, still run `$W down`.
- To wipe the stack's database and uploads, run `backend-deploy/deploy/local-prod.sh reset`. Only do that on a stack this run started, and only with the user's OK.

## Not covered by this local stack

The stack here differs from a VPS deploy in these ways. Re-check each one on the real host:

- a real TLS certificate and domain, set in `CORS_ORIGIN`;
- real SMTP instead of Mailpit (OTP delivery, spam folder);
- `deploy/local.env` secrets generated by the script;
- `data/uploads` on host disk, and backups (`deploy/backup.sh`).
