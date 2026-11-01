# Sign-in and route guards

Every user signs in at `/login` and lands on the portal for their role. Guests and users of other roles cannot open a portal that is not theirs. After logout, Back must not show a signed-in view.

## Sub-features

- `signin-wrong-password` shows "Email or password is wrong" in an alert and stays on `/login`.
- `signin-role-home` sends admin to `/admin`, student to `/student` and recruiter to `/recruiter`.
- `guard-guest` sends a guest from `/admin`, `/student`, `/recruiter` and `/admin/system` to `/login`.
- `guard-cross-role` sends a student or recruiter who opens `/admin/system` back to their own home.
- `signout-back` logs out to `/login`, and Back afterwards never shows a portal.
- `mobile-390` means `/login` and every role's home have no horizontal scroll at 390×844.

## How to get to it (user POV)

- Open `https://localhost/login` directly, or use Sign in on the public page.
- Type a portal URL into the address bar (guards).
- Use the "Log out" button in the header of any portal.

## Driving it with webctl

Preconditions: the baseline.

- **Whole feature:** `webctl journey .claude/skills/verify-tnp-web/journeys/sign-in.mjs`. Expect `17/17 steps passed`, and screenshots `sign-in-{wrong-password,login-390,admin-home,admin-390,student-home,…}.png`.
- **Suites:** `e2e` covers wrong password and guest redirect again, and `ops` covers "non-admin is kept out of admin pages".

## Gotchas

- Login and logout replace the history entry. Back from `/login` leaves the site (to `about:blank` in a fresh tab) rather than returning to `/login`. Assert "no signed-in view", not a URL.
- SSR markup is in the DOM before its CSS applies. Measure layout after `networkidle`, or an unstyled frame reports a false overflow of about 416px.
- Next.js renders an empty `role=alert` route announcer on every page. Count only alerts that have text: `getByRole("alert").filter({ hasText: /\S/ })`.
- An API 401 can show in the error list right after logout, when a request from the old page was still in flight. Investigate it only if a page also shows an error.
