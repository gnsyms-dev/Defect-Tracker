# Design decisions

A record of the calls that shaped this build: what was decided, why, what was rejected,
and what would make us revisit. Ordered roughly by how much depends on them.

The five sections flagged during plan review — `client_uuid`, the no-timezone date, the
DB-level CHECK constraints, the index set, and the TanStack Query / Redux rejections —
are sections 1, 2, 3, 4 and 9.

---

## 1. Offline idempotency: a client-generated `client_uuid`

**Decision.** The client generates a UUID v4 *before* an inspection ever touches the
network. It is stored on the row as `client_uuid`, `NOT NULL`, constrained
`UNIQUE (logged_by_user_id, client_uuid)`, and **echoed back on every read**.

**Why it exists.** A supervisor logs a defect in a dead zone. The record must be
durable immediately and must reach the server exactly once, no matter how many times
the app retries. Without a client-generated key the server cannot tell a retry from a
new defect — and "log the same defect twice" and "lose it" are both unacceptable in a
register that replaces a bound paper book.

**Why it is required on every create, not just offline ones.** Making it optional would
create two write paths, and the online path is precisely the one that also gets
replayed: a double-tap on Save, or a 201 lost to flaky plant Wi-Fi. One path means one
set of semantics, and the rarely-exercised branch cannot rot.

**Why it is NOT the primary key.** Three reasons, in descending force:

1. **Idempotency scope must stay changeable.** Scoped to `(logged_by_user_id,
   client_uuid)`, one user's replayed or guessed UUID can never collide with another
   user's row — so "return the existing record on conflict" *structurally cannot*
   return someone else's inspection. As a global PK the scope would be frozen and that
   same handler becomes a cross-user IDOR.
2. **Lifetime.** A dedup key is a candidate for expiry once the outbox can no longer
   hold it. You cannot purge a primary key.
3. **Provenance.** `id` is a server-assigned surrogate that URLs and foreign keys
   depend on; `client_uuid` is untrusted client input. Conflating "this row's identity"
   with "a value the client chose" is not undoable later.

**Server semantics.** One ordinary `INSERT`, catching `UniqueConstraintError`, then a
`SELECT` on the composite key. The catch branch *is* the replay path rather than a
fallback: `SELECT`-then-`INSERT` costs two round-trips on the happy path and, under
READ COMMITTED, two concurrent replays both see "not found" and one hits the violation
anyway — so the conflict has to be handled either way.

- genuine insert → **201 Created** (`ResponseCode.Created`)
- replay → **200 OK** (`ResponseCode.Ok`), **identical body**

**Why 200 and not 409.** Nothing failed. The client's intent — *this inspection exists
on the server* — is satisfied. A 409 would force the outbox to special-case an error as
success, and any generic retry layer would treat it as a failure and surface an alarming
message to a shop-floor user. Same body, different status, means the flush needs exactly
one branch: `if (2xx) remove from outbox`. The 200/201 ratio is also free telemetry on
how often replays actually happen.

**Why the echo on reads matters.** It is the join key that lets the list recognise that
a locally-queued row has come back from the server. The alternative is matching on field
values, which breaks the moment two identical defects are logged on one machine on one
day — exactly what real fabric defects do.

**Revisit when** resolve becomes offline-capable. It would need its own idempotency key;
today it is online-only, which is why a repeated resolve is correctly a 409 while a
repeated create is a 200.

---

## 2. `inspection_date` is `DATE`, with no timezone anywhere in its path

**Decision.** The calendar date is `DATE` in Postgres, `DataType.DATEONLY` in the model,
and a **`string`** (`YYYY-MM-DD`) in the domain entity, the DTO and the React state. No
`Date` object is ever constructed from it.

**Why.** A calendar date is not an instant. Stored as `TIMESTAMPTZ` you must invent a
time of day, and then `2026-09-01` entered in Surat becomes `2026-08-31T18:30:00Z`.
Every UTC-side consumer — a CSV export, a `date_trunc('day', …)` in the summary, a log
line, a browser in another timezone — then files that defect under **31 August**.

It is an off-by-one-day that only appears for entries made in the 5.5 hours before
05:30 IST, so it survives casual testing and corrupts the monthly report. For a
compliance register replacing paper, "the report says the wrong day" is the
credibility-destroying defect. `DATE` has no timezone: 1 September is 1 September
everywhere, and `inspection_date BETWEEN $from AND $to` is inclusive on both ends with
no timezone maths.

**Two rules that follow, both verified against Sequelize's source.**

- Postgres `DATEONLY` parses back out as the raw string, so string-in/string-out keeps
  `Date` out of the path entirely.
- **Never assign a JS `Date` to a `DATEONLY` column.** Sequelize's `_stringify` formats
  in the *process-local* timezone, so in a UTC container
  `new Date('2026-09-01T00:00:00+05:30')` is written as `2026-08-31` — the very bug the
  column type exists to prevent.

**Future-date validation cannot be a CHECK constraint.** Postgres refuses non-IMMUTABLE
functions there, so `CHECK (inspection_date <= current_date)` is illegal. It is enforced
in the domain service against *today in IST* (`Intl.DateTimeFormat('en-CA', { timeZone:
'Asia/Kolkata' })`, which yields `YYYY-MM-DD` directly). Comparing against a UTC "today"
would reject a legitimate 09:00 IST entry every morning.

There is deliberately **no lower bound**: entering a paper backlog is a legitimate use
of this tool.

**`logged_at` earns its own column.** The device clock when Save was pressed, separate
from `created_at` (server insert). Three reasons:

1. It is the only way to measure the thing the tool claims to fix. `created_at −
   logged_at` is the sync lag; `logged_at::date` vs `inspection_date` is the backdating
   lag. Without it you cannot show that entries stopped arriving days late.
2. The UI can say "logged 14:05, synced 16:40" instead of pretending everything happened
   at flush time.
3. Without it, eight entries flushed at 09:14 all share one `created_at` and their true
   order is destroyed permanently.

It is untrusted input, so the service clamps forward skew beyond 5 minutes to `now()`
(a phone running fast must not create future-dated records) and rejects anything more
than 30 days old as a broken clock rather than a backlog. It is never used for
authorization or as the ordering of record.

`PLANT_TIME_ZONE` is a module constant, not an env var: it is not per-deployment
configuration, and every env var costs a validator entry plus documentation in two
files.

---

## 3. Business rules enforced as DB CHECK constraints

**Decision.** The invariants live in the schema, not only in DTOs.

```sql
-- "Mark as Resolved with a MANDATORY resolution note", made unviolatable
CONSTRAINT inspections_resolution_consistency_chk CHECK (
  (status = 'open'
     AND resolved_at IS NULL AND resolution_note IS NULL AND resolved_by_user_id IS NULL)
  OR
  (status = 'resolved'
     AND resolved_at IS NOT NULL AND resolved_by_user_id IS NOT NULL
     AND resolution_note IS NOT NULL AND btrim(resolution_note) <> '')
)
```

**Why in the database.** The brief's word is *mandatory*. A DTO rule holds for traffic
that goes through the DTO; it does nothing for a migration, a repair script, or a
manual `UPDATE` at 2am. And `NOT NULL` alone is not the rule — it happily accepts `''`,
which is why the constraint tests `btrim(...) <> ''`.

**Being biconditional is what makes storing `status` safe.** `status` is derivable from
`resolved_at IS NULL`, so storing it is redundant — normally a smell. The constraint
makes the two representations *provably equivalent*, so they cannot drift, which buys
the redundancy for free. And storing it is what we want: `status` is the primary filter
and the summary's `GROUP BY` key, it composes into the partial index below, and a third
state (`void`, `reopened`) is not expressible as a null-check at all.

**The other constraints and what each buys:**

| Constraint | What it prevents |
|---|---|
| `inspections_other_needs_remarks_chk` | `defect_type = 'other'` with no explanation — an escape hatch producing data nobody can act on |
| `users_email_lower_chk` + plain `UNIQUE(email)` | `Ravi@x.com` shadowing `ravi@x.com` into a login that mysteriously fails. Canonical-form CHECK gives case-insensitive uniqueness with no CITEXT extension and no functional index |
| `plants_code_canonical_chk` | Same trick for plant codes, which the seeders use as a natural key |
| `users_role_chk` | A typo'd role silently becoming a valid-looking permission tier |
| `*_not_blank_chk` | Whitespace-only text satisfying a `NOT NULL` |

**Application validation is still required, not optional.** A constraint violation
surfaces as a 500. The DTO and the domain service catch these cases first so the API
answers 400/422 with a message a supervisor can act on — the constraint is the backstop
that makes the rule true, not the thing that reports it. This was found the hard way:
`defect_type = 'other'` without remarks returned a 500 until the rule was added to the
service, because `@IsOptional()` silently disables a sibling `@ValidateIf`/`@IsNotEmpty`
pair when the value is absent.

**Revisit when** a "reopen" requirement lands. Resolution stops being singular, and the
biconditional weakens to a one-way implication (`status='resolved'` ⟹ fields present)
because a reopened row legitimately keeps its prior resolution data.

---

## 4. Indexes: five, each tied to a named query

| Index | The query it serves |
|---|---|
| `inspections_pkey (id)` | `GET /inspections/:id` |
| `inspections_logger_client_uuid_uniq (logged_by_user_id, client_uuid)` | The replay lookup on every outbox flush — **and** it enforces idempotency (§1) |
| `inspections_logger_date_idx (logged_by_user_id, inspection_date, created_at)` | A supervisor's own list and own summary, in default sort order |
| `inspections_plant_date_idx (plant_id, inspection_date, created_at)` | QA's list and summary when a plant filter is applied |
| `inspections_open_date_idx (inspection_date, created_at) WHERE status = 'open'` | QA's landing screen: open defects, all plants, newest first — the single hottest query in the app |

**Why the partial index is the textbook case for one.** The resolved set grows forever
while the open set stays roughly constant. `WHERE status = 'open'` keeps this index
permanently small as the table grows, which an unfiltered index on the same columns
would not.

**No `DESC` in any index definition.** Postgres scans a btree backwards at full speed,
so a plain ascending index serves `ORDER BY … DESC` identically. `DESC` only earns its
keep for *mixed*-direction sorts, which this app does not have — writing it would imply
a subtlety that is not there.

**Deliberately NOT indexed, and why:**

- `severity`, `status`, `defect_type` individually — 2 to 5 distinct values each. Never
  selective enough to beat filtering the rows the composite indexes already narrowed.
- `machine_line_id` — its `ILIKE '%term%'` always runs *after* a scope filter
  (`logged_by_user_id` or `plant_id`), so it filters hundreds of rows rather than
  scanning the table. Revisit past ~1M rows with `pg_trgm` + a GIN index.
- `created_at` alone — no endpoint filters or sorts on it without a leading scope
  column.
- `users.plant_id` — nothing queries users by plant, and the FK RESTRICT check on a
  plant delete scans ~20 rows.
- Anything on `plants` beyond its two constraints — the table holds 8 rows, where a seq
  scan beats an index and the only cost of adding one is write amplification.

**A tiebreaker is not optional.** Every list query appends `created_at`, then `id`.
Without it, OFFSET pagination over a non-unique sort key (all of ours) silently
duplicates and skips rows across pages — which reads as data corruption and is the
hardest pagination bug to reproduce. Verified: page 1 and page 2 have zero overlap.

---

## 5. Native Postgres `ENUM` for exactly one column

**Decision.** `severity` is a native enum declared `('minor','major','critical')`.
`status` and `defect_type` are `varchar` + `CHECK`.

**The rule behind the split.** Postgres enums are *append-only forever* — you can
`ALTER TYPE … ADD VALUE`, you can never remove one. A CHECK constraint is a
drop-and-recreate inside one transactional migration, fully reversible. So the only
thing that justifies paying the enum's irreversibility is a capability CHECK cannot
give: ordinal comparison.

`severity` has it. Declaring least-to-most-severe makes `ORDER BY severity DESC` mean
worst-first *for free*, and `severity >= 'major'` a real predicate. A varchar would
need either a `CASE` expression in every sort (which Sequelize can only express through
`literal()`) or a redundant rank column. Verified: `DESC` yields critical → major →
minor, and `>= 'major'` is true for exactly critical and major.

`status` is the column a *workflow* change touches (`reopened`, `in_review`, `void`) —
and workflow changes get rolled back. `defect_type` is the most likely of all to grow;
the presence of `"Other"` is an admission the list is incomplete, and growth will be
driven by plant managers rather than developers.

**A sequelize-cli gotcha worth writing down, because it fails silently.** Sequelize does
not drop enum types on `dropTable`, and its own `CREATE TYPE` is wrapped in
`DO $$ … EXCEPTION WHEN duplicate_object THEN null; END $$`. So a `migrate:down:all &&
migrate:up` cycle **succeeds while keeping a stale type carrying the old value list** —
a schema that disagrees with its migration, with no error. Every `down` that touches an
enum therefore ends with an explicit `DROP TYPE IF EXISTS`. The round-trip is verified
to leave zero enum types behind.

**Revisit when** defect types need to change without a deploy. That is an additive
migration (`defect_types` table + FK), not a rewrite. If severity ever needs a level
*between* two existing ones, note that a Postgres enum cannot accept one without
recreating the type — that is the trigger for a lookup table with an explicit `rank`.

---

## 6. Authorization: scope as a required repository parameter

**Decision.** `InspectionScope` is a discriminated union — `{kind:'own', userId}` for a
supervisor, `{kind:'all'}` for a QA manager — derived from the authenticated user and
**never** from request input. It is the required *first parameter* of every read on the
repository port.

**Why that shape.** Omitting the scope is a **compile error**, not a code-review miss.
"A supervisor must not see another supervisor's rows" stops being a rule someone has to
remember and becomes something the type system refuses to let you write.

Three layers reinforce it:

1. **The DTO** has no `loggedByUserId` field at all. Because the global `ValidationPipe`
   runs with `forbidNonWhitelisted: true`, sending one is a 400 — there is nothing to
   forge. The DTO's *absence* of a field is the enforcement. Verified: posting `role`
   returns `property role should not exist`.
2. **The service** derives the scope from `CurrentUser`, and intersects a supplied
   `plantId` with the caller's own.
3. **The repository** folds the scope into the WHERE unconditionally.

**A corollary that matters.** `GET /inspections/:id` for a row outside the caller's
scope returns **404, not 403**. The scope is part of the WHERE, so "not yours" and
"does not exist" are indistinguishable by construction — a 403 would confirm the row
exists. Verified end to end.

---

## 7. Auth: minimal JWT claims, and a per-request user lookup

**Decision.** The token carries `sub`, `email`, `iat`, `exp` — nothing else. The guard
verifies the signature and then loads the user by `sub` on every request, deriving
`role` and `plantId` from the database.

**Why not put `role` and `plantId` in the token.** Two reasons that compound:

1. **It buys back the revocation we gave up by having no refresh token.** Setting
   `is_active = false` takes effect on the very next request. These two decisions are
   coupled: the cheap primary-key lookup is what makes an access-token-only scheme
   defensible.
2. They are *authorization inputs* used to scope every query. A token minted up to 12
   hours ago could carry a stale `plantId`, and acting on that leaks another plant's
   data.

Given both, including them would make them **unused claims — and an unused claim is one
someone eventually trusts by mistake.** The frontend gets `role` from the login response
body, never by decoding the JWT. Verified: the issued token contains exactly
`sub`/`email`/`iat`/`exp`.

**Token lifetime: access-only, 12 hours.** The decisive argument is specific to this
product: **with offline-first writes, an expired token means the outbox cannot flush —
and the user cannot re-authenticate either, because login also needs the network.**
Lifetime must comfortably exceed the longest offline window, and a shift is 8–12 hours.
Every refresh scheme has the identical problem (the refresh call needs connectivity), so
refresh tokens do not help the failure mode that actually matters here.

**The honest cost.** `CORS_CREDENTIALS=false` rules out httpOnly cookies, so the token
lives in `localStorage` and any XSS means theft for up to 12 hours. Mitigations in
scope: React's default escaping, no `dangerouslySetInnerHTML` anywhere, helmet, and a
bounded lifetime. Serving the app same-origin — which the dev proxy already does — is
what would make httpOnly cookies viable as a v2 hardening.

**`bcryptjs`, not `bcrypt` or `argon2`.** The original constraint was the dev container
sharing `node_modules` with a host on a different Node, where a native addon built by a
host `npm i` fails to load under the container's Node — *on the login path*, the worst
place to discover it. Each container now installs its own `node_modules` and the host's is
shadowed, so that specific trap is gone, but the choice stands on its own: `bcryptjs` is
pure JavaScript, so it needs no toolchain in the image and no rebuild when the base image's
Node or libc moves, it works unchanged in the CommonJS seeder via `require()`, and ~100ms
per login is irrelevant for a handful of logins per shift.
Rejected raw `crypto.scrypt` too: zero dependencies and genuinely strong, but it means
hand-rolling salt generation, encoding and timing-safe comparison, and hand-rolled
password crypto is where subtle bugs live.

**Guards are global and fail-closed** (`APP_GUARD`, `JwtAuthGuard` then `RolesGuard`),
with `@Public()` as the opt-out. With opt-in guards, forgetting a decorator on a new
controller silently ships an unauthenticated endpoint — and `GET /inspections` without
scoping is a cross-plant data leak. With a global guard, forgetting `@Public()` fails
loudly on the first request in development.

**`POST /auth/register` was deleted**, along with its DTO, service method and repository
method. Accounts are seeded, and an open registration endpoint on which a self-assigned
role grants defect-resolution authority is a live privilege-escalation path. Guarding it
to QA_MANAGER instead would ship an untested admin feature carrying three undesigned
decisions (which plant, which role, what password policy).

**Login cannot be used to enumerate accounts.** A wrong email, a wrong password and a
deactivated account all return the same 401 message, and the unknown-email path still
performs one dummy hash verification so response time does not leak existence either.
Verified: all three produce identical responses.

---

## 8. The summary is one query, zero-filled server-side

**Decision.** A single `GROUPING SETS` aggregation returning four breakdowns at once:

```sql
SELECT status, severity, plant_id, COUNT(*)::int
  FROM app.inspections
 WHERE <scope AND the same filters as the list>
 GROUP BY GROUPING SETS ((status, severity), (status, plant_id), (status), ());
```

**Why one query.** Six separate counts would be six round-trips that can disagree with
each other under concurrent writes. More importantly, the WHERE clause is built by the
**same private `buildWhere(scope, filters)` used by the list** — which is what
guarantees the summary can never disagree with the table above it. That is the single
most common source of "the numbers don't match" bug reports, and sharing the builder
eliminates it structurally rather than by discipline. Verified: totals, severity sum and
plant sum all agree, under every filter combination tested.

Rows are unambiguous only because all three grouped columns are `NOT NULL` — with a
nullable column you would need `GROUPING()` to tell a real null from an excluded one.

**Zero-filling happens in the domain service, not the client.** Postgres returns *no
row* for an empty cell. The brief's summary must show "Critical / Open: **0**" rather
than omitting the row, and a mobile UI rendering `undefined` where it expected `0` is a
guaranteed bug. The service iterates the fixed severity order rather than the returned
rows, so all three are always present. Severity order is decided server-side so no
client sorts enum strings alphabetically.

**In scope:** severity × status, per-status totals, grand total, and a plant breakdown
(plant is a stated summary dimension and it is free in the same query).
**Out of scope:** a defect-type breakdown — one more grouping set the day someone asks.

---

## 9. Frontend state: no TanStack Query, no Redux

**This is the call most worth defending, because both are the conventional answer.**

### TanStack Query — rejected

1. **No query cache models our requirements.** The offline layer needs a discriminated
   `status`, `attempts`, `lastError`, and error *classification* (a 4xx dead-letters and
   surfaces for edit/discard; a 5xx or network error retries). TanStack's paused-mutation
   queue has no dead-letter concept — a permanently-failed mutation settles and is
   garbage-collected after `gcTime`. "Keep this rejected submission, with its error, so a
   supervisor can fix and resubmit it" is an outbox-with-a-status-column feature, not a
   mutation-cache feature. **So we write the outbox either way.**
2. **Given that, adding it creates two caches of the same rows.** The merged list must
   read pending items from IndexedDB. If server rows came from the query cache and
   pending rows from IndexedDB, one list would be assembled from two stores with two
   lifetimes and two invalidation schedules. Two sources of truth for one list is the
   largest bug generator in offline apps.
3. **Its value scales with query overlap, and there is none.** One list, one summary,
   one plants, one `me` — each with a single consumer. Request dedup across components
   and an invalidation graph are the reasons to pay for it, and both have near-zero
   surface here.
4. **It caches at the wrong seam.** `persistQueryClient` caches at the hook layer. The
   sync engine is not a React hook and cannot read a hook-layer cache — but it must
   invalidate the right entries after a successful flush. Caching *inside the
   repository*, behind the port, makes the cache visible to the engine, to use-cases and
   to tests.
5. **The escape hatch is intact.** Because everything goes through
   `InspectionRepository`, TanStack Query could later be introduced *inside* the
   implementation without touching a single use-case or view-model.

**What we gave up, honestly:** window-focus refetch, automatic request dedup, and
cross-component cache sharing. Replaced by ~90 lines in `useAsyncData` plus
stale-while-revalidate in the repository decorator. **Revisit past roughly 10 query
surfaces with real cross-screen invalidation.**

`useAsyncData` takes an explicit `key` rather than a dependency array, which lets
loading and refreshing be *derived* by comparing it against the last settled key. That
removes both a ref written during render and a synchronous `setState` inside an effect —
two things the React 19 lint rules correctly flag as cascading-render hazards.

### Redux Toolkit — rejected

The `frontend-project-structure` convention names Redux for `infra/store/`, with the
parenthetical "(when needed)". It is not needed. There is exactly one piece of stateful
global state (the auth session, which gets a real Context) and one cross-cutting store
(the outbox and sync status). The latter is read through `useSyncExternalStore` over the
sync engine — the correct React 19 primitive precisely because the publisher is a plain
service class rather than a hook, and it is built in.

RTK Query would additionally collide head-on with the ports-and-repositories layering:
its endpoints *are* the repository, so you would either double-wrap or abandon the
convention.

---

## 10. Offline: always-outbox-first, and a tri-state connectivity signal

**Every write goes to IndexedDB before the network is touched.** No
`navigator.onLine` branch.

1. **One code path means one answer to "did it save?"** Branching gives four states, and
   the fourth — *online but actually offline* — is where data dies: the request leaves,
   the phone sleeps or the radio drops, and the record exists nowhere. Writing to
   IndexedDB first makes the worst case a duplicate *attempt*, which `client_uuid`
   idempotency already makes free.
2. "Pending" becomes a first-class, reachable, tested state rather than a rare branch
   nobody exercises.

The apparent cost — a "pending" chip even when online — is avoided by flushing in the
same user gesture, so the chip never paints on the happy path. Verified: online logging
shows "Inspection saved."; offline logging shows "Saved on this device".

**Connectivity is three states, not a boolean.** `navigator.onLine === false` is
trustworthy — no interface means no network. `true` is **not**: it is also true on a
captive portal and on plant Wi-Fi whose backhaul is down. So `true` only ever means
`unknown` until a real request proves otherwise. Evidence comes from request outcomes:
any HTTP response — *including a 500* — proves reachability, while a fetch rejection or
timeout disproves it. The `online` event is a hint to re-probe, never a fact; on a phone
it commonly fires before the radio can carry a request.

**The `NetworkError` / `ApiError` split is the hinge of the whole layer.** `fetch`
rejects only for network-level failure, a CORS rejection, or an abort — never for a
non-2xx status. So that one branch means exactly "the request did not complete", which
is precisely what should be retried. A response that arrived but was not our envelope is
an `ApiError`, not a `NetworkError`: we reached *something*, so retrying forever is
wrong.

One caveat this design depends on: **a CORS rejection is also a `TypeError` and is
indistinguishable from being offline.** That is why the app talks to the API same-origin
through a proxy. It is not hypothetical — the boilerplate's
`CORS_ALLOWED_ORIGINS=*` was in fact broken (`origin: ['*']` never matches, because the
`cors` package only takes its wildcard shortcut for the bare string `'*'`), and left
unfixed with absolute URLs the app would have believed it was permanently offline and
silently queued everything. Both the proxy and the one-line service fix are in place.

**Error classification answers two independent questions:** is this *item* doomed, and
is the *system* down.

| Outcome | Record | Loop |
|---|---|---|
| 2xx (201 or the 200 replay) | removed | continue |
| `NetworkError`, 5xx, 408, 429 | stays pending, `attempts+1`, backoff | **stop** |
| 401 | stays pending, **attempts NOT incremented** | **stop**, prompt re-login |
| Other 4xx | → `failed`, surfaced for edit/discard | continue |
| Our own contract error | retry, never dead-lettered | **stop** |

A 4xx must **never** retry: waiting cannot make the payload valid, and an infinite loop
is both a battery drain and *silent data loss*, because the user goes on believing it is
queued. The 401 row is the easy one to get wrong — an item flushed after the token
expired is not invalid, so consuming attempts would eventually destroy it for a reason
that has nothing to do with it.

**Reconnecting bypasses the backoff.** Only the periodic timer respects it. Backoff
protects a *failing server* from being hammered; a fresh connectivity signal, or a user
tapping "Sync now", is new information that makes the earlier failure irrelevant. This
was found by testing: without it, a supervisor with a working connection watched "Not
synced" for up to five minutes, which reads as the feature being broken.

**Background Sync API — not used.** iOS Safari has never shipped `SyncManager` (nor has
Firefox), and a plant phone fleet is mixed, so foreground-triggered sync is the only
design that works for everyone rather than a compromise. A second, sharper reason: a
service worker cannot read `localStorage`, where the JWT lives, so an SW-side flush would
mean duplicating the entire classification path inside the worker for one browser family.
The cost — the queue drains only while the app is open — is mitigated by flushing on
`visibilitychange`, so merely opening the app is enough, plus a persistent badge.

**The service worker precaches the app shell and nothing else.** IndexedDB works without
one; what a SW adds is that a cold load or pull-to-refresh with no network still boots
the app instead of showing the browser's offline page. On a phone that discards
backgrounded tabs, "reopen the app in a dead zone" *is* a cold load — the single most
likely offline scenario. Deliberately **no `runtimeCaching` for `/api`**: a second
HTTP-level cache would hand the repository a cached 200 it could not tell from a fresh
one, destroying the network-vs-HTTP distinction above. Verified against the production
build: the shell boots offline and a deep link resolves via `navigateFallback`.

**On a shared device, unsynced work is never silently discarded.** Every outbox and
cache record carries a user id, and all reads filter by the current user. On sign-out
with pending items the app blocks and asks, offering "Sync now" or "Sign out anyway —
they stay on this device". The **cache** is cleared on sign-out (a refetchable
convenience, and the privacy exposure); the **outbox** is not (it holds the only copy of
those inspections). Flushing them under the next user's token would misattribute the
defect, since `logged_by_user_id` is derived server-side from the token.

---

## 11. Module and layering boundaries

| Question | Decision | Why |
|---|---|---|
| A separate `users` module? | No — the user lives in `auth`, table `app.users` | One writer (the seeder) and three readers (login, `/me`, name resolution). A separate module means ~12 more files and a second DI site for that. The revisit trigger is a *second writer*. |
| How `inspections` gets display names | A narrow `USER_DIRECTORY` port exported by `AuthModule`, aliased to its repository with `useExisting` | The clincher is Interface Segregation with a security payload: `UserEntity` carries `password_hash` and must never cross a module boundary. A one-method port returning `{id, fullName, role}` makes leaking it structurally impossible. **Rejected a Sequelize association** — faster, but it makes one module's persistence adapter compile-time depend on another's, and establishing that in the boilerplate's first real feature would make "reach into other modules' models" the house pattern. The cost of avoiding it is one batched `WHERE id = ANY($1)` against a ~20-row table. |
| Where `plant_id` on an inspection comes from | The logging user, at insert time, stored on the row and never accepted from the request body | It is not a denormalisation of a mutable fact — it is the immutable fact of *where the defect occurred*. Joining to `users.plant_id` at read time would retroactively move last month's Surat defects when a supervisor transfers to Bhiwandi. Same reason an invoice stores the delivery address rather than joining to the customer's current one. |
| Soft delete / audit table | Neither | No endpoint deletes an inspection and none should — a defect register is append-only by nature, which is the point of replacing a bound book. Both mutations that exist are already fully audited on the row. `deleted_at` would put `AND deleted_at IS NULL` on every query for a capability nothing offers. `is_active` + `ON DELETE RESTRICT` handles offboarding better. |
| Where sync lives | `src/shared/offline/`, and it knows nothing about inspections | It is infrastructure consumed by more than one feature. The feature registers an `OutboxHandler` at composition time, which is Open/Closed (a new offline-capable write is a new handler, never an edit to the engine) and Dependency Inversion (the engine depends on the port). |
| Per-feature DI contexts | One `AppDIContext` plus per-feature selector hooks | The convention mandates `infra/di/` per feature. With three features whose dependencies are all boot-time singletons, three nested providers is overhead. Features still depend on their own slice, which is the property the convention protects. A conscious, documented deviation. |
| Use-case classes | Only where there is real orchestration | `erasableSyntaxOnly` bans constructor parameter properties on the frontend, so each class costs a field declaration plus an assignment. `LogInspectionUseCase` earns it (uuid → draft → enqueue → flush → interpret). A one-line pass-through does not; the view-model calls the port directly, which is still Dependency Inversion minus the empty wrapper. The SOLID guidance explicitly licenses this. |

---

## 12. UI decisions that are about this user, not taste

- **Bottom tab bar, not a hamburger.** The top-left corner of a 390×844 phone is the
  hardest point to reach one-handed, and the supervisor's other hand is on a fabric
  roll. A hamburger also buries the primary action behind a tap plus a read. Gloved
  hands need large, always-visible, spatially *stable* targets.
- **The two roles get different route tables, generated from the role** — not one table
  with guards. A route a role cannot use does not exist, so a stray URL redirects
  instead of rendering a dead-end "Forbidden" screen.
- **Severity is a segmented control of real radios, defect type a native `<select>`.**
  An iOS select costs tap → scroll → Done, three interactions for a three-option field;
  severity is the most consequential field and should be readable at a glance, and chips
  can be colour-coded. Five defect chips wrap awkwardly at 390px, so the split is by
  option count and consequence rather than a blanket rule.
- **Native `<input type="date">`.** It opens the OS widget the supervisor already knows,
  gets DD/MM ordering and localisation free, is keyboard and screen-reader accessible
  with no work, costs zero bundle, and its value is already `yyyy-mm-dd` — which *is*
  the wire format, so there is no parsing layer.
- **Resolve is a full-screen route, not a modal.** A mandatory multi-line note needs the
  keyboard, which eats ~45% of a 390px viewport and would clip a centred modal. The
  route survives a refresh and backgrounding, back means cancel, and there is room to
  restate *which* inspection is being resolved — the real risk in a modal showing only
  a note field.
- **Filters are a route rendered as a bottom sheet.** The route is what makes the Android
  hardware back button close the sheet instead of leaving the list. Filter state belongs
  in the URL anyway: the view becomes shareable, survives a refresh, and the cache key
  derives from the same canonical params.
- **Green means Resolved and nothing else,** so severity is red / amber / slate-blue
  rather than red/amber/green. Colour is never the only signal — the text label always
  carries the meaning too, because colour-blindness plus a dusty screen under plant
  lighting is a real combination.
- **Base font 16px.** Not only for room at 390px: any input rendering below 16px makes
  iOS Safari zoom the whole page on focus, which reads as a broken layout mid-form.
- **The confirmation message is honest.** Online: "Inspection saved." Offline: "Saved on
  this device — it will sync when you're back online." Never a bare "Saved" when the
  entry exists only locally. This one string is the most important trust affordance in
  the product.
- **Pending and failed look different.** Pending resolves itself given a connection;
  failed needs a human. Making them look alike would train the supervisor to ignore both.

---

## 13. Things fixed in the boilerplate, and why each was necessary

| Fix | Why it would have bitten |
|---|---|
| `CORS_ALLOWED_ORIGINS=*` never matched (`origin: ['*']`) | Every browser call was blocked, and a CORS rejection is indistinguishable from being offline — the app would have believed it was permanently offline and silently queued everything |
| `.env.example` said `PORT=3000` while compose maps 5000 | A new developer following the README gets an app listening on the wrong port with no error anywhere |
| No script to *run* seeders (`seeder:generate` existed, nothing executed them) | Blocked seeding outright |
| Swagger had no `.addBearerAuth()` | `/api/docs` could only exercise login; every other endpoint 401s with no way to supply a token |
| `test/app.e2e-spec.ts` asserted `'Hello World!'` on `GET /` | Already failing before this work: the route is `/api/v1` and the body is the envelope |
| Jest could not load the ESM-only Nest 12 packages | The entire test suite failed to run. Requires Node ≥ 24.9 **plus** `--experimental-vm-modules`; baked into the test scripts, with `make test` running them in the container |
| `#root { width: 1126px }` | A desktop-fixed, centre-aligned shell in a mobile-first app |
| Missing `viewport-fit=cover` | `env(safe-area-inset-bottom)` resolves to 0 and the bottom tab bar sits under the iPhone home indicator |
| `strict` absent from all three frontend tsconfigs | The repo's own TypeScript standards mandate it; free to enable before any code existed, unpayable later |

## 14. Bugs found by end-to-end testing

Recorded because each was invisible to typechecking and unit tests.

1. **React Router v8 + `createBrowserRouter` in `useMemo` under StrictMode.** The route
   table is derived from the role, so the router was rebuilt when the role resolved.
   StrictMode's double-invoked factory left `RouterProvider` holding a router whose
   initialization ran on a discarded instance: the layout rendered with a permanently
   empty `<Outlet />`, silently and with no warning. Fixed by using `useRoutes`, which
   has no router instance and no initialization step — and costs nothing, because this
   app uses no data-router features.
2. **The filters page dropped the query string.** `setSearchParams` applied the params to
   `/inspections/filters`, and the following `navigate('/inspections')` discarded them —
   so filters applied and then vanished from the URL, taking shareability and
   refresh-survival with them. Fixed by navigating with the query string in one call.
3. **`defect_type = 'other'` without remarks returned 500.** `@IsOptional()` makes
   class-validator skip every other validator on a property when the value is absent, so
   a sibling `@ValidateIf`/`@IsNotEmpty()` pair never ran and the DB CHECK caught it
   instead. Moved to the domain service, where the rule belongs.
4. **Reconnecting waited out the retry backoff** (see §10).
