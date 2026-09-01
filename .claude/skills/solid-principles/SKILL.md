---
name: solid-principles
description: SOLID design principles applied to this project's NestJS backend (modules, services, controllers) and React frontend (components, hooks). Use whenever designing a new module/service/component, splitting up an existing one, or reviewing architecture and class/component responsibilities.
---

# SOLID Principles (NestJS + React)

Apply these when designing new modules, services, controllers, components, or hooks, and when reviewing whether existing ones need to be split up. Prefer restructuring inline over just flagging violations.

## Single Responsibility

- A NestJS service has one reason to change: one business capability. If a service both does business logic and formats HTTP responses, or both queries data and enforces business rules, split it (e.g. separate the persistence concern into a repository).
- A controller only routes, validates input via DTOs, and delegates to a service — no business logic in controllers.
- A React component either renders UI or orchestrates data/logic, not both at any real complexity — extract data-fetching/state logic into a custom hook and keep the component focused on rendering.
- If a file's exports serve two unrelated callers for two unrelated reasons, split the file.

## Open/Closed

- Prefer adding new behavior via a new class/strategy/handler over branching (`if`/`switch` on a type) inside existing code. Use NestJS providers + interfaces (e.g. a `PaymentStrategy` interface with multiple implementations) so new variants are added, not existing ones edited.
- In React, prefer composition (children, render props, or config objects) over adding more conditional branches to an existing component for each new variant.

## Liskov Substitution

- Any implementation of an interface (e.g. a NestJS provider implementing an abstract class/interface) must be fully substitutable — don't narrow preconditions or throw "not implemented" for a subset of cases the interface promises to handle.
- Don't override a base class method in a way that changes its contract (return type semantics, thrown errors, side effects) from what callers of the base type expect.

## Interface Segregation

- Don't force a consumer to depend on methods it doesn't use. Split a fat service interface into smaller, role-specific interfaces (e.g. `UserReader` vs `UserWriter`) when different consumers only need one side.
- React prop interfaces should only include what that component actually uses — don't pass a whole entity object down when the component needs three fields; destructure at the call site.

## Dependency Inversion

- NestJS services depend on abstractions (interfaces/injection tokens), not on concrete low-level implementations (e.g. depend on an `EmailSender` interface, not directly on a specific SDK client) — this is also what NestJS's DI container is for; use it rather than `new`-ing dependencies inside a class.
- High-level business logic (services) must not import from low-level infrastructure details (specific ORM entities, HTTP clients) directly when an abstraction boundary exists for it — depend on the repository/port interface instead.
- In React, components that need external data depend on a hook/context abstraction, not directly on `fetch`/axios calls scattered inline — centralize data access behind hooks or a service layer.

## When reviewing

- Flag a class/component only when a principle violation would cause real pain (hard to test, hard to extend, hard to reuse) — don't force abstractions onto genuinely simple, stable code just to satisfy the letter of a principle.
