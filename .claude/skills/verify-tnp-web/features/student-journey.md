# Student registration and applying

A student registers with a university email, verifies it with an emailed code, and waits for admin approval. Then they complete a profile with a photo and resume, see which postings they are eligible for, apply in one click, register for events and see their result on the posting card.

## Sub-features

- `stu-register` covers `/#register` → "Student / Candidate" tab → form → "Send code" → "Verification Code *" → "Verify & Submit".
- `stu-pending` means an unapproved student who signs in sees the pending message, not the portal.
- `stu-ineligible` means a new student with no CGPA sees the posting marked ineligible.
- `stu-profile` means "Save Profile" stores the photo and resume uploads (PDF and image, checked by magic bytes).
- `stu-apply` means "Apply Now" applies without a reload, and the card updates.
- `stu-event` covers registering for a published event.
- `stu-result` means the selection shows on the card after the admin publishes results.
- `stu-notice` means a notice the admin posted shows on `/student`.

## How to get to it (user POV)

- Public page `https://localhost/#register` for registration, and `/login` → `/student` after approval.

## Driving it with webctl

Preconditions: the baseline. The admin must approve the new student, and the suite does that itself.

- **Full path:** `webctl suite e2e`. The student steps are "student self-registration + OTP verification (UI)" through "student sees selection on their card".
- **Notice:** `webctl suite ops`, step "admin posts a student notice; student sees it".
- **Edge cases with no suite step yet:**
  - wrong OTP;
  - expired OTP;
  - an email outside `tezu.ac.in`;
  - a duplicate enrolment number;
  - applying after the deadline;
  - applying twice (double-click);
  - an upload that is not a PDF but is renamed `.pdf`.

  Write each as a journey that uses `otpFor` and `getByRole("alert")`.

## Gotchas

- OTP mail arrives through the job worker and can take a few seconds. `otpFor` polls Mailpit for 15 s.
- The seed student is shared by every suite. Use a fresh student for anything that changes state.
