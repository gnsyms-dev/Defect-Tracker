---
name: typescript-best-practices
description: TypeScript coding standards for this project's NestJS backend and React frontend — strict typing, no implicit any, DTO/interface conventions, import hygiene. Use whenever writing or reviewing any .ts/.tsx file in backend/ or frontend/.
---

# TypeScript Best Practices (NestJS + React)

Apply these whenever writing, editing, or reviewing TypeScript in this repo. Prefer fixing violations inline over just flagging them.

## Type safety

- Never use `any`. Use `unknown` and narrow it, a proper interface/type, or a generic.
- No non-null assertions (`!`) unless the invariant is enforced immediately above the line and it's commented why.
- No type assertions (`as`) to force a shape — fix the underlying type instead. `as const` for literal narrowing is fine.
- Enable and respect `strict` mode (`strictNullChecks`, `noImplicitAny`, etc.) — don't write code that only works because a strict flag is off.
- Prefer `interface` for object shapes that represent entities/DTOs/props; use `type` for unions, intersections, and mapped/utility types.
- Model illegal states as unrepresentable: use discriminated unions instead of optional fields that are only sometimes valid together.
- Use `readonly` on properties and arrays that shouldn't be mutated after construction.

## Imports & modules

- Use `import type { X }` for type-only imports (never mix runtime and type imports in one statement).
- No default exports for anything except React components — named exports everywhere else so refactors and grep stay reliable.
- No circular imports between modules (NestJS modules) or between frontend feature folders.

## NestJS specifics

- Every controller route parameter and body is a typed DTO class with `class-validator` decorators — never accept raw untyped `Request` bodies.
- Services take their dependencies via constructor injection typed to interfaces/abstract classes, not concrete implementations, so they stay mockable.
- Return types on public service and controller methods are always explicit — don't rely on inference across a module boundary.
- Use NestJS's built-in exception classes (`BadRequestException`, etc.) instead of throwing raw `Error`.

## React specifics

- Every component's props are a named `interface XProps`, not inline object types, not `any`.
- Type hook return values explicitly when the inferred type would be `any` or overly wide (e.g. custom hooks returning tuples).
- Event handlers use the correct React event type (`React.ChangeEvent<HTMLInputElement>`, etc.) — never `any`.
- No implicit children typing — if a component accepts children, type it explicitly via `PropsWithChildren` or an explicit `children` field.

## Error handling

- Don't swallow errors with empty catch blocks. Either handle, rethrow, or log with context.
- Async functions that can fail return a typed result or throw a typed/known error — avoid untyped rejected promises bubbling to generic handlers.

## Naming

- Types/interfaces/classes: `PascalCase`. Variables/functions: `camelCase`. Enum members: `PascalCase`.
- Boolean variables/props read as predicates: `isLoading`, `hasError`, `canSubmit` — not `loading`, `error`, `submit`.
