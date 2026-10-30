---
name: verify-tnp
description: Drive the Tezpur University T&P portal backend (HTTP API at /api/v1, plus the emails it sends) the way the three frontends and their users do. Use it to prove a backend change works end to end, such as signup with an email OTP, postings, apply/eligibility, the recruiter release gate, or event registration, before calling the work done. It launches an isolated instance with its own database and port, so it never touches the developer's `npm run dev`.
---

# verify-tnp

The product surface is a JSON HTTP API (`/api/v1`). Three portals call it: admin/teacher, student and recruiter. Its emails are part of the behaviour too. Email OTPs are the only way to verify an account, and in dev all mail lands in **Mailpit** (`http://localhost:8025`). Proving a change means calling the API as a real client would, then checking that the stored state and the emails actually sent match.

Everything goes through `tnpctl`, which sits next to this file. Run it from `backend/`:

```sh
C=.claude/skills/verify-tnp/tnpctl
```

## Launch

```sh
eval "$($C launch)"   # sets TNP_RUN; prints the URL, database and artifacts dir on stderr
$C doctor              # must print only "ok" lines
$C admin               # logs in as the seeded TPO and completes the forced password change; token name "admin"
```

`launch` does all of this, starting from nothing:

1. `docker compose --profile dev up -d postgres mailpit` (Postgres on `localhost:5434`, Mailpit on `:8025`/`:1025`).
2. Creates a database `tnp_verify_<run>`, runs `prisma migrate deploy`, and runs the seed, which creates the TPO `tpo-<run>@tezu.ac.in`.
3. Starts `tsx src/server.ts` on a free port, with its own `UPLOAD_DIR`, fresh secrets, SMTP pointed at Mailpit, and the job worker on.
4. Waits until **ready**: `/readyz` reaches the DB **and** the log shows `"api listening"`.

Several runs can live side by side. Run state is in `$TMPDIR/tnp-verify/<run>/`. Prerequisites: Docker running, `npm ci` and `npx prisma generate` done once, plus `jq`, `psql` and `curl`.

## Doctor

`$C doctor` is read-only. It checks that:

- the recorded process is alive;
- the API port is owned by this run's process tree;
- `/readyz` is OK;
- the env points at the disposable `tnp_verify_<run>` DB;
- the OpenAPI document has more than 60 paths;
- Mailpit answers.

Run it first whenever anything looks off. Never drive an instance this run didn't launch. In particular, never drive the developer's `:3000` server.

## Drive

| Command | Does |
|---|---|
| `$C api METHOD /path ['{json}'] [--as NAME]` | Calls `$BASE/path` and prints `HTTP <code>` plus the body. Everything is logged. |
| `$C upload /path FILE --as NAME` | multipart upload with field `file` |
| `$C expect 201` / `$C expect NOT_ELIGIBLE` | asserts the last response's HTTP status or `error.code`; exits 1 on mismatch |
| `$C last .id` | applies exactly one jq filter to the last response body, no jq flags (they are passed as the filter and break); use `$C last '.x\|tojson'` for compact output |
| `$C login NAME EMAIL PASSWORD` | stores a bearer token under NAME |
| `$C make-student NAME` / `$C make-recruiter NAME` | full real signup path (register, OTP from Mailpit, admin approval, login). Prints the email. |
| `$C otp EMAIL` | newest 6-digit code mailed to EMAIL (waits up to 20 s for the worker) |
| `$C mail EMAIL` | subjects of all mail sent to EMAIL |
| `$C sql "select ..."` | read-only query on this run's DB (second view of stored state) |
| `$C fault failed-email EMAIL` / `$C fault doomed-job` | inserts one `jobs` row (a failed email, or a job on its last attempt with no handler) into this run's DB; prints the id. The only write tnpctl makes, for faults the API cannot cause. |
| `$C fixture pdf\|png` | minimal valid file. Uploads are checked by magic bytes, not by extension. |
| `$C save NAME` | copies the last body into artifacts as `NAME.json` |

Stable handles are the route paths and `error.code` values. The contract lives in `src/middleware/errors.ts` and at `$BASE/openapi.json`. Recipes for each feature are in [features/README.md](features/README.md).

## Evidence

Artifacts go in `backend/.verify-artifacts/<run>/`, which is gitignored and **kept by `stop`**:

- `transcript.log`: every request (actor, method, path, body) and response (status, body), every OTP read, and every `expect` PASS/FAIL line;
- `api.log`: the server log, copied at stop;
- any `$C save NAME` bodies.

Proof standards:

- Go through the public API, never internal functions or direct DB writes. The one exception is `$C fault`, which sets up a failure the API cannot cause; everything after it goes through the API.
- For every mutation, capture both the action and a second, read-only view: a GET as another actor, or `$C sql`.
- Check the side effects too: an `audit_log` row for every status change, and the email in Mailpit (`$C mail`).
- A rule is proven only by showing **both** sides: the refusal (`expect <CODE>`) and the success after the precondition is fixed.

## Cleanup

```sh
$C stop   # kills only this run's pid tree, drops tnp_verify_<run>, removes the run dir; keeps .verify-artifacts/<run>
```

Postgres and Mailpit stay up, because the developer shares them. After a failed iteration, still run `$C stop`.
