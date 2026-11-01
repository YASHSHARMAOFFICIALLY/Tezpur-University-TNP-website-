# T&P web portal verification map

This directory is the maintained source for verifying what users of the T&P portal see and do. Read the index before driving the app. Then use the matching feature file as the recipe.

## Baseline preconditions

- `webctl up` has passed. Every `doctor` line is `ok` against `https://localhost`.
- The seed data exists: admin, `csb21045@tezu.ac.in` (student, CGPA 8.92, CSE 2026), `hr.demo@cognizant-demo.test` (recruiter, Cognizant), the posting "Software Development Engineer - Cloud", one workshop event and one notice.
- Nothing else is driving the stack.

## Driving conventions

- Run suites through `webctl suite`, and ad-hoc checks as journeys through `webctl journey`.
- Each suite creates fresh accounts and postings with a run suffix, so a suite can be re-run without a reset.
- Locate elements by ARIA role and accessible name. Errors are always `role=alert`.
- Do not log out the seed student mid-suite from a second context. That revokes the suite's session.

## Proof and skip reporting

- Report the suite or journey, every step name, PASS/FAIL, and the artifacts path.
- A FAIL is a finding. Report it with the step, the error line and a screenshot. Never edit a step to make it pass. If the step itself was wrong, say so and show the evidence.
- If a journey needs a precondition the seed lacks, report it as unmet and add it to that feature's Gotchas.

## Edge-case journeys

Run these one at a time:

- `journeys/sign-in.mjs`
- `journeys/student.mjs`
- `journeys/recruiter.mjs`
- `journeys/admin.mjs`

They cover:

- wrong, expired and locked OTP;
- resend cooldown;
- refresh during registration;
- double submit;
- empty and ineligible states;
- a deadline passing while the page is open;
- probation;
- recruiter access before release;
- a lapsed posting in the admin queue;
- every portal at 390px.

## Features

- [Sign-in and route guards](./sign-in-and-guards.md) covers login, wrong password, guards for guests and other roles, logout and phone width, for all three roles.
- [Student registration and applying](./student-journey.md) covers self-registration with OTP, the pending state, profile and uploads, eligibility, applying, events and seeing a result.
- [Recruiter drive lifecycle](./recruiter-journey.md) covers 4-step registration, the Posting Studio, returned postings, released applicants, shortlists, interviews, final selections, CSV and liaison messages.
- [Admin operations](./admin-journey.md) covers the approval queue, posting decisions, release, events, notices, threads, feedback forms, CSV import, teachers, programmes, settings and audit.
- [Password and session](./password-and-session.md) covers forgot/reset, forced one-time password change, token refresh, revocation and no data leak between users.
