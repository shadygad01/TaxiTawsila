# Taxi Alexandria Platform — Documentation

This directory contains the Phase 1 (Research & Architecture) deliverables for the Taxi Alexandria Platform, as defined by the project's master prompt, extended with four mandatory platforms (Data Quality, Feature Management, Configuration, Fare Policy Engine), and hardened through a final Pre-Implementation Architecture Audit. **Phase 2 is authorized** (audit score 95.4/100 — see item 20 below). No application code existed prior to that authorization.

## Reading Order

1. [Product Requirements Document](01-prd.md) — vision, business rules, user flow, features, non-goals, supporting platforms
2. [System Architecture](02-architecture.md) — modular monolith, provider abstraction, tech stack, cost strategy, 10 bounded contexts
3. [Domain Model](03-domain-model.md) — bounded contexts, aggregates, domain events
4. [Entity Relationship Diagram](04-erd.md)
5. [Database Schema](05-database-schema.md) — PostgreSQL + PostGIS DDL, 10 schemas
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
19. [Platform Extensions](18-platform-extensions.md) — Data Quality, Feature Management, Configuration Platform, and Fare Policy Engine design (mandatory additions, added before Phase 2)
20. [Pre-Implementation Architecture Audit](19-pre-implementation-audit.md) — the final gate before Phase 2: first-principles audit across 9 categories, Critical/Medium/Minor findings, Technical Debt Forecast, and the Go/No-Go decision (95.4/100 — **Phase 2 authorized**)

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
| [0010](adr/0010-versioned-configuration.md) | Versioned, Append-Only Configuration (generalized by 0017) |
| [0011](adr/0011-transactional-outbox.md) | Transactional Outbox for Domain Event Delivery (revised by 0023/0024) |
| [0012](adr/0012-traffic-provider-fare-scope.md) | Traffic Provider & MVP Fare Scope |
| [0013](adr/0013-distributed-rate-limiting-config-cache.md) | Distributed Rate Limiting & Config Cache Invalidation |
| [0014](adr/0014-ad-serving-cadence-and-v1-simplification.md) | Ad-Serving Cadence & V1 Targeting Simplification |
| [0015](adr/0015-gps-ping-storage-design.md) | GPS Ping Storage & Indexing Redesign |
| [0016](adr/0016-reward-wallet-concurrency.md) | Reward Wallet Concurrency Control |
| [0017](adr/0017-unified-versioned-configuration-platform.md) | Unified Versioned Configuration Platform (generalizes 0010) |
| [0018](adr/0018-feature-management-platform.md) | Feature Management Platform |
| [0019](adr/0019-data-quality-platform-independence.md) | Data Quality Platform Independence & ML-Readiness Gate |
| [0020](adr/0020-manual-review-queue-workflow.md) | Manual Review Queue Workflow |
| [0021](adr/0021-fare-policy-engine-separation.md) | Fare Policy Engine Separated from Fare Estimation |
| [0022](adr/0022-explicit-provenance-metadata.md) | Explicit Provenance Metadata on Computed Values |
| [0023](adr/0023-event-envelope-versioning-ordering-idempotency.md) | Event Envelope Versioning, Ordering & Corrected Idempotency Keying |
| [0024](adr/0024-outbox-dead-letter-policy.md) | Outbox Dead-Letter Queue & Max-Retry Policy |
| [0025](adr/0025-reward-clawback.md) | Reward Clawback for Post-Hoc Fraud/Duplicate Discovery |
| [0026](adr/0026-dual-control-high-risk-configuration.md) | Dual-Control (Maker-Checker) for High-Risk Configuration & Kill Switches |
| [0027](adr/0027-distributed-tracing-correlation-ids.md) | Distributed Tracing & Correlation-ID Propagation |
| [0028](adr/0028-device-attestation-provider.md) | Device Attestation as a Formal Provider Abstraction |

ADRs 0011–0016 and the ADR-0009 amendment were produced by the Architecture Review (item 17 above). ADRs 0017–0022 were produced by the Platform Extensions revision (item 19 above). ADRs 0023–0028 were produced by the Pre-Implementation Architecture Audit (item 20 above) — the final remediation pass before Phase 2 was authorized.

## Non-Negotiable Business Rules (see PRD §3)

This platform is **passenger-only**. It will never implement taxi booking, driver accounts, driver communication, driver ratings, or ride dispatching. Any design or feature proposal must be checked against this constraint first.

## The Platform's 10 Bounded Contexts

Identity, Trip, **Fare Policy** *(new)*, Trust, Reward, Advertising, **Data Quality** *(new)*, Configuration, **Feature Management** *(new)*, Administration. See `03-domain-model.md` §1 and `18-platform-extensions.md` for why the three new contexts exist and how they relate to the original seven.

## Document Status

All documents are living documents, now through three revision passes (the Architecture Review, the Platform Extensions revision, and the Pre-Implementation Architecture Audit) — the Roadmap (§"Roadmap Governance") mandates a review pass at the end of every subsequent phase, updating documents to reflect as-built reality where implementation reveals a better approach (per the project's engineering principle: "whenever you discover a better architectural solution, stop, refactor the architecture if necessary, then continue").

**Phase 2 (Project Foundation) is authorized** as of the Pre-Implementation Architecture Audit's 95.4/100 re-score. See `19-pre-implementation-audit.md` for the full reasoning, the nine Critical findings that were closed to reach that score, and the remaining tracked-but-not-blocking items carried into the Roadmap's Post-MVP Horizon.
