# Release gate and shortlist

A recruiter cannot see, act on, or download anything about an applicant until the T&P admin releases them. After release, the recruiter sees the applicant, can download their resume, and can shortlist them. Every step is audited, and the people affected are emailed.

## Sub-features

- `gate-hidden`: before release, the applicant list is empty, shortlist returns `NOT_FOUND`, and the resume download returns 404.
- `gate-release`: the admin releases all `applied` applicants of a posting, and the recruiter is emailed.
- `gate-visible`: after release, the applicant list includes the student without `academic_standing`, and the resume downloads.
- `gate-shortlist`: shortlisting moves the application to `shortlisted`, the student is emailed, and the student sees the new status.
- `gate-audit`: `audit_log` has created, released and shortlisted rows.

## How to get to it (user POV)

- Recruiter applicants page: `GET /company/opportunities/{id}/applicants`. Resume link: `GET /files/{id}`.
- Recruiter shortlist action: `POST /company/applications/shortlist`.
- Admin "release to recruiter" button: `POST /admin/opportunities/{id}/release`.

## Driving it with tnpctl

Preconditions:

- Instance launched, `doctor` ok, `$C admin` done. The recipe builds an approved posting with one eligible application.

- **Hidden.** Before release: the applicant list is `[]`, shortlist returns `NOT_FOUND`, and the resume download returns `NOT_FOUND`.
- **Release.** Result: `{"released":1}`.
- **Visible.** The list has one row with `status = released_to_recruiter` and no `academic_standing`. The resume download returns `200`.
- **Shortlist.** Result: `{"changed":1}`. The student's "my applications" shows `shortlisted`.
- **Side effects.** The audit trail has 3 rows. Mailpit shows `Applicants released: ...` to the recruiter and `You have been shortlisted` to the student.

```bash
REC=$($C make-recruiter rec3); STU=$($C make-student stu3)
$C api POST /admin/programmes "{\"department\":\"CSE\",\"name\":\"B.Tech CSE\",\"code\":\"G$TNP_RUN\"}" --as admin; PROG=$($C last .id)
DL=$(date -u -v+7d +%Y-%m-%dT%H:%M:%SZ)
$C api POST /company/opportunities "{\"type\":\"internship\",\"title\":\"Intern $TNP_RUN\",\"description\":\"Summer internship role.\",\"apply_deadline\":\"$DL\",\"eligibility\":{},\"selection_process\":{}}" --as rec3; OPP=$($C last .id)
$C api POST /company/opportunities/$OPP/submit --as rec3; $C api POST /admin/opportunities/$OPP/decision '{"decision":"approve"}' --as admin
$C upload /students/me/resume "$($C fixture pdf)" --as stu3; $C upload /students/me/photo "$($C fixture png)" --as stu3
$C api PATCH /students/me "{\"cgpa\":8,\"programme_id\":\"$PROG\",\"year_of_completion\":2027,\"dob\":\"2003-05-01\"}" --as stu3
$C api POST /opportunities/$OPP/apply --as stu3; $C expect 201; APP=$($C last .id)
RES=$($C sql "select s.resume_file_id from students s join users u on u.id = s.user_id where u.email = '$STU'")

$C api GET /company/opportunities/$OPP/applicants --as rec3;                                   $C expect 200; [ "$($C last '.data | length')" = 0 ] && echo "PASS hidden before release"
$C api POST /company/applications/shortlist "{\"application_ids\":[\"$APP\"]}" --as rec3;      $C expect NOT_FOUND
$C api GET /files/$RES --as rec3;                                                              $C expect NOT_FOUND
$C api POST /admin/opportunities/$OPP/release '{}' --as admin;                                 $C expect 200; $C last .released
$C api GET /company/opportunities/$OPP/applicants --as rec3;                                   $C expect 200; $C save applicants-after-release
$C last '.data[0] | {status, name: .student.user.name, leaks_standing: (.student | has("academic_standing"))}'
$C api GET /files/$RES --as rec3 | head -1;                                                     $C expect 200
$C api POST /company/applications/shortlist "{\"application_ids\":[\"$APP\"]}" --as rec3;      $C expect 200
$C api GET /applications/mine --as stu3; [ "$($C last '.data[0].status')" = shortlisted ] && echo "PASS student sees shortlisted"
$C sql "select action from audit_log where entity_id='$APP' order by id"   # created, applied->released_to_recruiter, released_to_recruiter->shortlisted
sleep 3; $C mail "$REC"; $C mail "$STU"
```

## Gotchas

- `$C api GET /files/...` prints binary data on success. Pipe it to `head -1`, or check only `expect 200`.
- An unreleased or another company's application is reported as `NOT_FOUND`, never `FORBIDDEN`, so it does not leak that the row exists.
- Release with no body releases **all** `applied` rows of the posting. Pass `application_ids` to release some.
- Shortlist is idempotent. Shortlisting again returns `{"changed":0}`, with no new audit row or email.
