# Quality Inspection Tracker

A mobile-first internal tool for shop-floor supervisors to log quality defects, and for
QA managers to resolve them. Replaces the paper defect registers used at fabric plants
across Gujarat and Maharashtra.

Built on a NestJS + React monorepo:

- `app/backend` — NestJS 12 API (Sequelize, Postgres)
- `app/frontend` — React 19 + TypeScript (Vite), offline-capable PWA

**Design rationale lives in [`docs/DECISIONS.md`](docs/DECISIONS.md)** — what was
decided, why, what was rejected, and what would make us revisit.

---

## What it does

| Capability | Notes |
|---|---|
| Log an inspection | Date, machine/line ID (free text), defect type, severity, optional remarks |
| List inspections | Sortable, filterable by severity, status, defect type and date range; filters live in the URL |
| Resolve an inspection | Mandatory resolution note, enforced at three layers including a DB constraint |
| Summary | Open/resolved counts by severity, plus a per-plant breakdown for QA |
| Offline | Inspections logged without connectivity are stored on the device and sync automatically when back online |
| Auth | JWT, two roles with genuinely different apps |

### The two roles

| | SUPERVISOR | QA_MANAGER |
|---|---|---|
| Log a defect | ✅ | ❌ |
| See inspections | Own only | All plants |
| Resolve | ❌ | ✅ |
| Summary | Own | All, with per-plant breakdown |
| Tabs | Log · My Logs · Summary · Account | Inspections · Summary · Account |

Routes are *generated* from the role, so a route a role cannot use does not exist —
there are no dead-end "Forbidden" screens.

---

## Prerequisites

- Docker + Docker Compose
- `make`

That is the whole list. `node_modules` is installed inside each image and never shared
with the host, so nothing here needs a particular Node version — or any Node at all.
Install dependencies on the host only if you want editor autocomplete and in-IDE
typechecking; the containers ignore whatever you do there.

## Setup

1. **Create the env file.** There is exactly one, at the repo root.

   ```bash
   cp .env.example .env
   ```

   Then set **`JWT_SECRET`** — required, minimum 32 characters, **no default on purpose**.
   The app refuses to boot without it rather than falling back to a weak key. Generate one:

   ```bash
   openssl rand -hex 32
   ```

   Everything else is already filled in, including the database credentials — compose
   provisions Postgres from the same `DB_USERNAME` / `DB_PASSWORD` / `DB_NAME` the backend
   connects with, so the two cannot drift apart.

2. **Start everything.**

   ```bash
   make up
   ```

   Three containers come up: `postgres`, `backend`, `frontend`. The first run builds both
   images and installs `node_modules` inside them, which takes a few minutes; later runs
   are fast.

3. **Create the schema and load demo data.**

   ```bash
   make migrate
   make seed
   ```

   These run inside the backend container, which is where `sequelize-cli` lives.
   Migrations are deliberately decoupled from app startup — they never run on boot.

## URLs

| | |
|---|---|
| Frontend | http://localhost:5173 |
| Frontend, production build | http://localhost:4173 (after `make preview`) |
| API | http://localhost:5000/api/v1 |
| Swagger | http://localhost:5000/api/docs (click **Authorize** and paste a login token) |
| Postgres | localhost:5432, database `defect_tracker` |

## Demo accounts

Created by the seeder. There is no public sign-up — an internal tool where a
self-assigned role would grant defect-resolution authority should not have one.

| Email | Password | Role | Plant |
|---|---|---|---|
| `supervisor@example.com` | `Passw0rd!` | Supervisor | GJ-SUR-01 (Surat) |
| `supervisor2@example.com` | `Passw0rd!` | Supervisor | MH-BHI-01 (Bhiwandi) |
| `qa@example.com` | `Passw0rd!` | QA Manager | GJ-SUR-01 |

Two supervisors at different plants exist so per-user scoping is demonstrable: each sees
only their own rows, and the QA manager sees both.

The seeder refuses to run when `NODE_ENV=production`.

---

## Commands

Everything runs from the repo root — there is no longer a reason to `cd` into an app,
because the tools live in the containers.

| Command | What it does |
|---|---|
| `make up` | Build if needed, start all three containers, follow logs |
| `make down` | Stop and remove the containers (the database volume survives) |
| `make restart` | `down` + `up` |
| `make reinstall` | Rebuild images and refresh `node_modules` — **use after any `package.json` change** |
| `make migrate` / `make migrate-down` / `make migrate-status` | Apply / revert / inspect migrations |
| `make seed` / `make seed-down` | Load / remove demo data (idempotent — re-running `make seed` inserts nothing) |
| `make test` / `make test-backend` / `make test-frontend` | Run the suites in their containers |
| `make logs` / `make ps` | Follow logs / show container status |
| `make sh-backend` / `sh-frontend` / `sh-db` | Shell into a container (`sh-db` opens `psql`) |

**`make reinstall` is the one to remember.** `node_modules` lives in an anonymous volume
that compose fills from the image once and then reuses, so rebuilding an image is not
enough on its own — `reinstall` throws the stale volume away.

Anything not wrapped by a `make` target runs through the container directly, e.g.:

```bash
docker compose exec backend npm run lint
docker compose exec frontend npm run typecheck
docker compose exec backend npm run migrate:down:all   # quickest dev-database reset
```

---

## Testing

```bash
make test              # both suites
make test-backend      # just the backend
make test-frontend     # just the frontend
```

Both run in their own container with `--no-deps`, so Postgres is not started: these are
unit tests with the database mocked.

**The backend suite needs Node ≥ 24.9 with `--experimental-vm-modules`.** The Nest 12
packages ship ESM-only while the backend compiles to CommonJS, so Jest has to `require()`
ESM natively — which is gated on `vm.SourceTextModule.prototype.hasAsyncGraph`. The flag
is already in the npm scripts, and the container is on Node 24, so this is only a problem
if you run the suite on a host with older Node.

What the tests cover, and why those things:

- **`flush-policy.spec.ts`** — the outbox error-classification table and backoff curve.
  Pure, and the highest-consequence logic in the app: get it wrong and you either lose a
  defect or retry a doomed request forever.
- **`merge-rows.spec.ts`** — dedupe of queued vs server rows by `client_uuid`. A bug here
  shows up as duplicated or vanishing defects.
- **`IdbOutboxStore.spec.ts`** — run against a real (in-memory) IndexedDB via
  `fake-indexeddb`, because the behaviour worth testing *is* the transaction and index
  behaviour.
- **Backend service and repository specs** — role scoping, the IST date rules, clock
  clamping, the summary zero-fill, and the idempotent-create path.

---

## Verifying it by hand

### Mobile layout

Chrome DevTools → device toolbar → **iPhone 12 Pro (390×844)**. Sign in as the
supervisor and walk: Log → save → My Logs → Filters → Summary. Then sign in as QA and
walk the resolve flow. Widen past 768px and the card list becomes a real table.

### The API and the idempotency contract

```bash
# Log in and capture the token
curl -s localhost:5000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"supervisor@example.com","password":"Passw0rd!"}'

# POST /inspections with a fixed clientUuid, then POST the identical body again:
#   first  -> 201, code "2010"
#   second -> 200, code "2000", same data.id
# That is the contract the offline outbox depends on.
```

Worth checking explicitly:

| Request | Expected |
|---|---|
| Supervisor → `PATCH /inspections/:id/resolve` | 403 |
| QA → `POST /inspections` | 403 |
| Supervisor → `GET /inspections` | Only their own rows, whatever query params they pass |
| Supervisor → `GET /inspections/:id` for another user's row | **404, not 403** (a 403 would confirm it exists) |
| `resolutionNote: "   "` | 400 |
| Resolve an already-resolved row | 409 |
| Wrong password vs unknown email | Identical 401 message |

### Offline

Two failure modes need two different tools, and only one of them is the obvious one.

**1. No network at all** — DevTools → Network → **Offline**.

1. Log two inspections. Both appear immediately with "Not synced" chips, the tab badge
   reads 2, and neither offers Resolve.
2. Go back online. The outbox flushes, chips clear, and **no duplicates appear** — that
   is the `client_uuid` dedupe.
3. Check DevTools → Application → IndexedDB → `defect-tracker-offline` → `outbox` is
   empty.

**2. Connected, but the API is unreachable** — DevTools → Network → request blocking on
`*/api/*`. This is the case that breaks designs which trust `navigator.onLine`, since it
stays `true`. The app treats `true` as *unknown* and lets request outcomes decide.

**Cold load while offline needs the production build.** The service worker is disabled in
dev on purpose (a stale SW is the top cause of "my change isn't showing up"), so a full
page load with no network only works against a real build:

```bash
make preview
```

That builds inside the frontend container and serves the result on
**http://localhost:4173** (the dev server keeps running on 5173). Then in DevTools →
Offline, reload the page: the app shell boots from the service worker and your queued
inspections are still there. Without a SW this is the browser's offline
page and the app — along with the queue — is unreachable.

### Testing on a real phone

Two traps, both caused by the same thing: `http://<LAN-IP>:5173` is **not a secure
context**.

- `crypto.randomUUID()` is `undefined` there. The app falls back to
  `crypto.getRandomValues` (which is *not* secure-context gated), so offline logging
  still works — but this is why that fallback exists.
- **A service worker will not register at all**, so offline cold-load cannot be tested
  that way.

On Android, `adb reverse tcp:5173 tcp:5173` makes the phone see it as
`http://localhost:5173`, which *is* a secure context and fixes both. On iOS, use an https
tunnel.

---

## Layout

```
app/backend/src/
├── config/                     # env validation, database, cors, logger, swagger, telemetry
│   └── database/sql/
│       ├── migrations/         # THE source of truth for the schema
│       └── seeders/            # plants -> users -> inspections (ordered by filename)
├── modules/
│   ├── auth/                   # users, login, JWT, guards
│   ├── plants/                 # reference data
│   └── inspections/            # the core feature
└── shared/                     # response envelope, guards, decorators, pagination

app/frontend/src/
├── app/                        # composition root: DI, router, layouts
├── shared/
│   ├── api/                    # HttpClient, envelope unwrap, NetworkError vs ApiError
│   ├── offline/                # outbox, cache, sync engine, connectivity
│   └── ui/                     # design-token-driven primitives
└── features/{auth,inspections,plants}/
    ├── application/            # entities, ports, use-cases, zod validators
    └── infra/                  # dto+mappers, repositories, ui (pages/components/view-models)
```

Each backend module follows the hexagonal layout documented in
`.claude/skills/project-structure/SKILL.md`; the frontend follows the layering in
`.claude/skills/frontend-project-structure/SKILL.md`.

## Notes

- **Migrations, not models, define the schema.** A `.model.ts` can be edited out of sync
  with what has actually been migrated.
- **`node_modules` is never shared with the host.** Each image installs its own with
  `npm ci`, and compose shadows the host directory at that path with an anonymous volume.
  A host `npm i` therefore cannot reach in and break a container, and the container's
  modules are always built against its own Node and libc. The cost is that a
  `package.json` change needs `make reinstall`, not just `make restart`.
- **Each app builds from its own context.** `app/backend/Dockerfile` and
  `app/frontend/Dockerfile` are dev images — dev dependencies included, source
  bind-mounted for hot reload. They are not production images and are not pretending to
  be; building those is a separate job.
- **The frontend talks to the API same-origin** through Vite's `/api` proxy in dev and
  preview. That is not just convenience: a CORS rejection is indistinguishable from being
  offline in JavaScript, so an absolute cross-origin URL would let a CORS
  misconfiguration masquerade as permanent offline. See `docs/DECISIONS.md` §10.
