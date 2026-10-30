# Architecture

## Problem

This is the backend for the Tezpur University T&P portal: three logins (admin/teacher, student, recruiter) and 2,000-5,000 users. It is built solo in 2-3 days and runs on the university's own server with **zero paid services**. The CRUD is easy. The hard part is a handful of rules that must hold on every code path:

- every status change is audited;
- academic probation blocks applying and event registration;
- a recruiter sees no applicant before the admin releases them;
- error codes are a stable contract;
- the OpenAPI document matches the real API.

The next contributor will probably be an AI agent that copies the nearest example, so each rule has to come from the structure of the code, not from someone remembering it.

## Usage (adding an endpoint)

```ts
route({
  method: "post", path: "/opportunities/:id/apply", summary: "Apply",
  auth: ["student"], params: Id, status: 201,
  response: z.object({ id: z.string(), status: z.literal("applied") }),
  errors: ["ON_PROBATION", "PROFILE_INCOMPLETE", "NOT_ELIGIBLE", "ALREADY_APPLIED"],
  handler: ({ user, params, actor }) => svc.apply(user.id, params.id, actor),
});
```

That one declaration gives:

- zod validation of params, query and body;
- role checks;
- the account policy: forced password change, and alumni being read-only;
- response stripping (a raw row cannot leak `password_hash`);
- the OpenAPI entry.

Status changes go through the entity's machine: `applicationMachine.move(tx, id, "shortlisted", actor)`.

## Shape

```
src/config/env.ts            zod-parsed env (the only place env is read)
src/http/route.ts            route(), buildRouter, buildOpenApi, paginate, shared wire schemas
src/infrastructure/          db.ts (Prisma + defineMachine + audit), queue.ts (enqueue), mailer.ts (SMTP job + mail()),
                             storage.ts (uploads), password.ts, logger.ts
src/middleware/              auth.ts (tokens + account policy), errors.ts (ERRORS registry), rate-limit.ts, upload.ts
src/workers/                 runner.ts (claims and runs jobs), index.ts (worker boot + daily jobs)
src/modules/<m>/             <m>.routes.ts (declarations only, each handler = one service call)
                             <m>.schemas.ts (zod), <m>.service.ts (logic, machines, jobs),
                             <m>.repository.ts (reused queries and scopes: applications, opportunities, students)
src/modules/settings/        settings.registry.ts: THE table of admin-editable settings (schema, default, label, help);
                             overrides live in the `settings` table, reads are typed and cached, every change audited
src/modules/system/          error log, system health (rule table -> ok/warning/problem + plain-English problems), repairs
src/infrastructure/error-log.ts   writes error_log for every 5xx and final job failure; never throws
src/modules/index.ts         THE module list -> router, OpenAPI, job worker
src/app.ts, src/server.ts    express app; process entry
prisma/migrations/*_status_guard   trigger, append-only audit, CHECK constraints
```

These are the decisions that hold the design up:

1. **Status columns are writable only through a `Machine`, and the database enforces it.** A Postgres trigger rejects any INSERT, or any UPDATE that changes a guarded column, unless `app.transition='on'` is set in the transaction. Only `defineMachine` (`infrastructure/db.ts`) sets it. `move()` is a compare-and-set update and writes the audit row in the same transaction. Moving to the current state is a no-op. The audit log is append-only, enforced by its own trigger. Tests check both triggers.
2. **Probation and profile gate as a type.** `apply` and event registration need a branded `Participant`. Its only constructor is `loadParticipant`, which checks ON_PROBATION, then PROFILE_INCOMPLETE.
3. **The release gate.** `recruiterWhere()` is private to `applications.repository.ts` (which also owns `applicationMachine`), and `RecruiterScope` can only be built from a company `AuthUser`. The set of statuses a recruiter can see is derived from the application machine. Unreleased rows return 404. File downloads reuse `recruiterCanSeeStudent`.
4. **A fresh user row on every request.** Approval, rejection, alumni status and password changes take effect immediately. Logging out or changing the password bumps `token_version`, which revokes every token for that user. There is no refresh-token table.
5. **One list for each thing:** `ERRORS` (`middleware/errors.ts`) (the OpenAPI error enum is derived from it), `modules` (router, docs and jobs come from it), and the student `Editable` schema (both the PATCH body and the profile response come from it).
6. **Mail with no paid services.** Mail is plain SMTP through nodemailer. It is enqueued in the business transaction, so it is sent only if that transaction committed. The worker enforces `SMTP_PER_DAY`/`SMTP_PER_MINUTE` before claiming jobs, and login codes go out first. CSV-imported students get **no** welcome mail. Their first login is "forgot password", which sends an OTP to their TU inbox.

## Synthesis decision

Two candidates were sketched in parallel:

- **A:** vertical modules with a `route()` declaration per endpoint.
- **B:** a central declarative transition table that auto-generates routes.

A blind cross-judge and my own reading both picked **A as the base**:

- A had the better API contract: typed responses and bulk recruiter actions.
- A's workflows were more correct.
- B had real bugs: recruiters could never shortlist, the email throttle could not count sends, and the probation check ran in the wrong order.

Grafted from B:

- the **Postgres trigger guard**, which replaced A's Prisma-extension + AsyncLocalStorage guard. The trigger also catches raw SQL and nested writes;
- the **fresh per-request user lookup** with `token_version`;
- **probation as its own audited machine** (`academic_standing`) instead of a plain boolean.

Rejected from B:

- auto-generated transition routes, because they give the frontend a weaker contract;
- the scoped read-only Prisma client, because nested `include`s leak through it.

## Tradeoffs accepted

- We accept in-memory rate limiting, which resets on restart. In exchange there is no Redis. OTP resend is also limited in the DB.
- We accept 404 rather than 403 for unreleased or foreign rows. In exchange no data leaks.
- We accept that `eligible_only` filters within a page, so a page can come back short. In exchange there is no denormalised eligibility table.
- We accept that a notice emailed to every student drains over days under Gmail's cap. In exchange there are no paid services. The in-app noticeboard is the primary channel, and the university relay removes the cap.
- We accept `any` in exactly one place (the delegate lookup in `defineMachine`).

## Alternatives considered

- **A central transition table plus generated routes (candidate B).** It is deep, but every action gets a generic `{changed}` response, and per-role read shapes fold into one path.
- **Layered folders (routes/controllers/services/repos).** Each rule gets spread across four folders.
- **Prisma-extension guard for status writes.** It misses raw SQL and nested writes. The trigger catches everything.

## Open questions and risks

- **Recruiter "return for correction"** is implemented as reject-with-reason followed by `/auth/resubmit/recruiter`. Is that what the T&P cell means?
- **Alumni flip:** students become alumni on 1 July after `year_of_completion`. Is that the right date?
- **Age for `max_age`** is measured on the day of applying. Should it be the posting deadline instead?
- **Teachers have full admin power.** Do we need a restricted `faculty` role?
- **CSV import:** no welcome mail is sent; students activate through forgot-password. Is that acceptable to the T&P cell?

## Next implementation step

Point the Docker build at the university server, run `deploy/backup.sh` once, and do one real restore.
