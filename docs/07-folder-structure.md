# Folder Structure

**Status:** Draft v1.0 — Phase 1

## 1. Monorepo Layout

A single monorepo (npm/pnpm workspaces + Melos for the Flutter package, orchestrated with Turborepo/Nx — tool choice finalized in Phase 2) hosts backend, admin web, mobile, and shared packages.

```
taxi-alexandria-platform/
├── apps/
│   ├── backend/                  # NestJS modular monolith
│   ├── admin-web/                # React admin dashboard
│   └── mobile/                   # Flutter app
├── packages/
│   ├── shared-contracts/         # Cross-app TS types: DTOs, domain events, Port interfaces
│   ├── shared-config/            # ESLint/TS/Prettier base configs
│   ├── ui-kit-web/                # Shared React components (admin)
│   └── testing-utils/            # Shared test fixtures/builders
├── infra/
│   ├── docker/                   # Dockerfiles per app
│   ├── docker-compose.yml        # Local dev stack (Postgres+PostGIS, Redis, OSRM, Nominatim, MinIO)
│   ├── k8s/                      # Kubernetes manifests/Helm charts (post-MVP)
│   └── terraform/                # IaC for cloud resources (post-MVP)
├── docs/                         # This documentation set (Phase 1 deliverables + living docs)
│   └── adr/                      # Architecture Decision Records
├── .github/workflows/            # CI/CD pipelines
├── package.json                  # Workspace root
├── turbo.json / nx.json
└── README.md
```

## 2. Backend (`apps/backend`) — NestJS Modular Monolith

Mirrors bounded contexts 1:1 (Domain Model, Architecture §1).

```
apps/backend/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── common/                       # Cross-cutting: filters, interceptors, decorators, guards
│   ├── modules/
│   │   ├── identity/
│   │   │   ├── domain/               # entities, value objects, domain services (framework-free)
│   │   │   ├── application/          # use cases / application services
│   │   │   ├── infrastructure/       # repositories (TypeORM), adapters (OTP/Google/Apple)
│   │   │   └── interface/            # controllers, DTOs, module definition
│   │   ├── trip/
│   │   │   ├── domain/
│   │   │   ├── application/
│   │   │   ├── infrastructure/
│   │   │   └── interface/
│   │   ├── trust/
│   │   │   ├── domain/                # TrustScoringEngine + TrustSignalEvaluator[] (pure, unit-tested heavily)
│   │   │   ├── application/
│   │   │   ├── infrastructure/
│   │   │   └── interface/
│   │   ├── reward/
│   │   ├── advertising/
│   │   ├── configuration/
│   │   └── admin/
│   ├── platform/
│   │   ├── maps/                     # MapProvider/RoutingProvider/GeocodingProvider ports + adapters
│   │   ├── notifications/            # NotificationProvider port + FCM adapter
│   │   ├── storage/                  # StorageProvider port + S3/MinIO adapter
│   │   ├── auth-providers/           # AuthenticationProvider port + Google/Apple/OTP adapters
│   │   └── event-bus/                # Internal domain event bus abstraction
│   └── config/                       # env schema validation, module wiring
├── test/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── migrations/                        # per-schema, ordered
└── nest-cli.json
```

Each module's internal layering (`domain → application → infrastructure/interface`) enforces dependency direction inward: `domain` has zero framework/Nest imports; `infrastructure`/`interface` depend on `domain`, never the reverse. This is what makes provider swaps and future service-extraction mechanical rather than a rewrite.

## 3. Mobile (`apps/mobile`) — Flutter Clean Architecture

```
apps/mobile/
├── lib/
│   ├── main.dart
│   ├── core/
│   │   ├── di/                        # dependency injection (get_it / riverpod providers)
│   │   ├── network/                   # API client, interceptors
│   │   ├── storage/                   # secure local storage (device_anon_id, JWT)
│   │   └── theme/
│   ├── features/
│   │   ├── trip_estimation/
│   │   │   ├── domain/                # entities, repository interfaces, use cases
│   │   │   ├── data/                  # repository impls, DTOs, API mapping
│   │   │   └── presentation/          # screens, widgets, state (Riverpod/Bloc)
│   │   ├── live_tracking/
│   │   ├── trip_completion/
│   │   ├── rewards/
│   │   ├── ads/
│   │   └── auth/
│   ├── platform/
│   │   ├── map_provider/              # MapProvider port + flutter_map/MapLibre adapter
│   │   ├── geolocation/                # GPS engine abstraction
│   │   └── push/                       # NotificationProvider port + FCM adapter
│   └── shared_widgets/
├── test/
│   ├── unit/
│   ├── widget/
│   └── integration/
└── pubspec.yaml
```

## 4. Admin Web (`apps/admin-web`) — React

```
apps/admin-web/
├── src/
│   ├── main.tsx
│   ├── app/                          # routing, layout shell
│   ├── features/
│   │   ├── riders/
│   │   ├── trips/
│   │   ├── trust-review/
│   │   ├── rewards/
│   │   ├── merchants/
│   │   ├── campaigns/
│   │   ├── analytics/
│   │   ├── configuration/
│   │   └── audit-logs/
│   │       # each: api/ (typed client calls), components/, pages/, hooks/
│   ├── shared/
│   │   ├── api-client/                # generated from OpenAPI
│   │   ├── components/
│   │   └── auth/                       # admin session/RBAC guard
│   └── styles/
├── test/
└── vite.config.ts
```

## 5. Shared Contracts (`packages/shared-contracts`)

```
packages/shared-contracts/
├── src/
│   ├── dto/                # request/response DTOs matching API spec
│   ├── events/              # domain event envelope + payload types
│   ├── ports/                # Provider interface definitions (documentation-grade contracts)
│   └── enums/                # shared enums (TripStatus, TrustVerdict, etc.)
```

## 6. Naming Conventions

- Files: `kebab-case.ts` / `snake_case.dart` (per-language idiom, see Coding Standards).
- Modules/classes: `PascalCase`. Interfaces prefixed by role, not `I` (`MapProvider`, not `IMapProvider`).
- Tests colocated under each app's `test/` mirroring `src/` paths; domain-layer unit tests are mandatory per module before any infra code is written.
