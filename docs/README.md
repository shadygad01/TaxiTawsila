# Taxi Alexandria Platform — Documentation

This directory contains the Phase 1 (Research & Architecture) deliverables for the Taxi Alexandria Platform, as defined by the project's master prompt. No application code is written until these documents are reviewed and stable.

## Reading Order

1. [Product Requirements Document](01-prd.md) — vision, business rules, user flow, features, non-goals
2. [System Architecture](02-architecture.md) — modular monolith, provider abstraction, tech stack, cost strategy
3. [Domain Model](03-domain-model.md) — bounded contexts, aggregates, domain events
4. [Entity Relationship Diagram](04-erd.md)
5. [Database Schema](05-database-schema.md) — PostgreSQL + PostGIS DDL
6. [API Specification](06-api-specification.md) — REST resources per module
7. [Folder Structure](07-folder-structure.md) — monorepo layout
8. [Coding Standards](08-coding-standards.md)
9. [Architecture Decision Records](adr/) — indexed below
10. [Security Model](09-security-model.md)
11. [Threat Model](10-threat-model.md)
12. [Risk Analysis](11-risk-analysis.md)
13. [Deployment Strategy](12-deployment-strategy.md)
14. [Testing Strategy](13-testing-strategy.md)
15. [Scalability Plan](14-scalability-plan.md)
16. [Roadmap](15-roadmap.md) — phases 1–10 and exit criteria
17. [Architecture Review Report](16-architecture-review.md) — critical, adversarial review of every subsystem before Phase 2 begins
18. [Architecture Improvement Report](17-architecture-improvements.md) — prioritized action list derived from the review

## Architecture Decision Records

| ADR | Title |
|---|---|
| [0001](adr/0001-monorepo.md) | Single Monorepo |
| [0002](adr/0002-modular-monolith.md) | Modular Monolith Backend |
| [0003](adr/0003-provider-abstraction.md) | Provider Abstraction (Ports & Adapters) |
| [0004](adr/0004-postgres-postgis.md) | PostgreSQL + PostGIS |
| [0005](adr/0005-osrm-nominatim-cost-strategy.md) | OSRM + Nominatim over pay-per-request APIs |
| [0006](adr/0006-flutter-mobile.md) | Flutter for Mobile |
| [0007](adr/0007-nestjs-backend.md) | NestJS for Backend |
| [0008](adr/0008-trust-engine-isolation.md) | Trust Engine Isolation |
| [0009](adr/0009-auth-strategy.md) | Multi-Provider Auth, Guest-First Identity (amended: guest-merge rule, Apple-mandatory rationale) |
| [0010](adr/0010-versioned-configuration.md) | Versioned, Append-Only Configuration |
| [0011](adr/0011-transactional-outbox.md) | Transactional Outbox for Domain Event Delivery |
| [0012](adr/0012-traffic-provider-fare-scope.md) | Traffic Provider & MVP Fare Scope |
| [0013](adr/0013-distributed-rate-limiting-config-cache.md) | Distributed Rate Limiting & Config Cache Invalidation |
| [0014](adr/0014-ad-serving-cadence-and-v1-simplification.md) | Ad-Serving Cadence & V1 Targeting Simplification |
| [0015](adr/0015-gps-ping-storage-design.md) | GPS Ping Storage & Indexing Redesign |
| [0016](adr/0016-reward-wallet-concurrency.md) | Reward Wallet Concurrency Control |

ADRs 0011–0016 and the ADR-0009 amendment were produced by the Architecture Review (item 17 above), performed before Phase 2 began.

## Non-Negotiable Business Rules (see PRD §3)

This platform is **passenger-only**. It will never implement taxi booking, driver accounts, driver communication, driver ratings, or ride dispatching. Any design or feature proposal must be checked against this constraint first.

## Document Status

All documents are **Draft v1.0**, produced in Phase 1. They are living documents — the Roadmap (§"Roadmap Governance") mandates a review pass at the end of every subsequent phase, updating documents to reflect as-built reality where implementation reveals a better approach (per the project's engineering principle: "whenever you discover a better architectural solution, stop, refactor the architecture if necessary, then continue").
