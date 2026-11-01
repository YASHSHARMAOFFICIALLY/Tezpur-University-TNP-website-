# Recruiter posting and admin approval

A recruiter registers their organisation, is approved, and drafts a job posting. Students cannot see a draft until the recruiter submits it and the T&P admin approves it. Approval publishes it to the student list and the noticeboard, and emails the recruiter.

## Sub-features

- `post-onboard`: recruiter self-registration, OTP, admin approval.
- `post-draft`: create a draft with eligibility rules. It is invisible to students.
- `post-submit`: draft to `pending_admin`. It appears in the admin queue.
- `post-approve`: admin approves. It shows in student `GET /opportunities` with `my_eligibility`, a notice is posted, and the recruiter is emailed.
- `post-return`: admin returns a posting to draft with a reason (`decision: "return"`).

## How to get to it (user POV)

- Recruiter portal sign-up: `POST /auth/register/recruiter`, then `POST /auth/verify-otp`.
- Recruiter "new posting" form: `POST /company/opportunities`, then `POST /company/opportunities/{id}/submit`.
- Admin approval queue: `GET /admin/pending` (`.opportunities`), then `POST /admin/opportunities/{id}/decision`.
- Student opportunities list: `GET /opportunities`. Detail view: `GET /opportunities/{id}`. Noticeboard: `GET /noticeboard`.

## Driving it with tnpctl

Preconditions:

- Instance launched, `doctor` ok, `$C admin` done.

- **Onboard the recruiter.** `$C make-recruiter rec1` drives register, OTP from Mailpit, approval and login.
- **Programme.** The admin creates a programme to target in the eligibility rule.
- **Draft.** Result: `201` with `status: "draft"`. A student GET of it returns `NOT_FOUND`.
- **Submit.** It appears in `.opportunities` of the admin queue with `pending_admin`.
- **Approve.** A student sees it in `GET /opportunities`. `my_eligibility.reasons` explain why this incomplete student is not eligible. The noticeboard's newest title names the posting, and Mailpit shows `Posting approved: ...` to the recruiter.
- **Return path.** A second posting returned with a reason goes back to `draft` with `review_note` set.

```bash
REC=$($C make-recruiter rec1); STU=$($C make-student stu1)
$C api POST /admin/programmes "{\"department\":\"CSE\",\"name\":\"B.Tech CSE\",\"code\":\"P$TNP_RUN\"}" --as admin; $C expect 201; PROG=$($C last .id)
DL=$(date -u -v+7d +%Y-%m-%dT%H:%M:%SZ)
POST='{"type":"job","title":"%s","description":"Build things for a living.","apply_deadline":"'$DL'","eligibility":{"min_cgpa":7,"programmes":["'$PROG'"]},"selection_process":{"technical_interview":true}}'
$C api POST /company/opportunities "$(printf "$POST" "Graduate Engineer $TNP_RUN")" --as rec1; $C expect 201; OPP=$($C last .id)
$C api GET /opportunities/$OPP --as stu1;                         $C expect NOT_FOUND
$C api POST /company/opportunities/$OPP/submit --as rec1;         $C expect 200
$C api GET /admin/pending --as admin; [ "$($C last ".opportunities[] | select(.id == \"$OPP\") | .status")" = pending_admin ] && echo "PASS in admin queue"
$C api POST /admin/opportunities/$OPP/decision '{"decision":"approve"}' --as admin; $C expect 200
$C api GET /opportunities/$OPP --as stu1;                         $C expect 200; $C last '.my_eligibility'
$C api GET /noticeboard --as stu1; $C last '.data[0].title' | grep -q "Graduate Engineer $TNP_RUN" && echo "PASS noticeboard"
$C api POST /company/opportunities "$(printf "$POST" "Returned $TNP_RUN")" --as rec1; OPP2=$($C last .id)
$C api POST /company/opportunities/$OPP2/submit --as rec1
$C api POST /admin/opportunities/$OPP2/decision '{"decision":"return","reason":"Add CTC details"}' --as admin; $C expect 200
$C sql "select status, review_note from opportunities where id='$OPP2'"   # draft | Add CTC details
sleep 3; $C mail "$REC"                                                    # Posting approved / Posting draft
```

## Gotchas

- `apply_deadline` must be in the future, or the approved posting is listed as not open and apply returns `OPPORTUNITY_NOT_OPEN`.
- Programme `code` is unique. Suffix it with `$TNP_RUN`.
- Only drafts can be edited (`PATCH /company/opportunities/{id}`). Editing a submitted posting returns `INVALID_TRANSITION`.
- `reject` is final for postings. Use `return` for "fix and resubmit".
