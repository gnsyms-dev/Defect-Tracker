---
description: Scaffold a new backend module matching this project's established module convention
argument-hint: --name <module_name>
---

## Goal

Create a new NestJS module under `app/backend/src/modules/<kebab-name>/` — a **skeleton only**: correct folder layout, correct classes/interfaces, correct method **signatures**, but no real business logic. Every non-trivial method body is a `// TODO: ...` comment followed by `throw new Error('Not implemented');`. Do not invent business rules, fields, or validation beyond a minimal `id`. The one exception is the health-check endpoint — that one is real, working code, not a stub.

All modules live under `app/backend/src/modules/<kebab-name>/` — never directly under `app/backend/src/`.

**The `project-structure` skill's "Module folder structure" section is the source of truth for this module's shape** — the naming placeholders, every file's exact content, and how to register the module. Load that skill (via the Skill tool) before Step 3 and follow it exactly; don't look at any other module in the codebase for structure or style, and don't re-derive the templates from memory.

## Step 1 — Resolve the module name

Raw arguments: `$ARGUMENTS`

Extract the value following `--name`. If no `--name` flag is present but a single bare word was passed instead, use that word. If no name can be determined, stop and ask the user for one.

Derive `{{kebab-name}}`, `{{PascalName}}`, `{{camelName}}`, `{{UPPER_NAME}}`, and `{{snake_name}}` from the resolved name using the "Naming placeholders" table in the `project-structure` skill's "Module folder structure" section.

Confirm the resolved `{{kebab-name}}` with the user only if the derivation is genuinely ambiguous; otherwise proceed.

## Step 2 — Verify working directory

All paths below are relative to `app/backend/`. Confirm `app/backend/package.json` exists at that relative path from the repo root before writing files; run subsequent shell commands (tsc/build/lint) from `app/backend/`.

## Step 3 — Create the files

Create each file listed under the "File templates" heading of the `project-structure` skill's "Module folder structure" section, under `app/backend/src/modules/{{kebab-name}}/`, substituting the placeholders resolved in Step 1. Match the import path depth shown in each template exactly — it's already correct for this folder layout. Create every file the skill lists, including the two `.spec.ts` files — do not skip tests.

## Step 4 — Register the module

Follow the "Registering a new module" steps in the same skill section to wire `{{PascalName}}Module` into `app/backend/src/app.module.ts`.

## Step 5 — Verify

From `app/backend/`, run in order and fix any failures before finishing:

```
npx tsc --noEmit -p tsconfig.json
npm run build
npx oxlint src/modules/{{kebab-name}}
```

## Step 6 — Report

Print the created file tree, and remind the user:

- No migration was created — the `{{snake_name}}` table doesn't exist in any schema yet. See the skill's "Migrations, seeders, and configuration" section for how to add one.
- `type/{{kebab-name}}.enum.ts` and `type/{{kebab-name}}.error.message.ts` were **not** scaffolded — add them only once the module actually needs enums or defined error messages, alongside `{{kebab-name}}-repository.port.ts` in `type/`.
- Every method is a stub (`// TODO` + `throw new Error('Not implemented')`) — this is a skeleton, not a working module.
- The health-check endpoint is reachable at `/api/v1/{{kebab-name}}/health` once the app is running (the `api` prefix and `v1` version segment come from the app's global config in `main.ts`, not from this module).
