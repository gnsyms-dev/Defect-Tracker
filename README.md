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
- Node ≥ 24.9 if you want to run the test suites on the host (see [Testing](#testing))

## Setup

1. **Create the backend env file.**

   ```bash
   cp app/backend/.env.example app/backend/.env
   ```

   Then set two values in `app/backend/.env`:

   - `DB_USERNAME` / `DB_PASSWORD` — `postgres` / `root` matches the bundled Postgres.
   - **`JWT_SECRET`** — required, minimum 32 characters, **no default on purpose**. The
     app refuses to boot without it rather than falling back to a weak key. Generate one:

     ```bash
     node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
     ```

2. **Start everything.**

   ```bash
   make up
   ```

   First run installs `node_modules` for both apps via the container's own npm, so
   native dependencies match the container. This takes a few minutes; later runs are fast.

3. **Create the schema and load demo data.**

   ```bash
   cd app/backend
   npm run migrate:up
   npm run seed:up
   ```

   Migrations are deliberately decoupled from app startup — they never run on boot.

## URLs

| | |
|---|---|
| Frontend | http://localhost:5173 |
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

Run from the repo root:

| Command | What it does |
|---|---|
| `make up` | Build if needed, start backend + frontend, follow logs |
| `make down` | Stop and remove containers, keep `node_modules` |
| `make restart` | `down` + `up` |
| `make clean-start` | Wipe and reinstall `node_modules`, then `up` — **use after any `package.json` change** |
| `make test` | Run the backend suite inside the container |
| `make logs` / `make ps` | Follow logs / show container status |

From `app/backend`:

| Command | What it does |
|---|---|
| `npm run migrate:up` / `migrate:down` / `migrate:status` | Apply / revert / inspect migrations |
| `npm run migrate:down:all` | Revert everything (the quickest way to reset a dev database) |
| `npm run seed:up` / `seed:down:all` | Load / remove demo data (idempotent — re-running `seed:up` inserts nothing) |
| `npm test` | Unit tests |

From `app/frontend`:

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` / `npm run preview` | Production build / serve it (this is how to exercise the service worker) |
| `npm test` | Unit tests |
| `npm run typecheck` / `npm run lint` | Typecheck / lint |

---

## Testing

```bash
make test                                # backend, inside the container
cd app/frontend && npm test              # frontend
```

**The backend suite needs Node ≥ 24.9 with `--experimental-vm-modules`.** The Nest 12
packages ship ESM-only while the backend compiles to CommonJS, so Jest has to `require()`
ESM natively — which is gated on `vm.SourceTextModule.prototype.hasAsyncGraph`. The flag
is already in the npm scripts, and `make test` runs them in the container (Node 24), so
this only matters if your host Node is older.

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
cd app/frontend && npm run build && npm run preview
```

Then in DevTools → Offline, reload the page: the app shell boots from the service worker
and your queued inspections are still there. Without a SW this is the browser's offline
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
- **`node_modules` is bind-mounted** between host and container. The container runs
  Node 24; if your host runs an older Node, install through `make clean-start` rather
  than a host `npm i`, or native modules will mismatch. (Every dependency here is pure
  JavaScript specifically to avoid that class of problem.)
- **The frontend talks to the API same-origin** through Vite's `/api` proxy in dev and
  preview. That is not just convenience: a CORS rejection is indistinguishable from being
  offline in JavaScript, so an absolute cross-origin URL would let a CORS
  misconfiguration masquerade as permanent offline. See `docs/DECISIONS.md` §10.
