# Defect Tracker

## Getting Started

**1. Create the env file**

```bash
cp .env.example .env
```

**2. Start the containers**

```bash
docker compose up
```

### URLs

| Service | URL |
| --- | --- |
| Frontend | http://localhost:5173 |
| Swagger docs | http://localhost:5000/api/docs |

### Login Credentials

| Email | Password | Role |
| --- | --- | --- |
| supervisor@example.com | `Passw0rd!` | Supervisor |
| supervisor2@example.com | `Passw0rd!` | Supervisor |
| qa@example.com | `Passw0rd!` | QA Manager |

### Note on Chrome's mobile view

On the Log Defect form, the date picker and the defect type dropdown appear offset from the field when opened in Chrome DevTools' device toolbar. **This is not a bug in the app.** Both are native OS controls (`<input type="date">` and `<select>`), which Chrome renders against the real desktop window rather than the emulated phone viewport. On an actual phone they open in the right place.

## Assumptions

- **Two roles only - Supervisor and QA Manager.**
  - *Supervisor* - works the shop floor: creates and updates inspections for their own plant.
  - *QA Manager* - oversees quality: reads and reviews inspections across the organization.
- **A Supervisor is mapped to exactly one plant.** They see and act on that plant's data only.
- **A QA Manager has access to all plants.** No per-plant mapping is needed for them.
- **RBAC, not ABAC.** Because the role boundary is clean and permissions follow the role (not per-record attributes), a role check plus a plant scope is enough. ABAC's policy engine would be cost without benefit here.

## Decisions

### Development Setup

- One `docker compose up` starts everything - Postgres, backend, frontend.
- Compose provisions the database, waits for its healthcheck, then boots the backend against it.
- All config comes from a single root `.env`; service names (`postgres`, `backend`) handle container-to-container networking.
- **Result:** zero config on a new machine - clone, copy `.env`, run one command.

**AI-first development.** This project was built with AI as the primary development tool, so the rules it needs to follow are checked into the repo as skill files under `.claude/skills/`:

- `project-structure` - backend folder layout, module skeleton, where migrations and config live.
- `frontend-project-structure` - clean architecture layers, domain entities, ports, mappers.
- `solid-principles` - how SOLID applies to this codebase's NestJS modules and React components.
- `typescript-best-practices` - strict typing rules, the do's and don'ts.
- `ui-ux-pro-max` - UI/UX guidelines for layout, colour and components.

**Process.** An implementation plan was discussed and agreed first, with the database schema finalised as part of it. Development then happened with AI against that plan and those skill files, so the output stayed consistent instead of drifting file by file.

### Frontend - Clean Architecture

Each feature under `src/features/<name>/` splits into two layers:

- `application/` - `domain/entities` (the models the app thinks in), `ports` (interfaces), `use-cases`, `validators`.
- `infra/` - `dto` (API shapes), `repositories` (ports implemented), `ui` (pages, components, view-models).

**Benefit:** the UI only ever touches domain entities. A mapper sits between the API DTO and the domain model, so an API change is absorbed in one mapper file instead of rippling through components - small blast radius.

### Backend - Hexagonal Architecture

Each module under `src/modules/<name>/` splits into three layers:

- `api/` - controllers, DTOs, and a mapper (domain → DTO).
- `domain/` - entities and services; the business logic, framework-free.
- `infrastructure/` - Sequelize models, repositories, and a mapper (persistence → domain).

**Benefit:** the same as the frontend, from both sides. Mappers on the persistence edge and the API edge mean the domain never knows about table columns or JSON payloads - everything crosses through an adapter, so a schema change or an API change stays at its own edge.

**Also on the backend:**

- **Swagger** at `/api/docs` - OpenAPI spec generated from the DTOs, so the contract can't drift from the code.
- **No direct `process.env` access.** Everything reads through Nest's `ConfigService`.
- **Env validated at boot** with class-validator - a missing or malformed variable fails startup with a clear message instead of surfacing as a runtime bug later.

## Key Design Decisions

- Offline duplicate protection (client_uuid)

I chose to generate a UUID on the client before saving a defect. This gives the server a way to recognise when the same save is being retried, rather than treating it as a new defect. If the request is sent again, the existing record is returned instead of creating another one. The UUID is scoped to the user as well, so IDs from different users don't interfere with each other.

- Five indexes, each tied to a real query

I kept the number of indexes deliberately small. Each of the five indexes supports a query that the application actually runs, rather than adding indexes speculatively. I also avoided separate indexes on fields such as status and severity because they only have a few possible values and don't narrow the results enough to be particularly useful on their own. For open defects, I used a partial index so that the index only covers the records we are likely to query frequently, while resolved defects can accumulate without making that index larger.

- Native ENUM for severity column

I used a Postgres ENUM for severity because it gives us something useful beyond validation: a natural ordering. That means we can sort by severity and get the most serious defects first without having to add another mapping in the application.

- Authorization as a required function parameter

I made the authorization scope part of every repository read, rather than relying on each caller to remember to apply it. The scope is derived from the authenticated user's token-for example, a supervisor gets access to their own records while a QA manager can access all records.

- Offline: always write locally first

For offline support, I decided that every write should go to IndexedDB first, before we try the network.

Having one path for saving also makes the behaviour easier to understand: once the local write succeeds, the item is saved and can be synced later. This avoids the awkward case where a request has left the browser, the connection drops, and we're no longer sure whether the record was actually saved.

- No TanStack Query, no Redux

I decided not to introduce TanStack Query or Redux because the main state problem here isn't really query caching. The offline outbox needs to track things like sync status, retry counts and error types, and that state already belongs to the outbox itself.

Adding another cache on top would mean maintaining two representations of essentially the same list, which felt like unnecessary complexity for this application.
