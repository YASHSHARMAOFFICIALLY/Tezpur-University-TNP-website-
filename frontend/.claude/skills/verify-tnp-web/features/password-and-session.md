# Password and session

Users with no password yet, or a forgotten one, reset it with an emailed code. A teacher's one-time password forces a change before anything else. Sessions renew silently. A revoked or failed refresh signs the user out cleanly. The next user in the same tab never sees the previous user's data.

## Sub-features

- `pw-forgot`: "Forgot password / first login?" → "Send code" → code → "Save new password".
- `pw-mismatch`: the UI catches mismatched passwords before the API is called.
- `pw-wrong-code`: a wrong code shows the backend error in an alert.
- `pw-resend`: the code can be resent from the reset screen.
- `pw-forced-change`: a teacher's one-time password leads to "Set a new password", and the old one-time password then stops working.
- `sess-refresh`: an expired access token is renewed once, silently.
- `sess-upstream-fail`: when refresh fails upstream (503 or a connection reset), the session is kept, an error shows, and the app recovers.
- `sess-revoked`: a revoked refresh token sends the user to sign in.
- `sess-logout-revokes`: after logout, the old refresh token is rejected by the server.
- `sess-no-leak`: the next user in the same tab never sees the previous user's cached data.

## How to get to it (user POV)

- On `/login`, use "Forgot password / first login?". Session behaviour shows while using any portal.

## Driving it with webctl

Preconditions: the baseline. The suite creates its own imported student and teacher.

- **Whole feature:** `webctl suite auth`. Expect 13 steps.

## Gotchas

- Tokens are stored in `localStorage` under `tnp.session`. A known, accepted risk: the refresh token is in localStorage.
- The upstream-failure steps intercept network requests inside the browser context. They do not touch nginx.
