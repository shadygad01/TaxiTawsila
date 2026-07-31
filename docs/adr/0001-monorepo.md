# ADR-0001: Single Monorepo for Backend, Mobile, Admin Web, and Shared Packages

**Status:** Accepted

## Context

The platform consists of a backend API, a Flutter mobile app, a React admin dashboard, and shared type contracts between them. These will evolve together constantly (e.g., an API DTO change must propagate to both mobile and admin clients in the same review).

## Decision

Use a single monorepo (`taxi-alexandria-platform`) containing `apps/backend`, `apps/mobile`, `apps/admin-web`, and `packages/*` shared libraries, orchestrated with a workspace tool (npm/pnpm workspaces + Turborepo/Nx for JS/TS; Melos for the Flutter package if it needs to consume shared Dart code).

## Consequences

- **Positive:** atomic cross-cutting PRs (API contract + both clients in one review), shared CI, single source of truth for contracts, simpler dependency version alignment.
- **Negative:** CI must be scoped (affected-package builds only) to avoid slow pipelines as the repo grows; requires investment in workspace tooling early.
- **Mitigation:** CI configured for path-based/affected-graph builds from day one (Phase 2).
