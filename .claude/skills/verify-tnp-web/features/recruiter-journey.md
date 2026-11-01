# Recruiter drive lifecycle

A recruiter registers their organisation (4 steps plus OTP) and is approved by the admin. They create a posting in the Posting Studio and submit it for approval. After the admin releases applicants, they shortlist, schedule interviews, submit final selections, close the drive and message the placement cell.

## Sub-features

- `rec-register`: 4-step registration with OTP, which waits for admin approval. After a rejection, the recruiter corrects the form and resubmits from `/login`.
- `rec-posting`:
  - "Create New Job Opening" → dialog "Job & Internship Posting Studio" → submit;
  - retrying after a failed submit reuses the draft;
  - the deadline is 23:59 local time.
- `rec-returned`: a posting the admin returned is edited and resubmitted, and fields not edited survive.
- `rec-applicants`: every released applicant is visible across all pages, including those with CGPA below 6.
- `rec-shortlist`: "Bulk Shortlist ( n )" only selects rows in the visible drive. Interviews can be scheduled.
- `rec-final`: "Submit as Final Selections" asks for confirmation, because it replaces earlier selections.
- `rec-csv`: the applicant CSV export neutralises cells that start with a formula character.
- `rec-close`: the recruiter closes the drive, and the admin can still publish results.
- `rec-liaison`: the "Send" message reaches the admin thread.
- `rec-profile`: the organisation profile and contacts are editable.

## How to get to it (user POV)

- Registration starts from the public page's recruiter registration. After approval, the recruiter signs in at `/login` and lands on `/recruiter`.

## Driving it with webctl

Preconditions: the baseline. The admin must approve the posting and release applicants, and the suite does both.

- **Lifecycle:** `webctl suite e2e`, steps "recruiter login lands on /recruiter" through "recruiter sends liaison message".
- **Registration, profile and returned posting:** `webctl suite ops`.
- **Edge cases with no suite step yet:**
  - submitting final selections twice;
  - a deadline in the past;
  - a recruiter opening `/student`;
  - the 390px layout of the Posting Studio dialog.

## Gotchas

- The demo recruiter accumulates postings from every suite run. Select postings by title, never by position. `seed-demo.mjs` once broke on exactly this.
