# Apply with eligibility

A student applies to an approved posting. The API refuses until the profile is complete (resume, photo and academic facts), refuses ineligible students with every failing rule listed, stores the eligibility snapshot on the application, and refuses a second application.

## Sub-features

- `apply-profile`: `PROFILE_INCOMPLETE` with `details.missing`.
- `apply-files`: uploads are checked by magic bytes; a PNG sent as a resume returns `FILE_TYPE_NOT_ALLOWED`.
- `apply-ineligible`: `NOT_ELIGIBLE` with `details.reasons` (rule, required, actual).
- `apply-ok`: `201 applied`; the eligibility snapshot is stored on the row.
- `apply-dup`: `ALREADY_APPLIED` with the existing `application_id`.

## How to get to it (user POV)

- Student profile page: `PATCH /students/me`, `POST /students/me/resume`, `POST /students/me/photo`.
- Opportunity detail "Apply" button: `POST /opportunities/{id}/apply`.
- "My applications": `GET /applications/mine`.

## Driving it with tnpctl

Preconditions:

- Instance launched, `doctor` ok, `$C admin` done. The recipe sets up its own approved posting (min CGPA 7, one programme).

- **Incomplete profile.** Apply. Result: `PROFILE_INCOMPLETE`, with the missing fields listed.
- **Bad file.** Upload a PNG as the resume. Result: `FILE_TYPE_NOT_ALLOWED`. A PDF resume and a PNG photo return `201`.
- **Ineligible.** Set CGPA to 6.5 and apply. Result: `NOT_ELIGIBLE`, with reason `min_cgpa required 7 actual 6.5`.
- **Eligible.** Set CGPA to 8.1 and apply. Result: `201 applied`. In SQL, the row has `eligibility_result.eligible = true` and `rule.min_cgpa = 7`.
- **Duplicate.** Apply again. Result: `ALREADY_APPLIED`, with the same id.
- **Student view.** `GET /applications/mine` shows `applied`.

```bash
$C make-recruiter rec2 >/dev/null; $C make-student stu2 >/dev/null
$C api POST /admin/programmes "{\"department\":\"CSE\",\"name\":\"B.Tech CSE\",\"code\":\"A$TNP_RUN\"}" --as admin; PROG=$($C last .id)
DL=$(date -u -v+7d +%Y-%m-%dT%H:%M:%SZ)
$C api POST /company/opportunities "{\"type\":\"job\",\"title\":\"SDE $TNP_RUN\",\"description\":\"Build things for a living.\",\"apply_deadline\":\"$DL\",\"eligibility\":{\"min_cgpa\":7,\"programmes\":[\"$PROG\"]},\"selection_process\":{}}" --as rec2; OPP=$($C last .id)
$C api POST /company/opportunities/$OPP/submit --as rec2; $C api POST /admin/opportunities/$OPP/decision '{"decision":"approve"}' --as admin; $C expect 200

$C api POST /opportunities/$OPP/apply --as stu2;                         $C expect PROFILE_INCOMPLETE; $C last '.error.details.missing'
$C upload /students/me/resume "$($C fixture png)" --as stu2;             $C expect FILE_TYPE_NOT_ALLOWED
$C upload /students/me/resume "$($C fixture pdf)" --as stu2;             $C expect 201
$C upload /students/me/photo  "$($C fixture png)" --as stu2;             $C expect 201
$C api PATCH /students/me "{\"cgpa\":6.5,\"programme_id\":\"$PROG\",\"year_of_completion\":2027,\"dob\":\"2003-05-01\"}" --as stu2; $C expect 200
$C api POST /opportunities/$OPP/apply --as stu2;                         $C expect NOT_ELIGIBLE; $C last '.error.details.reasons'
$C api PATCH /students/me '{"cgpa":8.1}' --as stu2;                      $C expect 200
$C api POST /opportunities/$OPP/apply --as stu2;                         $C expect 201; APP=$($C last .id); $C save apply-ok
$C api POST /opportunities/$OPP/apply --as stu2;                         $C expect ALREADY_APPLIED
$C sql "select status, eligibility_result->>'eligible', eligibility_result->'rule'->>'min_cgpa' from applications where id='$APP'"  # applied | true | 7
$C api GET /applications/mine --as stu2;                                 $C expect 200; $C last '.data[0].status'
```

## Gotchas

- The order of checks is contract: `ON_PROBATION`, then `PROFILE_INCOMPLETE`, then `NOT_FOUND`/`OPPORTUNITY_NOT_OPEN`, then `NOT_ELIGIBLE`, then `ALREADY_APPLIED`. A recipe that skips the profile step sees `PROFILE_INCOMPLETE`, not an eligibility error.
- A missing fact fails the rule that needs it. A student with no CGPA is not ">= 7".
- Age for `max_age` is measured on the day of applying.
- Uploads take the field name `file` only. The resume limit is 5 MB and the photo limit is 2 MB.
