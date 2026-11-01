# Admin operations

The TPO runs the portal. They approve students and recruiters, decide on postings, release applicants to recruiters, publish events and results, and post notices. They also answer company threads, send feedback forms, import students by CSV, manage teachers, programmes, the university profile and settings, and check health and the audit log.

## Sub-features

- `adm-dashboard`: the counts include only active students and active recruiters.
- `adm-queue`: the pending queue shows the student's real programme, the CSV export is formula-safe, and "Approve" works.
- `adm-posting-decision`: on the postings tab, the admin can approve a posting or return it.
- `adm-release`: the release counts include applicants on every page.
- `adm-events`: the admin publishes through "Broadcast & Enlist Session". A failed publish succeeds on retry without a duplicate. A failed Complete shows an error.
- `adm-comms`: student notices, company threads and feedback forms (`/admin/comms`).
- `adm-students`: CSV import (a polled job), editing a record, and the probation toggle (`/admin/students`).
- `adm-teachers`: creating a teacher login with a one-time password (`/admin/teachers`).
- `adm-content`: programmes (shown on the public page), the university profile and the brochure upload (`/admin/content`).
- `adm-system`: a setting changes and resets, and health and audit render (`/admin/system`).

## How to get to it (user POV)

- Sign in as admin at `/login` and land on `/admin`. The sidebar (a scroll strip below `lg`) links the sub-pages.

## Driving it with webctl

Preconditions: the baseline.

- **Approvals, release, events, results:** `webctl suite e2e`.
- **Everything under comms, students, teachers, content and system:** `webctl suite ops`.
- **Screenshots of every page at phone width:** `for p in /admin /admin/students /admin/teachers /admin/comms /admin/content /admin/system; do webctl shot admin $p 390; done`. Each must report no horizontal overflow.

## Gotchas

- The `jobs.payload` text and subject are blanked after a mail is sent. Count mails by `payload->>'to'`, or read them in Mailpit.
- Approving a posting whose deadline has passed is refused with "The apply deadline has already passed". Return it to the recruiter instead.

- Approving or rejecting changes shared state. Use the suite's fresh accounts, not the seed accounts.
- CSV import runs as a background job. Poll for it to finish, as the ops suite does, before you check the student list.
