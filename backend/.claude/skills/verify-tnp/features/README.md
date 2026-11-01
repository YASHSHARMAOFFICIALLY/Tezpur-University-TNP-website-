# T&P portal verification map

This directory is the maintained source for verifying what users of the T&P backend experience. Read this index before driving the API, then use the matching feature file as the recipe.

## Baseline preconditions

- Work from `backend/` with `C=.claude/skills/verify-tnp/tnpctl`.
- Start a fresh instance with `eval "$($C launch)"`. `$C doctor` must print only `ok` lines.
- Run `$C admin` once per run. It gives a working admin token named `admin`, after the forced password change.
- Each recipe creates its own actors (`$C make-student`, `$C make-recruiter`) with unique emails, so recipes run in any order and can share one instance.
- Never drive an instance this run did not launch.

## Driving conventions

- Run each recipe's bash block as-is. Every step ends in `$C expect ...`, and a failed expect exits non-zero.
- Commands are literal. Keep paths, JSON keys and `error.code` values unchanged; they are API contract.
- Dates are computed with BSD `date -u -v` (macOS). On Linux, use `date -u -d '+1 day'`.
- The worker sends mail every ~2 s. `$C otp` waits for it. For other mail, `sleep 3` before `$C mail`.

## Proof and skip reporting

- Proof is `transcript.log` in `.verify-artifacts/<run>/`: requests, responses, OTP reads, and every `PASS`/`FAIL` line.
- A mutation is proven by a second read-only view: a GET as another actor, `$C sql`, or `$C mail`.
- A rule is proven by its refusal code **and** the success after the precondition is met.
- Report a step that cannot run with the command tried and the precondition that was not met. Never report a journey as verified through a different entry point than the one its file names.

## Feature entry contract

Each feature file starts with an H1 and one paragraph, then exactly four H2 sections: `Sub-features`, `How to get to it (user POV)`, `Driving it with tnpctl`, `Gotchas`.

## Features

- [Student signup and OTP](./student-signup.md): university-email registration, OTP verification, admin approval, login.
- [Recruiter posting and admin approval](./recruiter-posting.md): recruiter onboarding, draft posting, submit, admin approval, student visibility and noticeboard.
- [Apply with eligibility](./apply-eligibility.md): profile gate, file sniffing, eligibility reasons, stored snapshot, duplicate apply.
- [Release gate and shortlist](./release-gate.md): nothing visible to the recruiter before release, file access, shortlist, audit trail, emails.
- [Event registration window](./event-registration.md): window enforcement, duplicate registration, probation block, cancel and re-register.
