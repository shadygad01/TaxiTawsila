# Roadmap

**Status:** Draft v1.0 — Phase 1

This roadmap maps the 10 development phases defined in the project's master prompt to concrete milestones and exit criteria. Each phase gates the next: a phase is not "done" until its Quality Requirements (architecture review, tests, docs, security/performance review) are met — no phase is skipped for speed.

## Phase 1 — Research & Architecture *(this document set)*

**Deliverables:** PRD, System Architecture, Domain Model, ERD, Database Schema, API Specification, Folder Structure, Coding Standards, ADRs, Security Model, Threat Model, Risk Analysis, Deployment Strategy, Testing Strategy, Scalability Plan, Roadmap.

**Exit criteria:** all documents internally consistent, reviewed, and committed. No application code written.

## Phase 2 — Project Foundation

- Scaffold monorepo (`apps/`, `packages/`, `infra/`) per Folder Structure.
- Backend: NestJS skeleton with module stubs for every bounded context (empty domain/application/infrastructure/interface layers, wired but no business logic).
- Mobile: Flutter skeleton with Clean Architecture folder scaffolding.
- Admin Web: React skeleton with feature-folder scaffolding.
- Shared packages: `shared-contracts` with base enums/DTO scaffolding.
- CI/CD pipelines (lint, test, build) per Deployment Strategy §3.
- Formatting/linting configs (Coding Standards) enforced from the first commit.
- **Exit criteria:** empty apps build, lint, and deploy to staging successfully; CI green on a trivial PR.

## Phase 3 — Core Platform

- Identity & Auth module: guest session issuance, OTP/Google/Apple adapters, JWT issuance/refresh.
- Configuration module: versioned config aggregates (fare/trust/reward rule sets), admin CRUD.
- Permissions/RBAC module and guards.
- Logging, audit-log infrastructure, monitoring/health endpoints.
- Storage provider adapter (S3/MinIO).
- **Exit criteria:** a rider can obtain a guest session and register via at least one provider; an admin can log in with RBAC enforced; audit log captures a real mutation end-to-end.

## Phase 4 — Maps Platform

- `MapProvider`/`RoutingProvider`/`GeocodingProvider` ports + adapters (hosted OSRM/Nominatim + OSM tiles).
- Mobile map rendering integration (`flutter_map`).
- Route/distance/duration computation service used by Fare Engine (Phase 5).
- **Exit criteria:** given an origin/destination in Alexandria, the system returns a route, distance, and duration end-to-end through the abstraction layer.

## Phase 5 — Trip Platform

- Trip Engine (lifecycle: estimate → active → completed/cancelled).
- GPS Engine (mobile capture + offline buffering; backend ingestion).
- Fare Engine (rule-based `FareEstimationStrategy` against `FareRuleSet`).
- History & Statistics module.
- **Exit criteria:** full guest user flow (PRD §6) works end-to-end in staging: estimate, start, live-track, complete, actual fare recorded.

## Phase 6 — Trust Platform

- Trust Engine: `TrustSignalEvaluator` pipeline (GPS continuity, plausibility checks, duplicate/impossible-trip detection, spoofing indicators).
- Fraud/anomaly aggregate-behavior detection.
- Trust Review Queue (admin-facing).
- **Exit criteria:** every completed trip receives a trust verdict; adversarial test suite (Testing Strategy §2) passes; flagged trips reach the admin review queue.

## Phase 7 — Rewards Platform

- Points/Wallet module, reward ledger.
- Reward rule engine wired to `TripVerified` events.
- Reward Provider adapters (internal coupon engine first).
- Redemption flow requiring registration.
- **Exit criteria:** a verified trip grants points; a registered rider can redeem points for an offer; guest-to-registered promotion correctly carries over accrued points.

## Phase 8 — Advertising Platform

- Merchant and Campaign modules; geofencing/route/radius targeting.
- Campaign scheduling, priority, budget enforcement.
- Impression/click tracking, merchant analytics.
- **Exit criteria:** a pilot merchant campaign serves correctly targeted impressions during real trips, with accurate budget decrement and click tracking.

## Phase 9 — Administration Platform

- Complete the admin dashboard across all domains (users, trips, rewards, merchants, ads, heatmaps, reports, analytics, configuration, audit logs, monitoring, system health).
- **Exit criteria:** an operator can run day-to-day platform operations entirely through the admin dashboard without direct DB access.

## Phase 10 — Optimization

- Performance profiling, caching rollout (Scalability Plan §4), DB index/partition tuning.
- Security hardening pass and (recommended) third-party penetration test.
- Load/stress testing against Scalability Plan targets.
- Final documentation pass across all Phase 1 documents, updated to reflect actual as-built decisions.
- **Exit criteria:** platform meets non-functional targets (Scalability Plan §9) under simulated city-scale load; security review complete; MVP declared production-ready.

## Post-MVP Horizon (tracked, not yet scheduled)

- Additional Egyptian cities (enabled by City-scoped config, Scalability Plan §6).
- Additional reward/ad providers (enabled by Provider Abstraction, ADR-0003).
- ML-based fare prediction as an alternate `FareEstimationStrategy` (Architecture §10).
- Advertising billing (Phase 8+ deferred scope, pending legal/compliance review — Risk Analysis §4).

## Roadmap Governance

- This roadmap is a living document, revisited at the end of every phase.
- No phase begins implementation before its architectural review is complete; no phase is marked complete without passing its Quality Requirements (tests, docs, security/performance review) per the master prompt's engineering principles.
