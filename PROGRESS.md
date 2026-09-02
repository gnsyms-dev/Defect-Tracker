# Build progress

Updated as work completes. `[x]` = done and verified, `[ ]` = pending, `[~]` = in progress.

## Backend
- [x] De-brand sweep (old boilerplate name removed everywhere) — schema `app`, DB `defect_tracker`
- [x] `underscored: true` on all models; `auth_users` model discarded and rebuilt as `users`
- [x] 4 migrations (schema, plants, users, inspections) + `down` round-trip verified
- [x] 3 seeders (8 plants, 3 users, 52 inspections), idempotent on re-run
- [x] JWT auth, global fail-closed guards, role decorators; register endpoint removed
- [x] Plants module
- [x] Inspections module (idempotent create, scoped reads, conditional resolve, GROUPING SETS summary)
- [x] 104 unit tests passing, typecheck clean
- [x] Boilerplate fixes (PORT, seed scripts, addBearerAuth, `@Public()` root, stale e2e spec, CORS wildcard)

## Frontend
- [x] Deps + config (Tailwind v4, react-router 8, RHF+zod, idb, vite-plugin-pwa, vitest)
- [x] Design tokens, base UI kit, app shell + per-role bottom nav
- [x] HttpClient with envelope unwrap + NetworkError/ApiError split
- [x] Auth feature (login, session restore, expiry grace, guards)
- [x] IndexedDB outbox + read cache
- [x] Sync engine (backoff, error classification, Web Lock, stale-claim recovery)
- [x] Inspections feature (log, list+filters+sort, detail, resolve, summary, pending queue)
- [x] PWA service worker + manifest
- [x] 67 unit tests passing, typecheck clean, production build clean

## Verification
- [x] Backend verified against live Postgres (constraints, enum ordering, DATE timezone-immunity, scope isolation)
- [x] Browser walkthrough at 390px — ~45 assertions passing
- [x] Service-worker offline cold-load verified against the production build

## Bugs found by testing and fixed
- [x] React Router v8 + `createBrowserRouter` in `useMemo` under StrictMode → blank pages
- [x] Filters page dropped the query string on apply
- [x] `defectType=other` without remarks returned 500 instead of 400
- [x] Reconnect waited out the retry backoff (UX)

## Remaining
- [x] 1. Fix last lint error — frontend lint now fully clean, 69 tests passing
- [x] 2. Write `docs/DECISIONS.md` — 14 sections covering every load-bearing call
- [x] 3. Update `README.md` — setup, credentials, commands, manual + offline verification
- [~] 4. Confirm the app boots inside the Docker container (`make up`) — image build in
      progress; the container's own `npm install` for the new dependencies is the slow part
- [~] 5. Final clean verification
  - [x] Migration round-trip from scratch: 4 reverted, **0 enum types leaked**, 4 re-applied
  - [x] Seeders idempotent: second `seed:up` leaves plants=8 users=3 inspections=52
  - [x] Backend: 104 tests / 12 suites passing (Node 24 container)
  - [x] Frontend: 69 tests / 5 suites passing, typecheck clean, lint clean
  - [x] Production build clean; service worker precaches 13 entries
  - [x] Hygiene sweep: 0 brand references, 0 debug code, 0 stubs, 0 TODOs, 0 `any` types
  - [x] Backend lint: only 4 pre-existing issues, in files this work never touched
  - [ ] Browser walkthrough against the containerised app (waiting on task 4)
