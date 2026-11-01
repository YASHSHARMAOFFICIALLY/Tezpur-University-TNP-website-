# Tezpur-University-TNP-website-

Training & Placement portal for Tezpur University.

- `backend/`: Express 5 + Prisma + PostgreSQL API, Docker deploy (see `backend/README.md`).
- `frontend/`: Next.js 16 + Tailwind v4 portals for students, recruiters and the T&P cell (see `frontend/README.md`).

Self-host everything with `docker compose --profile prod up -d --build` from `backend/`; the deploy expects `frontend/` next to it.
