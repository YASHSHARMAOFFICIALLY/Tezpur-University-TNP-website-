# Event registration window

The T&P admin creates and publishes trainings, expert sessions, awareness programmes and workshops, each with a registration window. Students can register only inside the window, only once, and not while on academic probation. They can cancel and re-register while the window is open.

## Sub-features

- `event-validate`: a window that closes before it opens returns `VALIDATION_FAILED`.
- `event-draft-hidden`: registering for an unpublished event returns `NOT_FOUND`.
- `event-window`: outside the window returns `REGISTRATION_CLOSED` (with `opens_at`/`closes_at`); inside it returns `201`.
- `event-dup`: a second registration returns `ALREADY_REGISTERED`.
- `event-probation`: a student on probation gets `ON_PROBATION`; it is lifted by the admin.
- `event-cancel`: cancel, then re-register on the same registration row.

## How to get to it (user POV)

- Admin events page: `POST /admin/events`, then `POST /admin/events/{id}/publish`.
- Admin student record: `POST /admin/students/{id}/probation`.
- Student events list: `GET /events`. "Register" button: `POST /events/{id}/register`. Cancel: `POST /events/{id}/cancel-registration`. "My events": `GET /events/mine`.

## Driving it with tnpctl

Preconditions:

- Instance launched, `doctor` ok, `$C admin` done.

- **Bad window.** Result: `VALIDATION_FAILED`.
- **Draft.** Register before publishing. Result: `NOT_FOUND`.
- **Open window.** Publish, then register. Result: `201`. Registering again returns `ALREADY_REGISTERED`.
- **Future window.** Result: `REGISTRATION_CLOSED`.
- **Probation.** The admin sets probation and the student cancels. Re-registering returns `ON_PROBATION`. After the admin lifts it, registering returns `201` with the same id.
- **Second view.** `GET /events/mine` shows `registered`. In SQL, the registration's audit has created, cancelled and registered rows.

```bash
STU=$($C make-student stu4)
SID=$($C sql "select s.id from students s join users u on u.id = s.user_id where u.email = '$STU'")
at() { date -u -v"$1" +%Y-%m-%dT%H:%M:%SZ; }
EV='{"type":"%s","name":"%s","starts_at":"%s","registration_opens_at":"%s","registration_closes_at":"%s"}'
$C api POST /admin/events "$(printf "$EV" training "Bad window $TNP_RUN" "$(at +9d)" "$(at +2d)" "$(at +1d)")" --as admin;   $C expect VALIDATION_FAILED
$C api POST /admin/events "$(printf "$EV" workshop "Open $TNP_RUN" "$(at +1d)" "$(at -1H)" "$(at +1H)")" --as admin;       $C expect 201; OPEN=$($C last .id)
$C api POST /admin/events "$(printf "$EV" training "Later $TNP_RUN" "$(at +9d)" "$(at +1d)" "$(at +2d)")" --as admin;      $C expect 201; LATER=$($C last .id)
$C api POST /events/$OPEN/register --as stu4;                         $C expect NOT_FOUND
$C api POST /admin/events/$OPEN/publish --as admin;                   $C expect 200
$C api POST /admin/events/$LATER/publish --as admin;                  $C expect 200
$C api POST /events/$OPEN/register --as stu4;                         $C expect 201; REG=$($C last .id)
$C api POST /events/$OPEN/register --as stu4;                         $C expect ALREADY_REGISTERED
$C api POST /events/$LATER/register --as stu4;                        $C expect REGISTRATION_CLOSED; $C last '.error.details'
$C api POST /admin/students/$SID/probation '{"on":true,"reason":"verify"}' --as admin; $C expect 200
$C api POST /events/$OPEN/cancel-registration --as stu4;              $C expect 200
$C api POST /events/$OPEN/register --as stu4;                         $C expect ON_PROBATION
$C api POST /admin/students/$SID/probation '{"on":false}' --as admin; $C expect 200
$C api POST /events/$OPEN/register --as stu4;                         $C expect 201; [ "$($C last .id)" = "$REG" ] && echo "PASS same registration row"
$C api GET /events/mine --as stu4; $C last '.data | map({status, name: .event.name})'
$C sql "select action from audit_log where entity_id='$REG' order by id"   # created, registered->cancelled, cancelled->registered
```

## Gotchas

- The window is `[opens, closes)`. A registration exactly at `registration_closes_at` is closed.
- Students can cancel only while the window is open. After it closes, cancelling returns `REGISTRATION_CLOSED`.
- `GET /events` lists only `published` and `completed` events. Drafts are visible only through `GET /admin/events`.
- Confirming and marking attendance are admin bulk actions (`POST /admin/registrations/confirm|attend`); this recipe does not cover them.
