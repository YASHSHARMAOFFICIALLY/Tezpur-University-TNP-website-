# Admin operations

A teacher running the portal, with no developer around, checks whether everything is working, changes a setting without editing `.env`, reads what broke and what to do about it, and fixes the common problems: failed emails, a forgotten password, a locked-out login.

## Sub-features

- `ops-health` reports database, worker, jobs, email, backup, disk and recent errors, with an overall status and plain-English problems.
- `ops-settings` changes a setting, which takes effect for real users immediately. A bad value is refused with the reason, and every change is audited.
- `ops-errors` keeps an error log of server errors and failed background tasks, each with an admin hint.
- `ops-retry-emails` puts failed emails back in the queue, and they are delivered.
- `ops-reset-password` emails a one-time password, signs the user out everywhere, and forces a password change at next login.
- `ops-clear-limit` unlocks an account that hit the login attempt limit.

## How to get to it (user POV)

- Admin portal status page: `GET /admin/system-health`.
- Settings page: `GET /admin/settings`, `PUT /admin/settings/{key}` with `{"value": ...}`, `DELETE /admin/settings/{key}` (back to default).
- Error log: `GET /admin/errors?code=&q=&from=&to=`. All codes and their hints: `GET /admin/error-codes`.
- Repairs: `POST /admin/repairs/retry-failed-emails`, plus `POST /admin/users/{id}/reset-password`, `/resend-otp` and `/clear-rate-limit` on a user's page.

## Driving it with tnpctl

Preconditions:

- Instance launched, `doctor` all ok, `$C admin` done.

- **Health.** The worker is alive, the database is ok, and with no backup recorded the status is `problem` with "No backup in the last 48 hours".
- **Setting.** Set `student_email_domain` to `example.edu`. Registering with `@tezu.ac.in` then returns `EMAIL_DOMAIN_NOT_ALLOWED`. A bad value is `VALIDATION_FAILED`. Reset restores the default, and the same registration then succeeds. `audit_log` has `setting.updated` and `setting.reset`.
- **Error log.** `$C fault doomed-job` queues a job on its last attempt with no handler. The worker fails it, and `/admin/errors?code=JOB_FAILED` shows its summary and hint.
- **Retry failed emails.** `$C fault failed-email` simulates mail lost in an SMTP outage. Health counts it. The retry returns `requeued: 1`, a second retry returns `requeued: 0`, and the mail arrives in Mailpit.
- **Reset password.** The admin resets a student's password. The old session gets 401. The one-time password arrives in Mailpit, login with it reports `must_change_password`, and everything else returns `PASSWORD_CHANGE_REQUIRED` until the student changes it.
- **Clear login limit.** After 11 wrong passwords even the right one gets `RATE_LIMITED`. The admin clears the limit and the right password works.

```bash
ok() { if eval "$2"; then echo "PASS $1"; else echo "FAIL $1"; fi; }
REG='{"email":"%s","password":"student-pass-1","name":"Ops Student","enrolment_no":"%s","mobile":"9876543210"}'

# ops-health
$C api GET /admin/system-health --as admin;                                       $C expect 200
ok "worker alive"            '[[ $($C last .worker.alive) == true ]]'
ok "database ok"             '[[ $($C last .database.ok) == true ]]'
ok "no backup is a problem"  '[[ $($C last .status) == problem ]] && $C last ".problems[]" | grep -qx "No backup in the last 48 hours"'

# ops-settings
$C api GET /admin/settings --as admin;                                            $C expect 200
ok "6 settings with help"    '[[ $($C last "[.[] | select(.help != \"\")] | length") == 6 ]]'
$C api PUT /admin/settings/student_email_domain '{"value":"example.edu"}' --as admin; $C expect 200
$C api POST /auth/register/student "$(printf "$REG" "dom$TNP_RUN@tezu.ac.in" "CSD${TNP_RUN:0:6}")"; $C expect EMAIL_DOMAIN_NOT_ALLOWED
$C api PUT /admin/settings/student_email_domain '{"value":"not a domain"}' --as admin; $C expect VALIDATION_FAILED
$C api DELETE /admin/settings/student_email_domain --as admin;                    $C expect 200
$C api POST /auth/register/student "$(printf "$REG" "dom$TNP_RUN@tezu.ac.in" "CSD${TNP_RUN:0:6}")"; $C expect 201
$C sql "select action, metadata from audit_log where entity='setting' order by id"   # setting.updated {from,to}, setting.reset

# ops-errors
$C fault doomed-job
for _ in $(seq 1 15); do $C api GET "/admin/errors?code=JOB_FAILED" --as admin >/dev/null; [[ $($C last ".data | length") -gt 0 ]] && break; sleep 1; done
$C expect 200
ok "job failure logged"      '[[ $($C last ".data[0].summary") == "Background task '"'"'verify.no_such_handler'"'"' failed after 5 attempts" ]]'
ok "hint attached"           '$C last ".data[0].hint" | grep -q "Retry failed emails"'
$C api GET /admin/error-codes --as admin;                                         $C expect 200

# ops-retry-emails
ER="retry$TNP_RUN@tezu.ac.in"; FJ=$($C fault failed-email "$ER")
$C api GET /admin/system-health --as admin;                                       $C expect 200
ok "failed email counted"    '[[ $($C last .email.failed) -ge 1 ]]'
$C api POST /admin/repairs/retry-failed-emails "{\"job_ids\":[\"$FJ\"]}" --as admin; $C expect 200
ok "requeued 1"              '[[ $($C last .requeued) == 1 ]]'
$C api POST /admin/repairs/retry-failed-emails "{\"job_ids\":[\"$FJ\"]}" --as admin; $C expect 200
ok "second retry is a no-op" '[[ $($C last .requeued) == 0 ]]'
sleep 4; ok "mail delivered"  '$C mail "$ER" | grep -q "Retry check"'
$C sql "select status, attempts from jobs where id='$FJ'"                          # done | 1

# ops-reset-password
E=$($C make-student resetme); U=$($C sql "select id from users where email='$E'")
$C api POST /admin/users/$U/reset-password --as admin;                            $C expect 200
ok "password not returned"   '[[ $($C last tojson) == "{\"emailed\":true}" ]]'
$C api GET /students/me --as resetme;                                             $C expect UNAUTHENTICATED
sleep 4; PW=$($C mail-body "$E" | sed -n 's/^One-time password: //p')
ok "forced change at login"  '$C login reset2 "$E" "$PW" | grep -q "\"must_change_password\":true"'
$C api GET /students/me --as reset2;                                              $C expect PASSWORD_CHANGE_REQUIRED
$C api POST /auth/change-password "{\"current_password\":\"$PW\",\"new_password\":\"fresh-pass-$TNP_RUN\"}" --as reset2; $C expect 200

# ops-clear-limit
E=$($C make-student lockme); U=$($C sql "select id from users where email='$E'")
for _ in $(seq 1 11); do $C api POST /auth/login "{\"email\":\"$E\",\"password\":\"wrong-password\"}" >/dev/null; done; $C expect RATE_LIMITED
$C api POST /auth/login "{\"email\":\"$E\",\"password\":\"pass-$TNP_RUN\"}";         $C expect RATE_LIMITED
$C api POST /admin/users/$U/clear-rate-limit --as admin;                          $C expect 200
$C api POST /auth/login "{\"email\":\"$E\",\"password\":\"pass-$TNP_RUN\"}";         $C expect 200
$C sql "select action from audit_log where action like 'user.%' or action like 'repair.%' order by id"
```

## Gotchas

- `$C sql` is read-only. The two faults go in through `$C fault`, the only command that writes to the database. Never use it for anything the API can do.
- The setting change is global to the instance. The recipe resets `student_email_domain` itself, so other recipes on the same instance are not affected. If a run dies between the PUT and the DELETE, run the DELETE by hand.
- `alive` means a worker tick within 3 intervals (6 s). A single long job, such as a 10,000-row CSV import, can make the worker look stopped until it finishes.
- A fresh verify database has no `backup_runs` rows, so health is always `problem` there. On the server, `deploy/backup.sh` writes a row on every run.
- Rate limits are in memory per route: 10 per minute per email on login and the OTP routes, plus 300 per minute per IP. Restarting the API also clears them.
