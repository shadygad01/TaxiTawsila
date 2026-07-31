# Coding Standards

**Status:** Draft v1.0 — Phase 1

## 1. General Principles

- Architecture boundaries (Domain Model, Folder Structure) are enforced by lint rules (e.g., `eslint-plugin-boundaries` / import-restriction rules), not just convention — a `domain/` file importing a Nest decorator or an HTTP client should fail CI.
- No business logic in controllers, widgets, or React components — they translate transport ↔ application-service calls only.
- Prefer composition over inheritance; prefer pure functions in domain logic (critical for Trust Engine testability).
- No TODOs left in merged code — either do it, file a tracked issue and reference the issue number, or don't write the comment.

## 2. TypeScript (Backend + Admin Web + Shared Packages)

- Strict mode always on (`strict: true`, `noImplicitAny`, `noUncheckedIndexedAccess`).
- ESLint (`@typescript-eslint`) + Prettier, enforced via pre-commit hook and CI gate — no formatting debates, no manual formatting.
- No `any`; use `unknown` + narrowing, or generics.
- Domain errors are typed (`Result<T, DomainError>` or typed exceptions caught at the interface layer) — never throw raw strings.
- DTOs validated at the boundary with `class-validator`/`zod`; never trust unvalidated input past the controller layer.
- Naming: `camelCase` variables/functions, `PascalCase` types/classes, `SCREAMING_SNAKE_CASE` constants, `kebab-case` filenames.
- One export concept per file where practical (a class/service per file).

## 3. NestJS-Specific

- Each module exposes a single `*.module.ts` with explicit `providers`/`exports` — no reaching into another module's providers via global scope.
- Provider Ports are `abstract class` or `interface` + Nest custom injection tokens (`Symbol` or string const), bound to concrete adapters in the module's providers array — never `new SomeAdapter()` inline in business code.
- Use Nest's built-in `Logger` (structured, injected) — no `console.log` in committed code.
- Guards/interceptors handle cross-cutting auth/RBAC/audit — not duplicated per controller.

## 4. Dart / Flutter

- `flutter_lints` (strict ruleset) enabled; `dart format` enforced pre-commit.
- Clean Architecture layering respected: `data` never imported from `presentation` directly — always through `domain` repository interfaces.
- State management: one consistent choice project-wide (Riverpod recommended — decided formally in an ADR before Phase 2 scaffolding), no mixing state-management paradigms across features.
- Null-safety: no `!` non-null assertions except where truly invariant-guaranteed and commented with the invariant.
- Widgets: prefer small, composable, stateless widgets; business logic lives in controllers/notifiers, never in `build()`.

## 5. React (Admin Web)

- Functional components + hooks only; no class components.
- TanStack Query (or equivalent) for server state — no manual `useEffect` fetch/caching reimplementation.
- Feature-folder structure (Folder Structure §4) — no cross-feature imports except through `shared/`.
- Accessibility: semantic HTML, keyboard navigation, and ARIA labels required for all admin data-grid/dashboard components (an internal tool is not exempt).

## 6. SQL / Database

- All schema changes via migrations, never manual DDL against shared environments.
- Every foreign key indexed; every geometry column has a GiST index if queried spatially.
- Append-only tables (see Database Schema §9) must never be targeted by `UPDATE`/`DELETE` in application code — enforced by DB role grants, not just discipline.
- No `SELECT *` in production code paths — explicit column lists.

## 7. Commit Conventions

- Conventional Commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `perf:`, `build:`, `ci:`.
- Scope module name where useful: `feat(trust-engine): add GPS continuity signal`.
- Commit body explains **why**, not what (diff shows what).

## 8. Code Review Checklist

Every PR must confirm:

- [ ] Domain logic has unit tests covering the change (and edge cases, especially for Trust Engine signals, Data Quality component evaluators, and Fare Policy rules).
- [ ] No architecture-boundary violations (domain importing infra/framework).
- [ ] No secrets, credentials, or PII in code, logs, or fixtures.
- [ ] API changes reflected in OpenAPI/shared-contracts and this spec doc if the contract shape changed.
- [ ] Database migrations are backward-compatible with the currently deployed app version (no destructive column drops in the same release that still reads them).
- [ ] Audit logging added for any new admin-mutating action.
- [ ] No new pay-per-request third-party dependency introduced without an ADR (Cost Strategy).
- [ ] **New computed value that feeds a downstream decision (fare, trust, quality, reward) has a provenance column and is logged in `platform.provenance_log`** (ADR-0022) — no exceptions without an explicit reviewer sign-off explaining why the value doesn't need reproducibility.
- [ ] **New business-rule config value is added as a versioned aggregate following the ADR-0017 shape** (append-only, `status`, `effective_from`, `rolled_back_from`, audit-logged), never as a mutable single-row setting. If it's a fraud/quality/trust-relevant threshold, it's designated **high-risk** and gets the `PENDING_APPROVAL` dual-control step (ADR-0026), not the plain `DRAFT`/`ACTIVE` flow.
- [ ] **(added, Pre-Implementation Audit §3) Any change to `TrustSignalEvaluator`/`DataQualityComponentEvaluator` scoring logic bumps `engine_version`** — CI fails the PR if scoring-logic files changed without a corresponding version bump; the entire reproducibility promise (ADR-0022) depends on this discipline being enforced, not remembered.
- [ ] **(added, Pre-Implementation Audit §2) New domain event published via the outbox has an explicit `event_version`, a `correlationId` sourced from the request context, and a named, idempotent consumer registered in `platform.event_consumption_log`** (ADR-0023) — never deduplicated on `(event_type, aggregate_id)` alone.
- [ ] **(added, Pre-Implementation Audit §8) No new numeric/timing constant that reads like a business rule is hardcoded in prose, an ADR, or application code** (e.g., a cadence, a batch size, a threshold) — it belongs in a versioned config aggregate (ADR-0017) unless it's a pure infra/ops setting (e.g., a cache TTL), in which case it's an environment variable, not a literal.

## 9. Testing Conventions

See Testing Strategy (`13-testing-strategy.md`) for the full pyramid; per-PR expectation:

- Domain/unit tests required for all new domain logic (target: near-100% coverage on `domain/` layers, especially Trust and Fare engines).
- Integration tests required for new API endpoints (spin up test DB via Testcontainers).
- No PR merges with a failing or skipped test in CI.

## 10. Documentation

- Every module has a short `README.md` describing its bounded-context responsibility and its Ports/adapters.
- ADRs (`docs/adr/`) are mandatory for: new external dependency, new cross-module contract, reversal of a prior architectural decision.
