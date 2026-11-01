# Tezpur University T&P Portal: frontend

Next.js 16 (App Router) + Tailwind v4, built from the approved Figma file. Talks to `../backend` through a same-origin proxy (`/api/v1/*` → `BACKEND_URL`, default `http://localhost:3000`).

## Run

```sh
./scripts/backend-up.sh      # Postgres + Mailpit + API on :3000 (idempotent)
npm ci
npm run dev                  # http://localhost:3001
node scripts/seed-demo.mjs   # optional demo data via the real API; test password goes to .env.local (gitignored)
```

## Routes

| Route | Who | Figma frame |
| --- | --- | --- |
| `/` | public | Public Portal & Dual Registration Flow |
| `/login` | all | not in Figma (styled like the registration desk) |
| `/student` | student | Student & Alumnus Placement Hub |
| `/recruiter` | company | Recruiter Corporate Desk |
| `/admin` | admin | TPO Admin Governance Workspace |

After login each user is sent to their portal by `user.role`. `must_change_password` shows the change-password form before anything else.

## Code map

- `src/lib/api.ts`: typed client (`openapi-fetch`), session, token refresh, `call()` error unwrapping, file helpers.
- `src/lib/api-types.ts`: generated; run `npm run types` after the backend's `openapi.json` changes.
- `src/components/ui.tsx`: Button, Badge, Card, Field, Input, `State` (loading / empty / error for every data block).
- `src/components/AppShell.tsx`, `PublicShell.tsx`: layouts from the Figma frames.
- `src/app/globals.css`: design tokens copied from the Figma CSS export.

## Design source

`design/` holds the Figma exports: per-frame CSS (all layers), SVG and PNG. `python3 scripts/figma-outline.py design/admin.css` prints one line per layer.
Blocks with no backend data (JEE/NIRF analytics, logistics, NPS…) keep the Figma text by decision.

## Checks

```sh
npx tsc --noEmit && npx eslint src scripts
node scripts/e2e.mjs                         # 20-step UI test across all portals (needs API, web, Mailpit, seed)
node scripts/shot.mjs student /student       # full-page screenshot as a demo user; W=390 for mobile
```
