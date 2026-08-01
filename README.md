# Taxi Alexandria Platform (Taxi Tawsila)

The first intelligent digital platform dedicated to traditional Alexandria taxis — a **passenger-only** fare-estimation, live-tracking, and transportation-intelligence platform. Not a booking or dispatch app: there are no driver accounts, no driver communication, and no ride dispatching, by design.

Guests can estimate a fare, track a trip live, record what they actually paid, and earn rewards for verified trips — all without registering. Registration is only required for reward redemption, multi-device sync, and account recovery.

## Status

**Phase 1 (Research & Architecture) is complete; the architecture is frozen. Phase 2 (Project Foundation) is complete** — a production-grade engineering foundation (monorepo, CI/CD, shared packages, configuration platform, logging/monitoring/security foundations, testing infrastructure, database migration framework), with no business logic (fare estimation, trips, maps, GPS, tracking, rewards, advertisements) implemented yet, by design. See [`docs/21-phase2-foundation-audit.md`](docs/21-phase2-foundation-audit.md) for the verification. **Phase 3 does not begin automatically.**

See [`docs/`](docs/README.md) for the full architecture, domain model, database schema, API specification, security/threat model, and the 10-phase roadmap that governs how this platform gets built.

## Monorepo Layout

```
apps/
  backend/      NestJS modular monolith (10 bounded-context module stubs; only the
                configuration/admin/event-bus platform code has real logic — see
                docs/21-phase2-foundation-audit.md §1)
  admin-web/    React + Vite admin dashboard skeleton
  mobile/       Flutter app skeleton (structural only — unverified, no Flutter
                SDK in this environment; see docs/21-phase2-foundation-audit.md §6)
packages/
  shared-contracts/   Cross-app TS types: DTOs, domain events, branded IDs, Result type
  shared-config/      Shared ESLint/TypeScript/Prettier base configs
  testing-utils/      Shared test fixtures (live-Postgres test-database helper)
infra/
  docker/       docker-compose.yml (Postgres+PostGIS, Redis) for local dev
docs/           Architecture, ADRs, and this repo's living documentation set
```

## Prerequisites

- Node.js 22.x, pnpm (see `.nvmrc` / `package.json` `packageManager`)
- PostgreSQL 16 with PostGIS 3.4, and Redis — either via `infra/docker/docker-compose.yml` or a native install
- Flutter SDK (only if working on `apps/mobile`)

## Setup

```bash
pnpm install
cp .env.example .env   # then fill in DATABASE_*/REDIS_*/JWT_* values
```

Start local infrastructure (or point `DATABASE_*`/`REDIS_*` env vars at an existing instance):

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

Run database migrations (backend):

```bash
cd apps/backend
pnpm migration:run      # pnpm migration:revert to undo the last one
```

## Running

```bash
pnpm --filter @taxitawsila/backend start:dev     # backend, http://localhost:3000
pnpm --filter @taxitawsila/admin-web dev         # admin web dashboard
```

## Verifying

From the repo root, across every package:

```bash
pnpm -r lint
pnpm -r typecheck
pnpm -r test              # unit tests
pnpm -r build
```

Backend-specific checks:

```bash
cd apps/backend
pnpm arch:validate         # dependency-cruiser — architecture boundary enforcement
pnpm test:integration      # requires a running Postgres + migrations applied, and Redis
```

CI (`.github/workflows/ci.yml`) runs the same checks — `lint-typecheck-unit`, `architecture-validation`, `build`, `integration-tests`, `admin-web` — against real Postgres/Redis service containers on every push.

## Documentation

Start at [`docs/README.md`](docs/README.md). The repo-root [`CLAUDE.md`](CLAUDE.md) carries the always-loaded summary of the architecture-freeze and change-control policy for any future working session.

## Non-Negotiable Business Rules

This platform will never implement: taxi booking, driver accounts, driver communication, driver ratings, or ride dispatching. See the [PRD](docs/01-prd.md) for full scope.
