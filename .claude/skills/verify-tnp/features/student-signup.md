# Student signup and OTP

A student registers with their enrolment number and official university email, proves they own that inbox with a 6-digit code, waits in the admin approval queue, and can log in once approved.

## Sub-features

- `signup-domain` rejects non-university emails.
- `signup-otp` emails a code, rejects a wrong code, and accepts the right one.
- `signup-gates` reports `EMAIL_NOT_VERIFIED`, then `PENDING_ADMIN_APPROVAL`, at login.
- `signup-approve` takes the account through the admin queue to an active login, with audit and email.

## How to get to it (user POV)

- Student portal sign-up form: `POST /auth/register/student`.
- Code entry screen: `POST /auth/verify-otp` (resend: `POST /auth/resend-otp`).
- Admin portal approval queue: `GET /admin/pending`, then `POST /admin/users/{id}/decision`.
- Login screen: `POST /auth/login`.

## Driving it with tnpctl

Preconditions:

- Instance launched, `doctor` all ok, `$C admin` done.

- **Wrong domain.** Register with a Gmail address. Result: `EMAIL_DOMAIN_NOT_ALLOWED`.
- **Register.** Register with a `@tezu.ac.in` address. Result: `201 {"status":"pending_email_verify"}`.
- **Login before verifying.** Result: `EMAIL_NOT_VERIFIED`.
- **Wrong code.** Result: `OTP_INVALID`.
- **Right code.** Read the code from Mailpit. Result: `{"status":"pending_admin"}`.
- **Login before approval.** Result: `PENDING_ADMIN_APPROVAL`.
- **Approve.** The admin finds the email in `.students` of `/admin/pending` and approves it. Login now returns `user.role = "student"`.
- **Second views.** `audit_log` has the created / verified / approved rows. Mailpit has the OTP mail and the approval mail.

```bash
E="signup$TNP_RUN@tezu.ac.in"; ENR="CSB${TNP_RUN:0:6}"
REG='{"email":"%s","password":"student-pass-1","name":"Asha Das","enrolment_no":"'$ENR'","mobile":"9876543210"}'
$C api POST /auth/register/student "$(printf "$REG" "asha$TNP_RUN@gmail.com")"; $C expect EMAIL_DOMAIN_NOT_ALLOWED
$C api POST /auth/register/student "$(printf "$REG" "$E")";                     $C expect 201
$C api POST /auth/login "{\"email\":\"$E\",\"password\":\"student-pass-1\"}";    $C expect EMAIL_NOT_VERIFIED
$C api POST /auth/verify-otp "{\"email\":\"$E\",\"code\":\"000000\"}";          $C expect OTP_INVALID
$C api POST /auth/verify-otp "{\"email\":\"$E\",\"code\":\"$($C otp "$E")\"}";  $C expect 200
$C api POST /auth/login "{\"email\":\"$E\",\"password\":\"student-pass-1\"}";    $C expect PENDING_ADMIN_APPROVAL
$C api GET /admin/pending --as admin;                                            $C expect 200
SID=$($C last ".students[] | select(.email == \"$E\") | .id")
$C api POST /admin/users/$SID/decision '{"decision":"approve"}' --as admin;      $C expect 200
$C login signup "$E" student-pass-1 | grep -q '"role":"student"' && echo "PASS login role=student"
$C sql "select action from audit_log where entity_id='$SID' order by id"         # created, ->pending_admin, ->active
sleep 3; $C mail "$E"                                                            # "T&P portal code: ..." and "...account is approved"
```

## Gotchas

- Enrolment numbers must match `^[A-Za-z]{3}\d{5,6}$` and be unique. Derive them from `$TNP_RUN` for each run.
- `$C otp` returns the **newest** code. After a resend, the older code is no longer the one checked.
- A resend within 60 s returns `OTP_RESEND_TOO_SOON`. Do not resend in a loop.
- Login is rate-limited to 10 per minute per IP. Repeated runs against one instance can hit `RATE_LIMITED`.
