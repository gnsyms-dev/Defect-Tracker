---
name: project-structure
description: How this repo's folders are laid out and why — root layout, the monorepo/per-app Docker deployment model, the backend module skeleton under src/modules/<module-name>, and where migrations/seeders/config live and which of them is the source of truth for the DB schema. Use whenever creating new files, scaffolding a module, setting up Docker/CI, or answering "where does X live" / "how does deployment work" / "where do I find the current schema".
---

# Project Structure

This file documents the *why* behind the folder layout, not just the *what* — use it to decide where a new file belongs, and to explain the layout to someone unfamiliar with the repo. The "Module folder structure" section below is written to be self-contained so it can be lifted verbatim into other command files (e.g. a module-scaffolding command).

## Root folder structure

```
defect-tracker/
├── app/
│   ├── backend/     # NestJS API — see "Backend layout" below
│   └── frontend/    # React + TypeScript app (Vite) — see "Frontend layout" below
└── .claude/
    ├── commands/    # slash commands, all project-scoped
    └── skills/      # reusable reference docs (this file included)
```

`app/` splits the product into independently deployable apps rather than a single monolith — backend and frontend each get their own `package.json`, dependency tree, and toolchain. New apps (a worker, a CLI, an admin panel) would get their own sibling folder under `app/`, not a subfolder of `backend/` or `frontend/`.

### Backend layout (`app/backend/`)

```
app/backend/
├── .sequelizerc          # points sequelize-cli at src/config/database/sql/*
├── src/
│   ├── main.ts            # bootstrap: global prefix "api", URI versioning → routes are /api/v1/...
│   ├── app.module.ts       # root module: registers config/cors/database/telemetry + every feature module
│   ├── app.controller.ts   # root controller (not a feature — don't add feature routes here)
│   ├── config/             # cross-cutting infra config, one folder per concern
│   │   ├── cors/
│   │   ├── database/sql/   # DB connection + migrations/seeders — see below
│   │   ├── environment/    # EnvironmentVariables class + validation (all env vars are typed here)
│   │   ├── logger/
│   │   ├── swagger/
│   │   └── telemetry/
│   ├── modules/            # feature modules — one folder per bounded feature, see below
│   ├── shared/              # code reused across modules but not owned by any one feature (the ApiResponseDto response envelope, filters, interceptors)
│   └── i18n/                # translation JSON loaded by I18nModule
└── test/                    # e2e tests only — unit/integration specs live next to their source file
```

Rule of thumb: if a file is specific to one business feature, it goes under `src/modules/<feature>/`. If it's infrastructure every module might use (config, logging, exception handling), it goes under `src/config/` or `src/shared/`. Nothing feature-specific belongs directly under `src/`.

### Frontend layout (`app/frontend/`)

Scaffolded with Vite's `react-ts` template. Feature code follows the Clean Architecture layering documented in the **`frontend-project-structure`** skill — `application/` (domain entities, ports, use-cases, validators) vs `infra/` (di, repositories, dto/mappers, store, ui) per feature, with the Domain-First principle (map API responses to domain entities via mappers; never let API shape leak past the DTO/mapper boundary). Load that skill for the full layer breakdown and the `src/features/audit_logs/` reference implementation whenever scaffolding or reviewing a frontend feature.

## Monorepo & deployment model

*No Dockerfile or compose file exists in the repo yet as of 2026-09-01 — this section documents the deployment convention to follow when they're added, so new work stays consistent with it rather than inventing a different shape.*

This is a **monorepo, not a shared build** — `app/backend/` and `app/frontend/` each own their full toolchain independently (own `package.json`, lockfile, `tsconfig*`, lint config). There is deliberately no root-level `package.json` installing or building across both apps, and no shared `node_modules`. The two apps are versioned together in one git history for convenience, but everything about how they're built, tested, and shipped stays per-app.

**Development and production deploy as genuinely different container shapes — not the same Dockerfile toggled by a build arg — so each gets its own Dockerfile(s):**

### Production — one container per app

- **One Docker image per app.** `app/backend/Dockerfile` and `app/frontend/Dockerfile` (each not yet created) each use their own `app/<name>/` folder as the build context — never a single Dockerfile building both apps into one image. Coupling them into one build would force a frontend-only change to rebuild and redeploy the backend, and vice versa.
- **Multi-stage builds.** Each production Dockerfile should have a build stage (`npm ci`, `npm run build`) and a separate, slim runtime stage that copies in only the built output (`dist/` for the backend, the static build for the frontend) plus production `node_modules` — dev dependencies and build tooling never reach the runtime image.
- **The backend runtime image excludes migration tooling.** `sequelize-cli`, `src/config/database/sql/migrations/`, `.sequelizerc`, and `src/config/database/sql/config/config.js` must never be copied into the backend's final image (see the Migrations section below for why) — that's dead weight and unnecessary attack surface in a container that never runs migrations itself.
- **CI/CD builds and deploys each app's image independently**, keyed off changes under that app's own folder — a change under `app/frontend/` should never trigger a rebuild of the backend image or vice versa.

### Development — a single combined container

- **Backend and frontend run together in one container**, not as two separate containers the way production does. There's no local "backend container talks to frontend container" split to reproduce — dev is one process group (e.g. both apps started concurrently by a process manager or entrypoint script) inside a single image.
- Because that image needs both `app/backend/` and `app/frontend/` as build context, its Dockerfile is a **root-level** file — e.g. `Dockerfile.dev` — not a third file inside either app folder, unlike the two production Dockerfiles which each only need their own app's folder.
- It deliberately **skips production's multi-stage "slim runtime" split**: dev dependencies stay in, source is expected to be mounted as a volume for hot-reload, and the image is optimized for fast iteration, not size. That divergence from the prod images' contents is intentional, not a shortcut to "fix later."
- A local Postgres (and any other local-only service) is still wired up via a root-level `docker-compose.dev.yml` (or equivalent) — but the app side of that compose file is the single combined dev container above, not two separate per-app services the way a hypothetical prod compose file would be.
- **Migrations stay decoupled from container startup in development too** — run manually via the `npm run migrate:*` scripts documented below, not auto-run when the dev container boots. This rule isn't a production-only concern; see the Migrations section below.

## Module folder structure (`src/modules/<module-name>/`)

**This section is the source of truth for a feature module's shape.** Anything that scaffolds a module (e.g. a `new-module` command) should reference this section rather than re-embedding its own copy of these templates, so there's exactly one place to update when the convention changes.

Every feature module follows the same hexagonal (ports-and-adapters) layout, so business logic (`domain/`) never depends on how it's exposed (`api/`) or how it's persisted (`infrastructure/`) — only the reverse:

```
src/modules/<module-name>/
├── <module-name>.module.ts
├── domain/
│   ├── entities/<module-name>.entity.ts
│   └── services/
│       ├── <module-name>.service.ts
│       └── <module-name>.service.spec.ts
├── type/
│   ├── <module-name>-repository.port.ts
│   ├── <module-name>.enum.ts                 # only once the module actually needs an enum
│   └── <module-name>.error.message.ts        # only once the module actually needs named error messages
├── api/
│   ├── <module-name>.controller.ts
│   ├── <module-name>.controller.spec.ts
│   ├── dto/
│   │   ├── <module-name>-request.dto.ts
│   │   └── <module-name>-response.dto.ts
│   └── mapper/
│       └── <module-name>-api.mapper.ts
└── infrastructure/database/sql/
    ├── models/<module-name>.model.ts
    ├── mapper/<module-name>-persistence.mapper.ts
    └── repositories/
        ├── <module-name>.repository.ts
        └── <module-name>.repository.spec.ts
```

Why the split:
- **`domain/`** is the only place business rules live. It depends on `type/`'s port interface, never on a concrete repository or a Sequelize model — that's what keeps it testable without a database.
- **`type/`** holds the contract (`*-repository.port.ts` — interface + `Symbol` DI token) that both sides of the module agree on. It's owned by the domain, not by infrastructure, even though infrastructure is what implements it — this is what lets the persistence layer be swapped without touching business logic. It's also the natural home for a module's `.enum.ts` and `.error.message.ts` once it needs them — add those only when there's a real enum or a real set of error messages to name, not preemptively.
- **`api/`** and **`infrastructure/`** are both adapters plugged into `domain/`/`type/` from the outside. Neither imports the other directly.
- **`<module-name>.module.ts`** is the only file that wires the abstract port to its concrete implementation, via `{ provide: <TOKEN>, useClass: <Module>Repository }`.
- **`api/` controllers never return a raw value.** Every response — success or error — is wrapped in `ApiResponseDto` (`src/shared/dto/api-response.dto.ts`): `{ status: boolean, code: ResponseCode, message: string, data?: T }`. Build it with `ApiResponseDto.success(message, data?, code?)` or `.error(message, code?, data?)`, imported via the `@shared/...` path alias. `code` comes from `ResponseCode` (`src/shared/enums/response-code.enum.ts`) — each value is its HTTP status × 10 (e.g. `200 OK` → `'2000'`, `401 Unauthorized` → `'4010'`), leaving a spare digit for future sub-codes. Note this envelope is currently only applied at the controller-return level — `GlobalExceptionFilter`'s thrown-exception response shape hasn't been aligned to it yet.

### Naming placeholders

Given a module name, derive every casing below by splitting on `-`, `_`, spaces, and camel/Pascal-case boundaries, then reassembling:

| Placeholder | Casing | Used for | Example (`payment-gateway`) |
|---|---|---|---|
| `{{kebab-name}}` | kebab-case | folder name, file names, controller route prefix, Swagger tag | `payment-gateway` |
| `{{PascalName}}` | PascalCase | class/interface names | `PaymentGateway` |
| `{{camelName}}` | camelCase | variable/property names | `paymentGateway` |
| `{{UPPER_NAME}}` | UPPER_SNAKE_CASE | the DI token symbol | `PAYMENT_GATEWAY` |
| `{{snake_name}}` | snake_case, naively pluralized (`+s`, adjust by hand for irregulars like trailing `y` → `ies`) | the DB table name | `payment_gateways` |

### File templates

A new module's files are a **skeleton**: correct layout, correct classes/interfaces, correct method *signatures* — no invented business rules, fields, or validation beyond a minimal `id`. Every non-trivial method body is a `// TODO: ...` comment followed by `throw new Error('Not implemented');`. The one exception is the health-check controller endpoint below — that's real, working code, since it needs nothing implemented yet to prove the module is wired up.

#### `domain/entities/{{kebab-name}}.entity.ts`

```ts
export class {{PascalName}}Entity {
  constructor(
    public readonly id: string,
    // TODO: declare the remaining domain fields for {{PascalName}}
  ) {}
}
```

#### `type/{{kebab-name}}-repository.port.ts`

No import of `{{PascalName}}Entity` yet — the interface starts empty, so importing it now would be an unused import (lint error). Add `import { {{PascalName}}Entity } from '../domain/entities/{{kebab-name}}.entity';` once real methods are declared.

```ts
export const {{UPPER_NAME}}_REPOSITORY = Symbol('{{UPPER_NAME}}_REPOSITORY');

export interface {{PascalName}}RepositoryPort {
  // TODO: declare the persistence operations this module needs, e.g.:
  // findById(id: string): Promise<{{PascalName}}Entity | null>;
  // create(data: unknown): Promise<{{PascalName}}Entity>;
}
```

#### `domain/services/{{kebab-name}}.service.ts`

```ts
import { Inject, Injectable } from '@nestjs/common';
import { {{UPPER_NAME}}_REPOSITORY } from '../../type/{{kebab-name}}-repository.port';
import type { {{PascalName}}RepositoryPort } from '../../type/{{kebab-name}}-repository.port';

@Injectable()
export class {{PascalName}}Service {
  constructor(
    @Inject({{UPPER_NAME}}_REPOSITORY)
    private readonly {{camelName}}Repository: {{PascalName}}RepositoryPort,
  ) {}

  // TODO: add business logic methods here, delegating persistence to {{camelName}}Repository
}
```

#### `domain/services/{{kebab-name}}.service.spec.ts`

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { {{UPPER_NAME}}_REPOSITORY } from '../../type/{{kebab-name}}-repository.port';
import type { {{PascalName}}RepositoryPort } from '../../type/{{kebab-name}}-repository.port';
import { {{PascalName}}Service } from './{{kebab-name}}.service';

describe('{{PascalName}}Service', () => {
  let service: {{PascalName}}Service;

  beforeEach(async () => {
    const {{camelName}}Repository: {{PascalName}}RepositoryPort = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {{PascalName}}Service,
        { provide: {{UPPER_NAME}}_REPOSITORY, useValue: {{camelName}}Repository },
      ],
    }).compile();

    service = module.get({{PascalName}}Service);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
```

#### `api/dto/{{kebab-name}}-request.dto.ts`

```ts
export class Create{{PascalName}}Dto {
  // TODO: declare request fields with class-validator + @ApiProperty decorators
}

export class Update{{PascalName}}Dto {
  // TODO: declare request fields with class-validator + @ApiProperty decorators
}
```

#### `api/dto/{{kebab-name}}-response.dto.ts`

```ts
import { ApiProperty } from '@nestjs/swagger';

export class {{PascalName}}ResponseDto {
  @ApiProperty()
  id: string;

  // TODO: declare the remaining response fields
}
```

#### `api/mapper/{{kebab-name}}-api.mapper.ts`

```ts
import { {{PascalName}}Entity } from '../../domain/entities/{{kebab-name}}.entity';
import { {{PascalName}}ResponseDto } from '../dto/{{kebab-name}}-response.dto';

export class {{PascalName}}ApiMapper {
  static toResponseDto(_entity: {{PascalName}}Entity): {{PascalName}}ResponseDto {
    // TODO: map the domain entity to the response DTO
    throw new Error('Not implemented');
  }
}
```

#### `api/{{kebab-name}}.controller.ts`

Every module gets a default `GET /{{kebab-name}}/health` endpoint that simply returns success — real code, not a stub, and the fastest way to confirm the module is wired up and its routes are registered. It also demonstrates the required response envelope (see the "Why the split" section above) — every controller method returns an `ApiResponseDto`, never a raw value.

```ts
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiResponseDto } from '@shared/dto/api-response.dto';
import { {{PascalName}}Service } from '../domain/services/{{kebab-name}}.service';

interface HealthCheckData {
  readonly status: 'ok';
}

@ApiTags('{{kebab-name}}')
@Controller('{{kebab-name}}')
export class {{PascalName}}Controller {
  constructor(private readonly {{camelName}}Service: {{PascalName}}Service) {}

  @Get('health')
  healthCheck(): ApiResponseDto<HealthCheckData> {
    return ApiResponseDto.success('OK', { status: 'ok' });
  }

  // TODO: add route handlers (e.g. create, findOne, update, remove),
  // delegating to {{camelName}}Service, mapping results via {{PascalName}}ApiMapper,
  // and returning each one wrapped in ApiResponseDto.success(...)
}
```

#### `api/{{kebab-name}}.controller.spec.ts`

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { {{PascalName}}Service } from '../domain/services/{{kebab-name}}.service';
import { {{PascalName}}Controller } from './{{kebab-name}}.controller';

describe('{{PascalName}}Controller', () => {
  let controller: {{PascalName}}Controller;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [{{PascalName}}Controller],
      providers: [{ provide: {{PascalName}}Service, useValue: {} }],
    }).compile();

    controller = module.get({{PascalName}}Controller);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('reports success on the health-check endpoint', () => {
    expect(controller.healthCheck()).toEqual({
      status: true,
      code: '2000',
      message: 'OK',
      data: { status: 'ok' },
    });
  });
});
```

#### `infrastructure/database/sql/models/{{kebab-name}}.model.ts`

```ts
import { Column, DataType, Model, Table } from 'sequelize-typescript';
import type {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
} from 'sequelize';
import { SqlSchema } from '../../../../../../config/database/sql/sql-schema.constants';

@Table({ schema: SqlSchema.App, tableName: '{{snake_name}}', timestamps: true })
export class {{PascalName}}Model extends Model<
  InferAttributes<{{PascalName}}Model>,
  InferCreationAttributes<{{PascalName}}Model>
> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: CreationOptional<string>;

  // TODO: declare the remaining columns

  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}
```

#### `infrastructure/database/sql/mapper/{{kebab-name}}-persistence.mapper.ts`

```ts
import { {{PascalName}}Entity } from '../../../../domain/entities/{{kebab-name}}.entity';
import { {{PascalName}}Model } from '../models/{{kebab-name}}.model';

export class {{PascalName}}PersistenceMapper {
  static toDomain(_model: {{PascalName}}Model): {{PascalName}}Entity {
    // TODO: map the persistence model to a domain entity
    throw new Error('Not implemented');
  }
}
```

#### `infrastructure/database/sql/repositories/{{kebab-name}}.repository.ts`

```ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { {{PascalName}}RepositoryPort } from '../../../../type/{{kebab-name}}-repository.port';
import { {{PascalName}}Model } from '../models/{{kebab-name}}.model';

@Injectable()
export class {{PascalName}}Repository implements {{PascalName}}RepositoryPort {
  constructor(
    @InjectModel({{PascalName}}Model)
    private readonly {{camelName}}Model: typeof {{PascalName}}Model,
  ) {}

  // TODO: implement the methods declared on {{PascalName}}RepositoryPort
}
```

#### `infrastructure/database/sql/repositories/{{kebab-name}}.repository.spec.ts`

```ts
import { getModelToken } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';
import { {{PascalName}}Model } from '../models/{{kebab-name}}.model';
import { {{PascalName}}Repository } from './{{kebab-name}}.repository';

describe('{{PascalName}}Repository', () => {
  let repository: {{PascalName}}Repository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {{PascalName}}Repository,
        { provide: getModelToken({{PascalName}}Model), useValue: {} },
      ],
    }).compile();

    repository = module.get({{PascalName}}Repository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });
});
```

#### `{{kebab-name}}.module.ts`

```ts
import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { {{PascalName}}Controller } from './api/{{kebab-name}}.controller';
import { {{UPPER_NAME}}_REPOSITORY } from './type/{{kebab-name}}-repository.port';
import { {{PascalName}}Service } from './domain/services/{{kebab-name}}.service';
import { {{PascalName}}Model } from './infrastructure/database/sql/models/{{kebab-name}}.model';
import { {{PascalName}}Repository } from './infrastructure/database/sql/repositories/{{kebab-name}}.repository';

@Module({
  imports: [SequelizeModule.forFeature([{{PascalName}}Model])],
  controllers: [{{PascalName}}Controller],
  providers: [
    {{PascalName}}Service,
    { provide: {{UPPER_NAME}}_REPOSITORY, useClass: {{PascalName}}Repository },
  ],
  exports: [{{PascalName}}Service],
})
export class {{PascalName}}Module {}
```

### Registering a new module

Once a module's files exist, wire it into `src/app.module.ts`:

1. Add `import { {{PascalName}}Module } from './modules/{{kebab-name}}/{{kebab-name}}.module';`, grouped with the other local feature-module imports.
2. Add `{{PascalName}}Module` to the root `@Module(...)`'s `imports` array, alongside the other feature modules under `src/modules/` — before `I18nModule.forRootAsync(...)` if present, otherwise appended at the end of the array.

A freshly scaffolded module has no migration yet — its `{{snake_name}}` table doesn't exist in any schema until one is written (see the Migrations section below).

## Migrations, seeders, and configuration — where to read the DB schema

There are **two separate, independent config paths** to the same database — don't confuse them:

1. **The running app's connection**: `src/config/database/sql/sql-config.service.ts` (implements `SequelizeOptionsFactory`, reads `DB_*` vars via `ConfigService`/`EnvironmentVariables`) is wired into `sql.module.ts` → `database.module.ts` → `app.module.ts`. This is what NestJS uses at runtime. `synchronize` is off — the app never auto-creates or alters tables.
2. **The CLI's connection**: `.sequelizerc` (at `app/backend/` root) points `sequelize-cli` at `src/config/database/sql/config/config.js` — a plain CommonJS file (deliberately not TypeScript/ts-node, see below) that reads the same `DB_*` env vars directly via `dotenv`.

Both paths read the same `DB_HOST`/`DB_PORT`/`DB_USERNAME`/`DB_PASSWORD`/`DB_NAME`/`DB_SSL`/... vars (typed and validated in `src/config/environment/env.types.ts` + `env.validation.ts`, set in `.env`/`.env.example`), but they're two independent code paths — migrations are never run by the app process itself.

### Where the schema actually lives

- **`src/config/database/sql/migrations/`** — the source of truth. Each file is a sequelize-cli-generated, timestamp-ordered `.js` migration that describes exactly one schema change, and the migrations table in the DB tracks which have actually been applied. **This — not the model files — is what defines the real, current schema**, since a `.model.ts` can be hand-edited out of sync with what's actually been migrated.
- **`src/config/database/sql/seeders/`** — dev/reference data only, generated the same way. Never a source of schema.
- **`src/config/database/sql/config/config.js`** — the CLI's DB connection, used only by the `sequelize-cli` commands below, not by the app.
- **`src/config/database/sql/sql-schema.constants.ts`** — the `SqlSchema` const (e.g. `App = 'app'`) referenced by every model's `@Table({ schema: ... })`. To find where a given module's table actually lives, check its model's `@Table` decorator for `schema` + `tableName`, then cross-reference migrations touching that schema/table.

To inspect or change the schema, use the `npm` scripts in `app/backend/package.json` (all backed by `sequelize-cli`, run from `app/backend/`):

| Script | What it does |
|---|---|
| `npm run migrate:generate --name <name>` | Scaffold a new migration file |
| `npm run migrate:up` | Apply all pending migrations |
| `npm run migrate:down` | Revert the most recent migration |
| `npm run migrate:down:all` | Revert every migration |
| `npm run migrate:status` | Show which migrations have/haven't run — the quickest way to check current schema state against the DB |
| `npm run seeder:generate --name <name>` | Scaffold a new seeder file |

Migrations are intentionally decoupled from the app's own lifecycle: they never run automatically on boot, and migration tooling (`migrations/`, `.sequelizerc`, `config.js`, `sequelize-cli` itself) is meant to be excluded from the backend's Docker runtime image — migrations run as a standalone step (CI/CD or an operator, via the scripts above) directly against the target DB, before or independent of the app container.
